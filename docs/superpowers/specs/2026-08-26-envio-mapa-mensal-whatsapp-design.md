# Envio automático do Mapa Tributário por WhatsApp

**Data:** 2026-08-26
**Blueprint:** Step 15 (Envio automático do Mapa Tributário)
**Depende de:** Step 10 (infra n8n + Z-API já de pé), Step 1 (bug de geração do Mapa)

## Problema

O Mapa Tributário é entregue hoje só quando alguém do time abre o sistema,
exporta o PDF e manda na mão. Alcir quer entrega mensal automática, dia 5, pra
todo cliente ativo.

Três fatos do código e dos dados delimitam a solução (levantados em 26/08/2026):

1. **O PDF só existe no browser.** `src/lib/export-element-pdf.ts` usa
   `html2canvas` + `jsPDF` capturando um nó do DOM dentro de um Dialog Radix. Não
   há caminho server-side, não há bucket de Storage em uso, e o n8n não tem
   browser.
2. **Não há destinatário cadastrado.** Dos 94 clientes ativos: 0 com `whatsapp`,
   0 com `nome_contato`, 0 com `email`, 0 com `lead_id` vinculado. Os cadastros
   vieram das cargas de planilha sem dado de contato.
3. **A tela do Mapa é grande e faz dupla função.** `src/pages/MapaCreditos.tsx`
   tem 570 linhas, lê de 5 fontes (`clientes`, `v_mapa_creditos`,
   `compensacoes_mensais`, `processos_teses`, `creditos_apurados`) e **também
   edita** `creditos_apurados`.

## Aderência ao Step 15

| Task do blueprint | Nesta spec |
|---|---|
| 1. Cron mensal dia 5, clientes ativos | ✅ cron dias 5–10, janela comercial |
| 2. Edge function `send-mapa-monthly` | 🔀 substituída por workflow n8n (mesmo padrão do Step 10) |
| 3. Enviar por e-mail (template + PDF anexo) | ❌ **fora de escopo** — ver abaixo |
| 4. Enviar por WhatsApp | ✅ via Z-API (Step 12/WABA não é pré-requisito) |
| 5. Log em `mapa_envio_log` | ✅ e também como estado de idempotência |
| 6. Alcir recebe cópia interna | ✅ como resumo diário, não cópia por envio — ver abaixo |

**E-mail ficou fora por escolha de escopo (26/08).** Consequência a registrar: o
exit criteria do Step 15 é *"zero mapa manual necessário"* e a verificação é
*"100% dos clientes ativos recebem"*. Só WhatsApp **não atinge nenhum dos dois** —
alcança apenas quem tem `whatsapp` preenchido (hoje, zero). O e-mail existia no
blueprint justamente como o canal de cobertura, e o campo `clientes.email`
também está 100% vazio. Enquanto e-mail não entrar, o Step 15 não fecha.

**Cópia pro Alcir é resumo diário, não cópia por envio.** O blueprint diz "recebe
todos os envios como cópia". Ao pé da letra seriam 94 mensagens para ele no mesmo
dia — o que é ruim de ler e, ironicamente, é o próprio padrão de disparo em massa
que estamos tentando evitar. O resumo diário entrega a mesma informação
(quem recebeu, link, falhas) em uma mensagem. Se o Alcir quiser literalmente uma
cópia por cliente, é trocar um node — mas vale confirmar com ele.

## Decisões tomadas

| # | Decisão | Alternativa recusada | Por quê |
|---|---|---|---|
| 1 | Time preenche `whatsapp` na mão | Carga de planilha | Não existe planilha com esses contatos. Os campos já existem em `ClienteFormModal.tsx` — zero trabalho de UI. |
| 2 | Link público para página web | PDF anexado | PDF exigiria Chrome headless num serviço separado. Link resolve sem Storage e sem render service, e permite registrar acesso. |
| 3 | Cron diário dias 5–10, janela 08:00–18:00 | Execução única | 94 × 5–10 min = 7h45 a 15h30. Execução única mandaria mensagem de madrugada e perderia o estado se caísse. |
| 4 | Token permanente por cliente | Token por mês com validade | Escolha do cliente (26/08). Conveniência: link fixo, cliente pode salvar. Risco aceito: vazamento dá acesso vitalício — mitigado por `revogado_em` + contagem de acessos. |
| 5 | Z-API (não oficial) | WABA oficial | Escolha do cliente (26/08), com o espaçamento como controle de risco. |

