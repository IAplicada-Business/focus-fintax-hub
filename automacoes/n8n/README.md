# Relatório Semanal WhatsApp (blueprint Step 10)

Toda sexta 08:00 BRT o n8n agrega a esteira + o funil e manda a lista por
WhatsApp pro Alcir. Propósito duplo do Step 10: visibilidade pra ele e pressão
pro time atualizar o sistema toda semana.

## Arquivos

| Arquivo | O que é |
|---|---|
| `relatorio-semanal-whatsapp.json` | Workflow principal (importar no n8n) |
| `relatorio-semanal-error-handler.json` | Workflow de erro — avisa quando o principal aborta |
| `supabase/migrations/20260826120000_relatorio_semanal_whatsapp.sql` | `relatorio_semanal_esteira()`, `weekly_report_log`, `clientes.motivo_parada` |
| `supabase/migrations/20260826130000_relatorio_semanal_hardening_grants.sql` | Fecha os grants pra só `service_role` executar/escrever |

Ambas as migrations **já estão aplicadas** no projeto `qzkqrhamqtchboxtwpnz`
(26/08/2026).

## Fluxo

```
Cron sexta 08:00 ─→ POST /rest/v1/rpc/relatorio_semanal_esteira ─→ Code: formata
                                                                        │
                                                                  Z-API send-text
                                                                  ┌─────┴─────┐
                                                           (saída 1)         (saída 2 = erro)
                                                        Envio confirmado?         │
                                                         ┌────┴────┐             │
                                                       sim        não ───────────┤
                                                  Log Sucesso            Log Falha ─→ Alerta Ops
```

Não há node Postgres nenhum: tudo é HTTP contra o PostgREST do Supabase.

### Por que RPC e não conexão Postgres

O node nativo do Supabase (e o PostgREST em geral) não faz `GROUP BY` sobre
tabela — e é por isso que a primeira versão deste workflow usava conexão direta
ao Postgres. Isso deixou de valer quando a agregação foi pra dentro de uma
**função SQL**: o PostgREST expõe função como RPC, então um `POST` resolve.

O que se ganha: nenhuma senha de banco guardada no n8n, nenhum host de pooler
pra descobrir, nenhum problema de IPv4/IPv6 (a conexão direta do Supabase é
IPv6-only sem o add-on de IPv4), e o log virou um `POST` de JSON — sem query
parametrizada, sem escapar vírgula e aspas da mensagem no SQL.

### Duas decisões de desenho que valem manter

- **A agregação mora no Postgres, não no Code node.** A função devolve um único
  `jsonb` com período, contagens e motivos. Isso garante que os números batem
  com `/esteira` e com o painel SLA (mesmas tabelas, mesma regra de atraso do
  `v_esteira_sla`), que tudo sai do mesmo snapshot, e que a agregação é testável
  com `select relatorio_semanal_esteira()` sem subir o n8n. Bônus: a função lê as
  etapas de `esteira_sla_config` em vez de hardcodar — quando `Encaminhar
  Financeiro` foi adicionada no banco, o relatório pegou sozinho.
- **A data vem do banco.** O período é calculado em `America/Sao_Paulo` dentro do
  SQL e volta no payload. O Code node não faz conta de data nenhuma — o n8n roda
  no timezone do container e recalcular ali é a forma mais fácil de o relatório
  sair com a semana errada.

## Setup

### 1. Credencial Supabase no n8n (única credencial de dados)

n8n → **Credentials → New → Supabase API**:

| Campo | Valor |
|---|---|
| Host | `https://qzkqrhamqtchboxtwpnz.supabase.co` |
| Service Role Secret | chave `service_role` do projeto |

A chave sai de **Supabase → Project Settings → API Keys**. Serve tanto a
`service_role` legada (JWT, começa com `eyJ...`) quanto uma secret key nova
(`sb_secret_...`) — a nova é preferível porque rotaciona sozinha, sem derrubar as
outras chaves.

Nome sugerido: `Supabase Focus FinTax`. Depois de criar, abrir os três nodes HTTP
que falam com o Supabase (`Agrega Relatório`, `Log Sucesso`, `Log Falha`) e
selecionar a credencial — eles vêm com `SUBSTITUIR_ID_CREDENCIAL_SUPABASE`.

