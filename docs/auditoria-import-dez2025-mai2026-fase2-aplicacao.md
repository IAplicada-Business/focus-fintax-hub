# Auditoria de compensações — Fase 2: correções aplicadas em 2026-08-12

Complemento a [`auditoria-import-dez2025-mai2026.md`](./auditoria-import-dez2025-mai2026.md) e
[`auditoria-import-dez2025-mai2026-fase2-diagnostico.md`](./auditoria-import-dez2025-mai2026-fase2-diagnostico.md).

Aplicado com aprovação explícita do time, escopo confirmado antes da execução. Nenhuma linha
foi deletada — apenas `UPDATE` de `valor_compensado`/`observacao` por `id` exato.

## O que foi alterado

### REUNIDOS — abr/2026 (valores atualizados conforme planilha atual)

A planilha `Importar Sistema - FinTax RE.xlsx` (aba `fluxo caixa maio 2026`, competência
abr/2026 real) trazia valores menores do que os importados em 16/07/2026. Atualizado para
refletir a planilha vigente:

| Tributo | Valor anterior (R$) | Valor novo (R$) | id |
|---|---|---|---|
| INSS_52 | 2.461.802,32 | 848.058,33 | `ac2b24a6-e19a-4166-ae4d-07597ffeafd1` |
| INSS_retidos | 77.726,65 | 26.148,80 | `acc730d5-ae68-4311-98e7-d0f1a6c21d9e` |
| PIS | 27.608,94 | 13.271,38 | `eef3d885-d9c7-4cd3-8861-3c4186ae1a25` |
| COFINS | 127.168,51 | 61.128,81 | `c4dad764-8359-48b1-8162-fe5d23c0aca4` |

Total do mês: de R$ 2.694.306,42 para **R$ 948.607,32** — agora bate 100% com a planilha.

### SUPERMERCADOS FEIRA NOVA LTDA e COMERCIAL DE ALIMENTOS PRIMUS (FILIAL) — zeradas e depois revertidas

Essas 4 linhas foram zeradas (não deletadas) na primeira rodada, com `observacao` explicando o
motivo — e **revertidas para o valor original logo depois**, a pedido explícito do time. Estado
final: **inalterado em relação ao início da auditoria** (`valor_compensado` e `observacao` de
volta ao que estavam antes de qualquer ação desta fase):

| Empresa | Mês | Tributo | Valor (mantido) | id |
|---|---|---|---|---|
| SUPERMERCADOS FEIRA NOVA LTDA | 2026-01 | outros | 897.672,59 | `1181b9ce-d69a-4c64-96c8-ea376232ab45` |
| SUPERMERCADOS FEIRA NOVA LTDA | 2026-02 | outros | 340.788,89 | `a6cac79b-78e0-4fd1-89b9-68afcb1dad15` |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 2026-01 | outros | 12.616,09 | `c5ba199f-c8b8-4aef-a0a2-f70c4433d370` |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 2026-02 | outros | 12.760,99 | `4d230f4f-95a6-419e-9af2-287e9124b780` |

O diagnóstico da causa raiz (linhas órfãs de import de 30/03/2026, ver
[fase2-diagnostico](./auditoria-import-dez2025-mai2026-fase2-diagnostico.md)) continua válido —
essas 2 combinações cliente/mês seguem 🟡 INCOERENTE em relação à planilha atual. Nenhuma ação
foi mantida sobre elas; aguardando nova decisão do time sobre como tratar.

## Efeito no total compensado

| Cliente | Mês | Total anterior (R$) | Total novo (R$) | Planilha (R$) |
|---|---|---|---|---|
| REUNIDOS | 2026-04 | 2.694.306,42 | 948.607,32 | 948.607,32 ✅ |
| SUPERMERCADOS FEIRA NOVA LTDA | 2026-01 | 1.238.461,48 | 1.238.461,48 (revertido) | 340.788,89 🟡 |
| SUPERMERCADOS FEIRA NOVA LTDA | 2026-02 | 340.788,89 | 340.788,89 (revertido) | 0,00 🟡 |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 2026-01 | 12.616,09 | 12.616,09 (revertido) | 0,00 🟡 |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 2026-02 | 12.760,99 | 12.760,99 (revertido) | 0,00 🟡 |

Só REUNIDOS ficou corrigido nesta rodada. FEIRA NOVA e PRIMUS FILIAL voltaram ao estado
original — seguem 🟡 INCOERENTE, pendentes de nova decisão. O caso FJC (dez/25) permanece
reclassificado como 🟢 (ver diagnóstico), lançamento legítimo vinculado a processo de tese,
sem necessidade de correção.

## O que ainda está pendente (sem dados/decisão)

- `segmento` vazio em 14 clientes — falta o valor real de cada um.
- Qual CNPJ de "REZENDE ALIMENTOS CDD LTDA" é o correto (`28732157000120` vs `28782157000120`).
- Competência maio/2026 continua sem fonte comparável — falta a aba "fluxo caixa junho 2026".
- ~~O bug de "mapa"/saldo em lançamentos manuais de julho/2026 reportado pela Focus Fintax
  (telas em anexo) — investigação ainda não iniciada; falta identificar o cliente das telas.~~
  Resolvido — cliente identificado (Supermercado Liberdade) e corrigido, ver
  [fase3-mapa-liberdade](./auditoria-import-dez2025-mai2026-fase3-mapa-liberdade.md).