### Sobre a decisão 5

O espaçamento de 5–10 min endereça sinal de **velocidade**. Os dois sinais que
mais derrubam número não são afetados por ele: **bloqueio/denúncia do
destinatário** e **envio para número sem WhatsApp**. O desenho ataca esses dois
diretamente (checagem `phone-exists`, flag `nao_enviar_mapa`, `limite_diario`).
Se o número cair, o que se perde é o canal com os clientes — não um relatório
interno. Migrar para WABA depois mexe só no node de envio.

## Arquitetura

```
Cron 08:00, dias 5-10 (America/Sao_Paulo)
  │
  ├─ RPC mapa_envios_pendentes(p_limite)
  │     ativo + whatsapp normalizável + sem sucesso na competência
  │     + nao_enviar_mapa = false, já com link montado
  │
  └─ Loop Over Items (batch 1)
        ├─ passou das 18:00?  → encerra (amanhã retoma)
        ├─ Z-API phone-exists → não tem WhatsApp? loga 'inelegivel', segue
        ├─ Z-API send-text
        ├─ log em mapa_envio_log (sucesso | falha)
        └─ Wait 300-600s aleatório → volta ao loop

  fim → resumo diário → ops + Alcir (enviados, falhas, inelegíveis)
```

Idempotência é garantida pelo **banco**, não pelo n8n: índice único em
`(cliente_id, competencia)` onde `status='sucesso'`. Se a execução morrer no meio,
o dia seguinte retoma sem duplicar ninguém.

## Banco

### `mapa_links`

```sql
cliente_id uuid not null unique references clientes(id) on delete cascade,
token text not null unique,          -- >= 32 bytes aleatórios
criado_em timestamptz not null default now(),
revogado_em timestamptz,
acessos int not null default 0,
ultimo_acesso_em timestamptz
```

`revogado_em` é o antídoto do token permanente: link vazou, revoga e gera outro
sem tocar em mais nada. `acessos`/`ultimo_acesso_em` tornam acesso anômalo
visível — sem eles, token permanente é risco cego.

### `mapa_envio_log`

```sql
cliente_id uuid not null references clientes(id) on delete cascade,
competencia date not null,           -- date_trunc('month', ...)
destinatario text not null,          -- número normalizado, como enviado
link text not null,
mensagem text not null,
status text not null check (status in ('sucesso','falha','inelegivel')),
zapi_response jsonb,
erro text,
executado_em timestamptz not null default now()
```

```sql
-- Idempotência do envio: ninguém recebe duas vezes na mesma competência.
create unique index ux_mapa_envio_sucesso
  on mapa_envio_log (cliente_id, competencia)
  where status = 'sucesso';

-- 'inelegivel' também é único por competência: o cliente volta pra fila todo
-- dia (o time pode corrigir o número no meio do mês), e sem isso o log
-- ganharia uma linha por cliente por dia até virar o mês.
create unique index ux_mapa_envio_inelegivel
  on mapa_envio_log (cliente_id, competencia)
  where status = 'inelegivel';
```

### `clientes.nao_enviar_mapa boolean not null default false`

Cliente pede pra parar de receber, o time marca, a automação respeita.

### RPC `get_mapa_by_token(_token text)` — pública

`SECURITY DEFINER`, read-only, executável por `anon`. Recebe token, devolve o
payload completo do Mapa num `jsonb`, incrementa `acessos` e grava
`ultimo_acesso_em`. Retorna vazio se `revogado_em` não é nulo. Espelha o padrão
já existente de `get_diagnostico_by_token`.

### RPC `mapa_envios_pendentes(p_limite int)` — `service_role`

Devolve quem falta na competência atual, já com link. Elegibilidade:

- `clientes.status = 'ativo'`
- `nao_enviar_mapa = false`
- `whatsapp` normalizável
- sem linha `sucesso` em `mapa_envio_log` na competência

A normalização vive **aqui**, não no n8n: tira não-dígitos, prefixa `55` quando
tem 10–11 dígitos, aceita 12–13 já com `55`, valida DDD, rejeita o resto. Fica
consistente com o `wa.me/55${whatsapp}` que `ClienteDetail.tsx:318` já usa, e
testável sem subir n8n.