**Nunca colar a chave direto no node.** A credencial do n8n injeta os headers
`apikey` e `Authorization` sozinha.

Sobre o alcance da chave: `service_role` ignora RLS, então ela é poderosa —
equivale a acesso de leitura/escrita a todo o schema `public` via API. O que
limitamos foi o outro lado: só `service_role` executa a função e escreve no log
(migration de hardening). Se quiser reduzir mais, o caminho é uma role Postgres
dedicada com conexão direta — mais seguro, mais setup, e aí voltam o host do
pooler e a senha.

### 2. Variáveis de ambiente do n8n (Z-API)

```bash
ZAPI_INSTANCE_ID=...            # Z-API → instância
ZAPI_TOKEN=...                  # Z-API → token da instância
ZAPI_CLIENT_TOKEN=...           # Z-API → Account Security Token (header Client-Token)
ZAPI_DESTINO=55219XXXXXXXX      # Alcir — DDI+DDD, só dígitos
ZAPI_DESTINO_OPS=5521XXXXXXXXX  # Mariana/ops — recebe os alertas de falha
```

Em self-hosted, `$env` no node exige que `N8N_BLOCK_ENV_ACCESS_IN_NODE` **não**
esteja `true`. Se o ambiente bloquear `$env`, trocar por n8n Variables (`$vars`)
— o resto do workflow não muda.

### 3. Importar e configurar

1. Importar `relatorio-semanal-error-handler.json` primeiro e salvar.
2. Importar `relatorio-semanal-whatsapp.json`.
3. Selecionar a credencial Supabase nos três nodes HTTP do Supabase.
4. **Settings → Timezone → `America/Sao_Paulo`.** Já vem no JSON, mas confirmar:
   o cron `0 8 * * 5` é interpretado nesse timezone. Sem isso o n8n usa UTC e
   "sexta 8h" vira 05:00 BRT.
5. Settings → Error Workflow → apontar pro error handler do passo 1.
6. Ativar.

### 4. Testar antes da sexta

- **Sem enviar nada:** "Execute step" até `Formata Mensagem` e ler a mensagem.
- **Envio real:** apontar `ZAPI_DESTINO` pro seu próprio número, "Test workflow",
  conferir que chegou e que `weekly_report_log` tem uma linha `sucesso`.
- **Caminho de falha:** estragar `ZAPI_TOKEN` de propósito e confirmar linha
  `falha` no log + alerta chegando no número de ops. Esse teste importa mais que
  o de sucesso — robô que falha calado é o risco real aqui.

Conferir a agregação a qualquer momento, sem o n8n:

```sql
select jsonb_pretty(public.relatorio_semanal_esteira());
```

Os números têm que bater com `/esteira` e com a aba SLA do dashboard. Se não
baterem, o problema está na função — não no n8n.

## Motivo de parada

Alcir pediu "motivo de parada" e havia dúvida se era texto livre ou derivado. A
migration atende os dois sem escolher:

- `clientes.motivo_parada` vazio → o relatório deriva do SLA:
  `"Além do SLA em Levantamento: 2 — pior caso 17d além do prazo"`.
- `clientes.motivo_parada` preenchido → esse texto substitui o derivado:
  `"Cliente não enviou XML: 1 — pior caso 12d além do prazo"`.

Ou seja: o relatório já funciona hoje sem ninguém preencher nada, e melhora
sozinho quando o time começar a preencher. **Não existe UI pra editar esse campo
ainda** — as policies de UPDATE em `clientes` (admin/gestor/pmo) já cobrem a
coluna quando a tela existir.

## Pendências (fora do código)

- Confirmar o número do Alcir e que a instância Z-API está pareada e estável.
- **Z-API vs WABA oficial.** O blueprint Step 10 prevê homologação de template
  WABA justamente porque envio fora da janela de 24h em número não-oficial é
  risco de ban — e um relatório semanal proativo é exatamente esse caso. A troca
  pra WABA depois mexe só no node `Z-API Enviar Texto`: a função SQL, o log e o
  formato da mensagem continuam iguais.

## Semântica das contagens

