# Fox — pendências aprovadas (16/jul/2026)

Pacote validado via mockups + checklist.

## SQL (rodar no Lovable)

Arquivo: `docs/sql/fox_pendencias_aprovadas.sql`

1. Enum `tributo` += `ICMS`
2. `security_invoker = true` em `v_mapa_creditos` e `v_cliente_totais_calculo`
3. Coluna `clientes.tese_ativa_id` + seed
4. Promove ICMS que estava em `outros`
5. Backfill FIFO de `tese_origem_id` (INSUMOS → SUBVENCAO)

## UI

| Item | Onde |
| --- | --- |
| Labels Compensado / Compensando / Não iniciado | `MapaCreditos.tsx` |
| Trocar tese em uso | `TrocaTeseAtivaModal` no header do cliente |
| ICMS tributo próprio | parser + `CompensacoesLinear` + enum |
| Valor crédito inline | `ProcessosTesesTab` |
| Import usa `tese_ativa_id` | `ImportFluxoCaixaModal` |
| Calculadora: cenário IR/CSLL fora | bloco comparativo em `Calculadora.tsx` (motor **não** alterado — aguarda racional Mariana) |

## Validação pós-SQL

```sql
SELECT c.empresa, t.label AS tese_ativa
FROM clientes c
LEFT JOIN teses_tributarias t ON t.id = c.tese_ativa_id
WHERE c.empresa ILIKE '%MARAVISTA%';

SELECT COUNT(*) FILTER (WHERE tese_origem_id IS NULL) AS sem_tese,
       COUNT(*) FILTER (WHERE tese_origem_id IS NOT NULL) AS com_tese
FROM compensacoes_mensais;

SELECT tributo_enum, COUNT(*) FROM compensacoes_mensais GROUP BY 1 ORDER BY 2 DESC;
```