Retorna também a contagem de **inelegíveis por cadastro incompleto** (ativos, sem
`nao_enviar_mapa`, mas com `whatsapp` vazio ou não normalizável). Esses nunca
entram no loop, então é a RPC que precisa contá-los — é o número que o resumo
usa pra cobrar o preenchimento do cadastro.

`p_limite` é o `limite_diario`: primeiro mês em 20/dia em vez dos ~80 que a
janela permite. Número novo em volume alto cai mais rápido que número aquecido.

## Frontend

O risco a evitar é duplicar 570 linhas de apresentação financeira — os números
que o cliente vê divergiriam dos que o time vê. Então:

1. Extrair o miolo de apresentação de `MapaCreditos.tsx` num componente
   read-only compartilhado.
2. Página autenticada (`/clientes/:id/mapa-creditos`) = componente + controles de
   edição de `creditos_apurados`, como hoje.
3. Rota pública nova `/mapa/:token` = componente + dados de `get_mapa_by_token`,
   sem edição. Registrada fora do `ProtectedRoute`, ao lado de
   `/diagnostico/:token` em `src/App.tsx`.

Mesmo componente nas duas pontas. Um só lugar pra mudar o Mapa.

## Mensagem

```
Olá, {nome_contato}! 👋

O Mapa Tributário da {empresa} referente a {mês/ano} está disponível:
{link}

Qualquer dúvida, é só responder por aqui.
— Equipe Focus FinTax
```

Termina convidando resposta de propósito: conversa de duas vias reduz o sinal de
"spam" que leva a bloqueio.

## Erros e observabilidade

- Falha em um cliente **não para a fila** — loga e segue. Um número ruim não pode
  bloquear os outros 93.
- Error handler do Step 10 reaproveitado para aborto de workflow.
- **Resumo diário** ao fim de cada execução, com enviados, falhas e
  **inelegíveis por cadastro incompleto**. Vai para dois destinos: ops
  (`ZAPI_DESTINO_OPS`) e Alcir (`ZAPI_DESTINO`) — este último é a "cópia interna"
  da task 6. Inclui a lista de empresas que receberam, com link.
- O número de inelegíveis é o que cobra o time a preencher o cadastro. Sem ele,
  campo vazio fica invisível e o envio parece "completo" cobrindo 3 de 94.

## Testes

- **SQL em Postgres efêmero**: normalização de telefone (10, 11, 12, 13 dígitos,
  DDD inválido, vazio, com máscara), `mapa_envios_pendentes`, `get_mapa_by_token`
  com token revogado, e reentrada após falha parcial. A normalização é testada
  aqui, e não em Vitest, porque vive em SQL (ver seção Banco).
- **Vitest** (`src/test/`): a derivação das linhas do Mapa, extraída de
  `MapaCreditos.tsx` para ser compartilhada entre a página autenticada e a
  pública. É o cálculo que não pode divergir entre o que o time vê e o que o
  cliente vê, então é o que mais precisa de teste.
- **Expressões n8n**: validadas em Node antes de entregar, como no Step 10.
- **Idempotência**: rodar a RPC duas vezes na mesma competência não deve
  retornar quem já teve sucesso.

## Fora de escopo

- Tratar resposta do cliente (inbound). O opt-out é manual via
  `nao_enviar_mapa` nesta versão; automatizar exige webhook Z-API e é trabalho
  próprio.
- Migração para WABA.
- Tela pra revogar/regerar token — nesta versão é `update` no SQL Editor.
- Preencher os 94 cadastros. É trabalho do time e **bloqueia o primeiro envio**.
- **Envio por e-mail com PDF anexo** (task 3 do Step 15). Precisa de render
  server-side do PDF — o mesmo problema que o link público contorna. É trabalho
  próprio, e é o que falta pro Step 15 fechar de verdade.

## Ordem de implementação

1. Migration: `mapa_links`, `mapa_envio_log`, `nao_enviar_mapa`, as duas RPCs
2. Testes SQL em Postgres efêmero
3. Extração do componente read-only do Mapa
4. Rota pública `/mapa/:token` + testes Vitest
5. Workflow n8n + validação das expressões
6. Teste ponta a ponta com 1 cliente real (número do time)

Passo 6 antes de qualquer envio em volume.
