# Notificação de compensação em tempo real (Step 12a)

**Data:** 2026-08-26
**Blueprint:** Step 12, tasks 1–3
**Depende de:** infra n8n + Z-API do Step 10

## Problema

Alcir quer saber quando uma compensação é registrada, sem abrir o sistema.

## Escopo

O Step 12 tem 6 tasks e pelo menos três são subsistemas separáveis. Esta spec
cobre só o núcleo:

| Task do Step 12 | Aqui |
|---|---|
| 1. Trigger pós-INSERT em `compensacoes_mensais` | ✅ (de statement, não de linha — ver abaixo) |
| 2. Edge function `send-whatsapp-notification` | 🔀 substituída por trigger + n8n |
| 3. Template "compensação registrada" | ✅ |
| 4. Preferências de notificação por usuário | ❌ fica para 12b |
| 5. Mapa por WhatsApp ao gerar | ❌ já coberto pelo Step 15 (envio mensal) |
| 6. Botão manual → automático | ❌ fica para 12c |

A task 6 merece nota: o botão "Comunicado WhatsApp" que existe hoje em
`CompensacoesTab` **não envia nada** — copia para a área de transferência — e é
dirigido ao **cliente** (tem Pix, "Equipe Focus"). A notificação desta spec é
**interna, para o Alcir**. Mensagens diferentes, destinatários diferentes, riscos
diferentes. Juntar as duas seria erro.

## Decisões

| # | Decisão | Alternativa recusada | Por quê |
|---|---|---|---|
| 1 | Agrupar por cliente/mês | Uma mensagem por linha | 96% dos lançamentos são de 1 linha, mas quando o time lança 4 tributos o Alcir receberia 4 mensagens. |
| 2 | Janela de 60s | 15s ou 5min | Medido: dos 94 intervalos reais entre lançamentos do mesmo cliente/mês, 79 estão abaixo de 60s e **nenhum** cai entre 60s e 2min. Os 60s ficam no vazio da distribuição. Esticar para 5min captura 3 casos a mais e quadruplica a latência; os 12 restantes estão a dias de distância. |
| 3 | Trigger de **statement** com transition table | Trigger de linha | Ver "Proteção contra carga". |
| 4 | Webhook direto (trigger → n8n) | Outbox + `pg_cron` | Webhook é o que foi pedido e dispensa polling. Custo aceito: n8n fora = notificação perdida. |

### O "≤10s" do blueprint não é atingível

O exit criteria do Step 12 diz "Alcir recebe WhatsApp em ≤10s". Agrupar exige
esperar para saber se vem mais linha. Com a janela de 60s a entrega fica em
~1 minuto. É troca consciente: menos mensagens, mais latência.

## Proteção contra carga

É o ponto que define o desenho. A carga de 16/07 inseriu **364 linhas em 181
grupos cliente/mês**. Deduplicar por grupo não ajudaria: seriam 181 webhooks e
181 mensagens.

Por isso o trigger é `AFTER INSERT ... REFERENCING NEW TABLE AS novas FOR EACH
STATEMENT`. Vendo o comando inteiro, ele consegue três coisas que um trigger de
linha não consegue:

1. **contar as linhas do comando** — acima de `LIMITE_CARGA` (10) não faz nada
2. **agrupar dentro do próprio comando** — 4 tributos num INSERT = 1 webhook
3. disparar uma vez por grupo novo

## Banco

### `notificacao_compensacao_log`

```sql
id uuid pk,
cliente_id uuid not null references clientes(id) on delete cascade,
mes_referencia date not null,
disparado_em timestamptz not null default now(),
enviado_em timestamptz,
destinatario text,
mensagem text,
status text not null default 'pendente'
  check (status in ('pendente','sucesso','falha')),
zapi_response jsonb,
erro text
```

Serve a três propósitos: é o estado da dedupe (o trigger consulta se já há
pendência recente), é onde o n8n grava o resultado, e é auditoria. Linha com
`disparado_em` preenchido e `enviado_em` nulo = notificação perdida, visível.

### Trigger

```
se count(novas) > 10        -> retorna (carga)
para cada (cliente, mes) distinto em novas:
  se existe log com disparado_em > now() - interval '2 minutes'  -> pula
  insere log 'pendente'
  net.http_post(url do vault, body {cliente_id, mes_referencia, log_id},
                headers {x-webhook-token: token do vault})
```

**O trigger nunca pode derrubar o INSERT.** Todo o corpo vai dentro de
`EXCEPTION WHEN OTHERS THEN RETURN`. Falha de vault, de rede ou de configuração
não pode impedir alguém de lançar uma compensação — a notificação é acessório.

`net.http_post` é assíncrono (enfileira e retorna), então não segura a transação.

### `notificacao_compensacao_payload(p_cliente_id uuid, p_mes date)`

RPC `service_role` que devolve o grupo completo para o n8n montar a mensagem:
empresa, tese, competência, linhas por tributo, total compensado, total de
honorários e o rótulo de percentual.

O rótulo reusa a mesma regra de `formatPercentualHonorarios` (lista todos os
percentuais distintos) — senão esta mensagem repetiria o bug corrigido em
`e9c973d`, exibindo "15%" num mês que tem 15% e 20%.

### Segredos

`vault.secrets`: `n8n_webhook_compensacao_url` e `n8n_webhook_compensacao_token`.
Lidos pelo trigger via `vault.decrypted_secrets`. Nada hardcoded em migration,
que vai para o git.

O n8n valida o header `x-webhook-token`. Sem isso, quem descobrir a URL dispara
WhatsApp para o Alcir.

## Fluxo n8n

```
Webhook (POST, valida x-webhook-token)
  → Wait 60s
  → POST /rpc/notificacao_compensacao_payload
  → Code: monta mensagem
  → Z-API send-text (ZAPI_DESTINO)
  → PATCH notificacao_compensacao_log (sucesso | falha)
```

A espera de 60s é o que faz o agrupamento funcionar: quem chega nesse intervalo
não dispara webhook novo (a pendência já existe) e a consulta pós-espera pega
todos.

## Mensagem

```
💰 Compensação registrada

MARAVISTA COMERCIO DE ALIMENTOS
Subvenção de ICMS — AGO/2026

• INSS: R$ 186.493,76
• COFINS: R$ 62.634,96
• PIS: R$ 13.459,78

Total: R$ 263.956,62
Honorários: R$ 43.398,23 (15% e 20%)
```

## Testes

- **SQL em Postgres efêmero**: carga de 11 linhas não dispara; 4 linhas do mesmo
  cliente/mês geram 1 pendência; segunda inserção dentro de 2min não duplica;
  clientes diferentes no mesmo comando geram pendências separadas; falha de
  vault não derruba o INSERT.
- **Expressões n8n** validadas em Node, como nos workflows anteriores.
- **Ponta a ponta**: lançar 1 compensação de teste e conferir a mensagem.

## Fora de escopo

- Varredor de notificações perdidas (`enviado_em` nulo). Aceito por ora: o n8n
  não deve ficar fora, e a perda é visível no log.
- 12b (preferências) e 12c (comunicado ao cliente).