| Campo | Definição |
|---|---|
| `leads_semana` | Leads criados **ou** movidos de etapa entre seg e sex, excluindo `perdido`. Inclui quem virou `cliente_ativo` na semana (foi tratado). |
| `leads_em_andamento` | Foto de agora: leads ainda abertos no funil (exclui `perdido` e `cliente_ativo`). Etapas seguem `STAGE_MERGE_MAP` de `src/lib/pipeline-constants.ts`. |
| `esteira_por_etapa` | Clientes `ativo` por etapa da esteira + quantos passaram do SLA. Mesma regra do `v_esteira_sla`. Etapas lidas de `esteira_sla_config`. |
| `movimentacao_esteira_semana` | Clientes distintos que entraram em alguma etapa na semana (`esteira_historico.entrou_em`). É o número que denuncia semana sem ninguém atualizar nada. |
| `parados` | Clientes acima do SLA, agrupados por motivo (manual ou derivado). |

Pra reprocessar uma semana passada, mandar `{"p_referencia": "2026-08-14"}` no
body do RPC. Só os números de **fluxo** respeitam a data — os de **estoque** são
sempre a foto de agora, porque não há histórico de estágio de lead pra
reconstruir o funil de uma sexta passada.

Se as etapas do funil mudarem em `src/lib/pipeline-constants.ts`, os `CASE` de
`leads_por_etapa` na função precisam acompanhar.

---

# Envio mensal do Mapa Tributário (blueprint Step 15, WhatsApp + e-mail)

Todo dia 5 (com retomada até o dia 10), cada cliente ativo recebe uma mensagem
com link para o seu Mapa Tributário — por WhatsApp (Z-API) e por e-mail
(Resend), num único workflow. Versão minimizada de propósito (03/09/2026):
sem os nodes de segurança extra do desenho original, sem log de envio.

| Arquivo | O que é |
|---|---|
| `envio-mapa-mensal.json` | Workflow (único, os dois canais) |
| `supabase/migrations/20260826140000_envio_mapa_mensal.sql` | `mapa_links`, `mapa_envio_log`, `clientes.nao_enviar_mapa`, `normalizar_whatsapp`, `get_mapa_by_token` |
| `supabase/migrations/20260903080000_mapa_envios_pendentes_email.sql` | `mapa_envios_pendentes` passa a devolver `email` por cliente |
| `supabase/migrations/20260903090000_mapa_envios_pendentes_por_canal.sql` | Passo intermediário (canal por RPC) — superseded pela migration seguinte, fica no histórico |
| `supabase/migrations/20260903100000_mapa_envios_pendentes_unificado_sem_log.sql` | `mapa_envios_pendentes(p_limite)` — fila única, elegível por telefone OU e-mail |
| `scripts/test-envio-mapa.sql` + `scripts/stub-schema-mapa.sql` | Harness SQL (Postgres efêmero) — cobre o desenho original; não foi atualizado pra e-mail |
| `docs/superpowers/specs/2026-08-26-envio-mapa-mensal-whatsapp-design.md` | Spec original (WhatsApp) |
| `docs/superpowers/plans/2026-08-26-envio-mapa-mensal-whatsapp.md` | Plano de implementação original (WhatsApp) |

Todas as migrations acima **já estão aplicadas** no projeto
`qzkqrhamqtchboxtwpnz` (verificado com `mapa_envios_pendentes(3)` retornando
telefone + email por cliente).

## Fluxo

```
Cron 08:00, dias 5-10 (BRT)
  → POST /rpc/mapa_envios_pendentes  {p_limite: 20}
  → Separa Clientes (1 objeto → N itens)
  → Loop Clientes (batch 1)
       ├─ Monta Mensagem → Z-API Enviar → Espera 300-600s ─┐
       └─ Monta Email (HTML) → Resend Enviar               │
                                                              │
       (Z-API Enviar → Espera é quem fecha o loop de volta ←┘)
```

As duas saídas partem do mesmo item do loop — cada cliente pode receber os
dois canais na mesma volta, um por telefone e outro por e-mail, independente.
Só o ramo de WhatsApp fecha o loop (`Espera → Loop Clientes`); o ramo de
e-mail termina em `Resend Enviar` e não precisa realimentar nada.

`Monta Mensagem`/`Z-API Enviar` roda mesmo se `telefone` vier `NULL` (cliente
só-e-mail) — a chamada à Z-API é quem falha nesse caso, e o mesmo vale pro
inverso em `Monta Email`/`Resend Enviar` com `email` `NULL`.
`onError: continueRegularOutput` nos dois garante que essa falha esperada
(ou qualquer outra) não trava a fila.

