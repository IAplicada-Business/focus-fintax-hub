# Fox — pendências aprovadas (16/jul/2026)

Pacote validado via mockups + checklist.

## SQL (rodar no Lovable) — **2 passos**

O Postgres não deixa usar o enum `ICMS` na mesma execução em que ele é criado (`ERROR 55P04`).

1. `docs/sql/fox_pendencias_aprovadas_passo1_icms_enum.sql` → Run  
2. `docs/sql/fox_pendencias_aprovadas_passo2.sql` → Run  

O passo 2 faz: `security_invoker` nas views, `tese_ativa_id`, promove ICMS, backfill `tese_origem_id`.

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
