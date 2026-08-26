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