**Não há PDF em nenhum dos dois canais.** O Mapa é entregue como link para
`/mapa/:token`, rota pública que lê a RPC `get_mapa_by_token`. O PDF do
projeto é gerado por `html2canvas` + `jsPDF` dentro do browser (ver
`src/lib/export-element-pdf.ts`) e não existe fora dele; o link resolve isso
sem Storage e sem Chrome headless.

## O e-mail (visual)

`Monta Email` gera HTML com CSS inline e layout em tabela (obrigatório pra
renderizar igual em Outlook/Gmail/Apple Mail). Paleta e tipografia batem com o
app: header navy (`#0a1564`) com o logo branco, CTA vermelho (`#c8001e`),
fundo creme (`#f6f4ee`), fonte Barlow com fallback web-safe (`Arial,
Helvetica, sans-serif` — cliente de e-mail não garante fonte customizada). O
logo é lido do domínio público (`focusfintax.com/images/...`), não de um
caminho do repo — e-mail não resolve asset relativo.

## Sem log de envio (decisão explícita, ver consequência abaixo)

`Log Envio`, `Log Envio Email`, `Log Inelegível`, `Busca/Monta Resumo` foram
tirados do workflow em 03/09/2026 — o histórico de execução do n8n já registra
o que foi tentado e a resposta de cada API, e manter também um INSERT em
`mapa_envio_log` por envio era redundante pra fins de auditoria.

**Efeito colateral aceito:** `mapa_envio_log` deixou de ser a fonte de estado.
`mapa_envios_pendentes` ainda tem a checagem `NOT EXISTS (... status =
'sucesso')`, mas como nada escreve na tabela, ela fica **inerte** — o mesmo
cliente pode ser devolvido pela RPC em mais de um dos dias 5-10, e por
consequência **pode receber a mesma mensagem/e-mail mais de uma vez no mês**
se o cron rodar em mais de um desses dias. Antes disso era o mecanismo que
permitia "roda 5 a 10, repetir é seguro" (ver nota no node `Dia 5-10 08:00
BRT`). Sem log, essa garantia não existe mais.

Também não há mais resumo (`Resumo → Alcir`/`Resumo → Ops`): sem o log, não
haveria dado nenhum pra contar.

Se/quando o log voltar: os inserts precisam só de `cliente_id`, `competencia`,
`status` (e, se quiser granularidade por canal, a coluna `canal` já existe em
`mapa_envio_log` desde a migration de 09:00 — `mapa_envios_pendentes` não
exige mais isso, mas a coluna não foi removida).

## Decisões que valem manter

- **Elegibilidade e telefone moram em SQL.** `normalizar_whatsapp` e
  `mapa_envios_pendentes` são regra de negócio, testáveis com
  `scripts/test-envio-mapa.sql` sem subir o n8n. `clientes.whatsapp` é guardado
  **sem** código de país (convenção de `ClienteDetail.tsx:318`, que monta
  `wa.me/55${whatsapp}`); o `55` é adicionado só no envio.
- **Falha de um cliente não para a fila.** `onError: continueRegularOutput` em
  ambos os envios.

## Sobre o risco de restrição

O espaçamento de 5–10 min no ramo WhatsApp cobre sinal de **velocidade** — o
que mais derruba número novo. Sem o node `Tem WhatsApp?` (removido nesta
versão minimizada) e sem o log, os outros dois mitigantes do desenho original
ficam mais fracos:

| Sinal | Mitigante hoje |
|---|---|
| Velocidade / disparo em massa | Wait aleatório 300–600s + `p_limite` diário |
| Envio para número sem WhatsApp | Nenhum — a Z-API falha na hora do envio, sem pré-checagem |
| Reenvio pro mesmo cliente em dias diferentes | Nenhum — depende do log, que está desligado |
| Bloqueio / denúncia do destinatário | Switch "Não enviar Mapa mensal" no cadastro do cliente (`nao_enviar_mapa`) |

`p_limite` começa em **20**. Subir só depois de um mês sem incidente.

## Setup

