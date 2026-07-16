# Review Focus — 08/jul/2026 — Atualizações Fox

## Contexto

Call de orientação com João Victor (Fox / Focus FinTax) + Mariana. Anexos:

- Transcrição *Review Focus*
- `Controle_creditos_FFinTax - Atualizado Sistema.xlsx`
- `Financeiro Fintax - Atualizado Sistema.xlsx`

## Decisões da call (o que mudar)

| # | Pedido | Status no código |
|---|--------|------------------|
| 1 | Remover **Reporto** do cálculo automático / filtros principais | SQL + UI |
| 2 | Renomear **Crédito Assinado** → **Possíveis créditos** | UI |
| 3 | Reporto como **possíveis futuros** (não some do sistema) | SQL + UI |
| 4 | Cálculo padrão só **Insumos + Subvenção** | SQL |
| 5 | Checkbox por tese: incluir/excluir do cálculo financeiro | SQL + Mapa |
| 6 | Coluna **status** (já utilizado / em uso / a utilizar) | SQL + Mapa |
| 7 | Coluna **% honorário** + cálculo automático | Compensações |
| 8 | Filtro de **período** no total compensado | Header + Compensações |
| 9 | Atualizar valores da planilha (ex.: Maravista Subvenção **R$ 363.956,55**) | SQL |
| 10 | Manter lógica de competência/caixa (não alterar) | Sem mudança |

### Exemplo Maravista (planilha atualizada)

| Tese | Crédito inicial | Compensado | Saldo | Status |
|------|-----------------|------------|-------|--------|
| Insumos | 2.407.515,09 | 2.407.515,09 | 0 | utilizado |
| Subvenção | 3.376.449,69 | 363.956,55 | 3.012.493,14 | em_uso |

Crédito apurado no cálculo = 5.783.964,78 · Compensado = 2.771.471,64 · Saldo = 3.012.493,14

## SQL para rodar no Lovable / Supabase

Arquivo pronto (copiar e colar no SQL Editor):

`docs/sql/fox_review_focus_2026_07_08.sql`

Também versionado como migration:

`supabase/migrations/20260716140000_fox_review_focus_atualizacoes.sql`

### O que o SQL cria/altera

1. `teses_tributarias.incluir_no_calculo` — padrão `true` só para `INSUMOS` e `SUBVENCAO`
2. `creditos_apurados.incluir_no_calculo` + `status_utilizacao`
3. Upsert de `valor_apurado_inicial` e `valor_compensado_manual` (58 linhas da planilha)
4. Desativa REPORTO em `teses_tributarias` e `motor_teses_config`
5. Recria `v_mapa_creditos` com os novos campos
6. Cria `v_cliente_totais_calculo` (KPIs só das teses marcadas)

## Acesso ao banco nesta sessão

- Projeto Supabase: `klfpgpymgkfurylwpkrc` (Focus)
- MCP Lovable: **não autenticado** neste ambiente cloud
- MCP Supabase: org IAplicada **não tem** o projeto Focus (sem permissão `execute_sql` / `apply_migration`)
- REST anon: responde 200 mas RLS bloqueia leitura sem sessão

**Ação necessária:** rodar o SQL acima no Lovable Cloud → Database → SQL, ou no Supabase SQL Editor do projeto Focus.

## Validação sugerida (pós-SQL)

```sql
-- Maravista deve bater com a planilha
SELECT t.codigo, ca.valor_apurado_inicial, ca.valor_compensado_manual,
       ca.incluir_no_calculo, ca.status_utilizacao
FROM creditos_apurados ca
JOIN clientes c ON c.id = ca.cliente_id
JOIN teses_tributarias t ON t.id = ca.tese_id
WHERE regexp_replace(c.cnpj, '\D', '', 'g') = '30140610000151'
ORDER BY t.codigo;

SELECT * FROM v_cliente_totais_calculo v
JOIN clientes c ON c.id = v.cliente_id
WHERE regexp_replace(c.cnpj, '\D', '', 'g') = '30140610000151';
```
