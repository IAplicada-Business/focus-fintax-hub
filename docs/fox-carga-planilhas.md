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
- 59 linhas do Detalhamento
- 188 linhas de fluxo → 319 lançamentos (cliente × competência × tributo)
- 7 linhas de fluxo sem CNPJ (não entram)

## Observações

- Honorário grava só no **primeiro tributo** de cada linha da planilha (evita inflar soma no dashboard).
- `tese_origem_id` fica NULL (igual ao import da UI). Os KPIs do mapa continuam usando `valor_compensado_manual` do Detalhamento até alguém vincular a tese.
- Parser aceita variante `novo_icms` (jun/26+: INSS | RETIDOS | PIS | COFINS | ICMS).

## Regenerar

```bash
npx tsx scripts/gerar-sql-carga-planilhas.ts \
  caminho/Financeiro.xlsx \
  caminho/Controle_creditos.xlsx \
  docs/sql/fox_carga_planilhas_fluxo_creditos.sql
```