**Sem `$env`.** Este ambiente n8n não dá acesso pra configurar variável de
ambiente. Os placeholders `SUBSTITUIR_...` (Z-API instance/token/client-token,
Resend API key) ficam direto nos parâmetros dos nodes `Z-API Enviar` e
`Resend Enviar` — editar ali depois de importar.

**Nunca commitar o `.json` de volta no repo com os valores reais
preenchidos.**

1. Importar `envio-mapa-mensal.json`.
2. Preencher em `Z-API Enviar`: instance/token na URL, `Client-Token` no
   header (mesmos valores do relatório semanal — mesma instância Z-API).
3. Preencher em `Resend Enviar`: `Authorization: Bearer <chave>`, e conferir
   que o domínio do `from` (`mapas@focusfintax.com`) está verificado na
   Resend.
4. Selecionar a credencial Supabase (`Supabase Focus FinTax`) em
   `Busca Pendentes` — vem com `SUBSTITUIR_ID_CREDENCIAL_SUPABASE`.
5. Confirmar Settings → Timezone `America/Sao_Paulo`.
6. **Manter desativado** até o teste com um cliente só.

## Teste antes de ativar

```sql
-- Opt-out em massa ANTES de rodar, pra garantir que nada sai pra cliente real.
update public.clientes set nao_enviar_mapa = true where status = 'ativo';

-- Libera só um cliente, com O SEU número e/ou e-mail.
update public.clientes
   set whatsapp = '<seu numero com DDD>',
       email = '<seu email>',
       nome_contato = '<seu nome>',
       nao_enviar_mapa = false
 where id = '<id de um cliente ativo com linhas no mapa>';

select jsonb_pretty(public.mapa_envios_pendentes(20));  -- deve dar total_pendentes: 1
```

Rodar "Execute workflow", conferir a mensagem, o e-mail e o link. Sem log, não
há linha pra conferir no banco depois — a confirmação é o que chegou no
WhatsApp/caixa de entrada e o que o n8n mostrou na execução.

Reverter ao final:

```sql
update public.clientes set nao_enviar_mapa = false where status = 'ativo';
```

## Revogar um link

```sql
-- Mata o link atual (o cliente vê "Link indisponível").
update public.mapa_links set revogado_em = now() where cliente_id = '<id>';
-- Gera um novo no próximo envio.
delete from public.mapa_links where cliente_id = '<id>';
```

Acesso é observável: `mapa_links.acessos` e `ultimo_acesso_em`. É o que
compensa o token ser permanente.

## Fora de escopo

- **PDF anexo no e-mail.** O e-mail entrega o mesmo link que o WhatsApp, não
  um anexo — ver "Não há PDF" acima. Se isso virar requisito, é gerar o PDF em
  algum lugar (o `html2canvas`/`jsPDF` atual só roda no browser) e anexar via
  Resend, não um redesenho do fluxo.
- Tratar resposta do cliente (inbound), nos dois canais. O opt-out é manual no
  cadastro (`nao_enviar_mapa`, hoje único pros dois canais — se um cliente
  pedir "só pare o WhatsApp, mantenha o e-mail", vira coluna por canal).
- Tela para revogar/regerar token — hoje é SQL.
- Atualizar `scripts/test-envio-mapa.sql`/`stub-schema-mapa.sql` — o harness
  ainda cobre só o desenho original (WhatsApp, sem e-mail).
- **Log de envio / dedupe / resumo.** Removidos de propósito em 03/09/2026
  (ver seção acima) — não é que ninguém pensou nisso, é decisão consciente com
  reenvio possível como efeito colateral aceito.

---

# Notificação de compensação em tempo real (blueprint Step 12a)

Cada compensação lançada no sistema avisa o Alcir no WhatsApp, agrupada por
cliente/mês.

| Arquivo | O que é |
|---|---|
| `notificacao-compensacao.json` | Workflow |
| `supabase/migrations/20260826160000_notificacao_compensacao_tempo_real.sql` | trigger, log e RPC de payload |
| `scripts/test-notificacao-compensacao.sql` | Harness SQL |
| `docs/superpowers/specs/2026-08-26-notificacao-compensacao-tempo-real-design.md` | Spec |

## Fluxo

