# Carga direta das planilhas (sem importação pela UI)

SQL gerado a partir das planilhas **Atualizado Sistema** (Review Focus 08/jul/2026).

## Arquivo para rodar

`docs/sql/fox_carga_planilhas_fluxo_creditos.sql`

**Lovable Cloud → SQL Editor → colar tudo → Run**

## O que entra

| Fonte | Abas | Destino |
| --- | --- | --- |
| `Controle_creditos_FFinTax` | Detalhamento por Cliente | `clientes`, `creditos_apurados` (inicial + compensado manual + status) |
| `Financeiro Fintax` | Controle | `clientes`, `creditos_apurados` (créditos iniciais por tese) |
| `Financeiro Fintax` | fluxo caixa dez/25 … jun/26 | `compensacoes_mensais` + `dcomps` |

Abas ignoradas (mesmo critério do import da UI): Controle (como fluxo), Fluxo de caixa, Planilha1, RASCUNHO, `* (2)`.

## Volumes gerados

- 51 clientes
- 70 créditos da aba Controle (Financeiro)
- 58 linhas do Detalhamento (Rocinha ICMS_ST consolidado de 2 linhas → 1)
- 188 linhas de fluxo → ~400 lançamentos (cliente × competência × tributo; jun/26 agora em maio)
- 7 linhas de fluxo sem CNPJ (não entram)

## Observações

- Honorário grava só no **primeiro tributo** de cada linha da planilha (evita inflar soma no dashboard).
- `%` honorário normalizado para fração (`20` → `0.20`) — coluna `numeric(4,4)` exige valor &lt; 1.
- `tese_origem_id` fica NULL (igual ao import da UI). Os KPIs do mapa continuam usando `valor_compensado_manual` do Detalhamento até alguém vincular a tese.
- Parser aceita variante `novo_icms` (jun/26+: INSS | RETIDOS | PIS | COFINS | ICMS).
- **Competência:** o título R1 da aba manda sobre a coluna `Comp.` (evita cópia stale — ex.: jun/26 com Comp.=ABRIL e R1=MAIO).
- **Reporto:** nunca grava/exibe como compensado. Rodar também `docs/sql/fox_fix_reporto_competencia.sql` se a view antiga ainda somar Reporto no total compensado.

## Correção pós-carga (competência jun→maio + Reporto)

1. Rodar `docs/sql/fox_fix_reporto_competencia.sql` (zera compensado de REPORTO + recria views).
2. Re-rodar `docs/sql/fox_carga_planilhas_fluxo_creditos.sql` (regenerado com parser corrigido) para gravar maio/26 no lugar do abril errado da aba jun.

## Regenerar

```bash
npx tsx scripts/gerar-sql-carga-planilhas.ts \
  caminho/Financeiro.xlsx \
  caminho/Controle_creditos.xlsx \
  docs/sql/fox_carga_planilhas_fluxo_creditos.sql
```