```
INSERT em compensacoes_mensais
  → trigger de STATEMENT (trg_notificar_compensacao)
       ├─ comando com > 10 linhas? não faz nada (é carga)
       ├─ já há pendência do cliente/mês nos últimos 2min? pula
       └─ net.http_post → webhook do n8n
  → n8n: valida x-webhook-token
  → Espera 60s
  → POST /rpc/notificacao_compensacao_payload  ← pega o grupo COMPLETO
  → Z-API send-text (ZAPI_DESTINO)
  → PATCH notificacao_compensacao_log
```

## Por que trigger de STATEMENT

É o ponto que define o desenho. A carga de 16/07 inseriu **364 linhas em 181
grupos cliente/mês**. Um trigger de linha — mesmo deduplicando por grupo — teria
disparado 181 webhooks e 181 mensagens de WhatsApp.

Vendo o comando inteiro (`REFERENCING NEW TABLE AS novas`), o trigger consegue
três coisas que um trigger de linha não consegue: contar as linhas do comando e
silenciar cargas, agrupar dentro do próprio comando (4 tributos num INSERT = 1
webhook), e disparar uma vez por grupo novo.

## Por que 60 segundos

Medido nos dados reais, excluindo as cargas: dos 94 intervalos entre lançamentos
consecutivos do mesmo cliente/mês, **79 estão abaixo de 60s e nenhum cai entre
60s e 2 minutos**. A distribuição é bimodal — ou o time lança tudo na mesma
sessão (mediana 19s), ou volta dias depois. Os 60s ficam no vazio da
distribuição; esticar para 5min captura 3 casos a mais e quadruplica a latência.

**Consequência assumida:** o "≤10s" do exit criteria do Step 12 não é atingível
com agrupamento. Entrega fica em ~1 minuto.

## O trigger nunca derruba um INSERT

Todo o corpo está dentro de `EXCEPTION WHEN OTHERS THEN RETURN NULL`. Vault
ausente, rede fora ou erro de configuração não podem impedir alguém de lançar
uma compensação — a notificação é acessório. Coberto por teste no harness.

## Setup

### 1. Segredos no vault (é isto que liga a automação)

Enquanto não existirem, o trigger **retorna sem fazer nada** — é seguro deixar
a migration aplicada antes de configurar.

```sql
select vault.create_secret('https://SEU-N8N/webhook/compensacao-registrada',
                           'n8n_webhook_compensacao_url');
select vault.create_secret('<token forte>', 'n8n_webhook_compensacao_token');
```

### 2. n8n

- Importar `notificacao-compensacao.json`
- Credencial `Supabase API` nos nodes `Busca Grupo` e `Marca Log`
- Variável `N8N_WEBHOOK_COMPENSACAO_TOKEN` com o **mesmo** token do vault
- Ativar (o webhook só existe com o workflow ativo)

O header `x-webhook-token` é validado no segundo node. Sem isso, quem descobrir
a URL dispara WhatsApp para o Alcir.

### 3. Testar

```sql
-- lança uma compensação de teste e acompanha
insert into compensacoes_mensais (cliente_id, processo_tese_id, mes_referencia, valor_compensado, tributo)
values ('<cliente>', '<processo>', '2026-08-01', 1000, 'INSS');

select * from notificacao_compensacao_log order by disparado_em desc limit 3;
```

Esperado: linha `pendente` na hora, virando `sucesso` ~60s depois. Se ficar
`pendente` para sempre, o n8n não recebeu — confira o token e se o workflow está
ativo.

## Fora de escopo

- Varredor de notificações perdidas (`enviado_em` nulo).
- **12b** — preferências por usuário (quem recebe o quê).
- **12c** — automatizar o comunicado *ao cliente*. O botão "Comunicado WhatsApp"
  de `CompensacoesTab` hoje só copia para a área de transferência, e é dirigido
  ao cliente (tem Pix, "Equipe Focus") — mensagem e destinatário diferentes
  desta notificação interna. Juntar as duas seria erro.

---

# Atendimento WhatsApp (blueprint Step 11)

Conversa de duas vias com o lead, dentro do sistema. Dois fluxos, porque têm
gatilhos e direções diferentes.

| Arquivo | O que é |
|---|---|
| `atendimento-receber.json` | Z-API → banco |
| `atendimento-enviar.json` | banco → Z-API |
| `supabase/migrations/20260826170000_atendimento_whatsapp.sql` | tabelas, triggers, RLS |
| `supabase/migrations/20260826180000_atendimento_conversa_rpc.sql` | RPC que a aba consome |
| `supabase/migrations/20260826200000_atendimento_registrar_entrada.sql` | RPC de entrada |
| `scripts/test-atendimento.sql` | Harness (16 grupos) |

## Receber

```
Z-API (on-message-received) → valida x-webhook-token
  → Extrai Mensagem  ← filtra o que NÃO é conversa
  → É mensagem? ─não→ fim
  → POST /rpc/atendimento_registrar_entrada
  → Bot ativo? ─→ [seam do bot, vazio]
```

**O filtro é o node que mais importa.** A Z-API manda no mesmo webhook:
confirmação de entrega, status de leitura, presença, e as mensagens que **nós**
enviamos (`fromMe: true`). Sem descartar, a tabela enche de lixo e a conversa
fica ilegível. Cobertos por teste: texto, imagem com legenda, áudio, documento,
`fromMe`, callback de status, sem telefone e payload vazio.

Uma chamada só ao banco: a RPC normaliza o telefone, resolve o lead e insere.
Se o n8n fizesse os três passos, seriam três lugares para divergir. Reenvio da
Z-API volta `inserida: false` — sem erro, sem duplicar (índice único em
`zapi_message_id`).

## Enviar

```
Webhook (disparado por trg_atendimento_envio) → valida token
  → Z-API send-text
  → PATCH status 'enviada' | 'falha'
```

O texto **já foi gravado pela UI** como `pendente`; este fluxo só muda o status
e guarda o id da Z-API. Existe porque o token não pode ir ao browser.

## Setup

### 1. Vault

Enquanto não existirem, o trigger de envio não faz nada — seguro aplicar antes.

```sql
select vault.create_secret('https://SEU-N8N/webhook/atendimento-enviar', 'atendimento_enviar_url');
select vault.create_secret('<token forte>', 'atendimento_webhook_token');
```

### 2. n8n

- Importar os dois workflows
- Credencial `Supabase API` em `Salva no Banco` e `Atualiza Status`
- Variável `ATENDIMENTO_WEBHOOK_TOKEN` com o **mesmo** token do vault
- Ativar os dois (webhook só existe com workflow ativo)

### 3. Z-API

Painel → Webhooks → **Ao receber** → URL do `atendimento-receber`.

Não configure "ao enviar" nem "status" apontando para cá — o filtro descarta,
mas é execução desperdiçada.

## O seam do bot

O node `Bot ativo?` no fim do receber é onde o robô pluga. Hoje a saída
verdadeira não vai a lugar nenhum, e é assim que deve ficar: a conversa aparece
na tela por realtime e o time responde.

Quando o prompt existir, o robô ainda precisa checar
`atendimento_conversas.bot_ativo` antes de falar — o default é `false`, e
resposta humana deve desligar.

## Fora de escopo

- Prompt e loop do bot.
- Player de mídia (a UI mostra rótulo com link).
- Atribuição de atendente, marcação de lida, busca no histórico.

## Bot SDR

O node `Bot ativo?` do `atendimento-receber` chama a edge function
`bot-sdr-responder`. A função consulta `bot_contexto`, e o banco decide se o
robô pode falar — a função não reimplementa regra nenhuma.

Ela pode responder `respondeu: false` com um motivo (`global_desligado`,
`conversa_desligada`, `teto_de_respostas`, `sem_mensagem_nova`, `recusado`).
**Isso não é erro** — silêncio é resposta válida.

### O que configurar

| Onde | O quê |
|---|---|
| Supabase → secrets | `ANTHROPIC_API_KEY` e, opcional, `BOT_SDR_TOKEN` |
| Node `Bot SDR` | header `x-webhook-token` = mesmo `BOT_SDR_TOKEN`, e a credencial Supabase |
| `/configuracoes/bot` | prompt, modelo, teto de respostas e o kill switch global |

O node tem `timeout: 120000` — o modelo pensa antes de responder e 30s não
basta. E `onError: continueRegularOutput`: se o bot falhar, a mensagem do lead
já está salva e aparece na tela para o time responder.

### Deploy

```bash
supabase functions deploy bot-sdr-responder
```
