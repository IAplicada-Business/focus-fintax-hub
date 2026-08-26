# Honorários da carga legada — meses para conferência

**Levantado em:** 26/08/2026
**Origem dos dados:** migrations `20260716160000_fox_carga_planilhas_fluxo_creditos.sql` (16/07) e carga de 06/05

## Resumo para quem só vai ler isto

**Nenhum valor de honorário está errado no sistema.** O que está errado, em alguns
meses, é o **percentual** exibido — o campo que diz a que taxa aquele valor foi
cobrado.

A causa: a planilha de origem tinha **um honorário por cliente/mês**. O sistema
modela **uma linha por tributo**. A carga gravou o honorário do mês inteiro na
primeira linha e deixou as demais nulas. Somando o mês, o valor bate; olhando
linha a linha, não bate. E o Mapa Tributário soma o mês — por isso o dinheiro
que o cliente vê está correto.

| Situação | Meses | Ação |
|---|---|---|
| Percentual já confere | 136 | nada |
| Percentual corrigido automaticamente | 5 | ✅ feito (migration `20260826150000`) |
| **Grupo A — taxa derivada impossível (>25%)** | **18** | **conferir contra a planilha** |
| **Grupo B — taxa derivada fora das contratuais** | **21** | **confirmar se é mês de taxa mista** |

Os 5 corrigidos derivavam exatamente para 20% e foram atualizados **apenas no
campo de percentual**. Nenhum `honorario_valor` foi alterado.

---

## Grupo A — taxa derivada impossível (18 meses)

Aqui a divisão `honorário ÷ compensado` dá uma taxa que não existe em contrato
nenhum. **A hipótese mais provável não é cobrança indevida: é que faltam linhas
de compensação no mês.** O honorário veio completo, o compensado não — então a
divisão infla.

Os quatro primeiros casos mostram isso de forma gritante: honorário maior que o
próprio valor compensado.

| Cliente | Comp. | Linhas | Compensado | Honorário | % gravado | Taxa derivada |
|---|---|---|---|---|---|---|
| MERCADO 24 HORAS DA ROCINHA | 01/2026 | 1 | 256,85 | 3.514,38 | 12,5% | **1368,26%** |
| REZENDE ALIMENTOS JPA | 02/2026 | 1 | 841,50 | 2.805,87 | 12,5% | **333,44%** |
| REZENDE ALIMENTOS CDD | 01/2026 | 1 | 1.274,14 | 1.840,74 | 12,5% | **144,47%** |
| REZENDE ALIMENTOS NOVA HOLANDA | 01/2026 | 1 | 1.853,70 | 1.365,78 | 12,5% | **73,68%** |
| MARAVISTA COMERCIO DE ALIMENTOS | 03/2026 | 3 | 838.557,53 | 376.752,42 | 20% | 44,93% |
| SUPREMO | 12/2025 | 2 | 127.534,37 | 49.933,84 | 20% | 39,15% |
| PADARIA JANDRES | 02/2026 | 1 | 15.663,29 | 5.421,16 | 20% | 34,61% |
| COMERCIAL DE ALIMENTOS PRIMUS | 03/2026 | 2 | 43.833,96 | 13.963,53 | 20% | 31,86% |
| SUPERMERCADO COURTS | 01/2026 | 1 | 43.868,49 | 13.267,31 | 20% | 30,24% |
| MERCADO UNIÃO DE NOVA BRASILIA | 02/2026 | 1 | 7.306,73 | 2.178,07 | 20% | 29,81% |
| UNIÃO DA FAMILIA MERCEARIA | 02/2026 | 1 | 9.143,04 | 2.687,64 | 20% | 29,40% |
| REUNIDOS | 04/2026 | 4 | 948.607,32 | 269.430,64 | 10% | 28,40% |
| SHOPPING D CARNE BOI DE OURO | 03/2026 | 2 | 12.768,37 | 3.543,64 | 20% | 27,75% |
| SUPERMERCADO COURTS | 02/2026 | 1 | 58.074,82 | 15.863,04 | 20% | 27,31% |
| MARAVISTA COMERCIO DE ALIMENTOS | 05/2026 | 4 | 250.372,61 | 67.500,02 | 15% | 26,96% |
| SUPREMO | 01/2026 | 1 | 34.521,09 | 9.178,38 | 20% | 26,59% |
| SUPREMO | 02/2026 | 1 | 33.925,27 | 8.523,44 | 20% | 25,12% |
| SUPERMERCADO COURTS | 12/2025 | 2 | 65.036,49 | 16.296,35 | 20% | 25,06% |

**O que perguntar ao Focus:** nesses meses, o valor total compensado bate com a
planilha? Se não bater, o conserto é reimportar o mês — não mexer no percentual.

---

## Grupo B — taxa derivada fora das contratuais (21 meses)

Taxas entre 13% e 25%, plausíveis como honorário, mas que não caem exatamente em
10/12,5/15/20/25%. A hipótese aqui é **mês de taxa mista** — tributos diferentes
cobrados a taxas diferentes no mesmo mês, como já confirmamos existir na
MARAVISTA (INSS a 15%, PIS/COFINS a 20%).

| Cliente | Comp. | Linhas | Compensado | Honorário | % gravado | Taxa derivada |
|---|---|---|---|---|---|---|
| UNIÃO DA FAMILIA MERCEARIA | 01/2026 | 1 | 8.505,02 | 2.109,40 | 20% | 24,80% |
| SUPERMERCADO ECONOMICO JJ | 01/2026 | 1 | 122.421,26 | 30.311,13 | 15% | 24,76% |
| MERCADO UNIÃO DE NOVA BRASILIA | 01/2026 | 1 | 6.738,45 | 1.582,05 | 20% | 23,48% |
| SUPERMERCADO ECONOMICO JJ | 02/2026 | 1 | 122.454,89 | 27.580,72 | 15% | 22,52% |
| PEROLA DE NITEROI SUPERMERCADOS | 01/2026 | 1 | 87.135,15 | 18.471,03 | 15% | 21,20% |
| SUPERMERCADO LIBERDADE | 04/2026 | 4 | 44.480,39 | 9.163,27 | 15% | 20,60% |
| PEROLA DE NITEROI SUPERMERCADOS | 02/2026 | 1 | 90.043,84 | 17.686,47 | 15% | 19,64% |
| SUPERMERCADO LIBERDADE | 05/2026 | 4 | 35.659,73 | 6.955,63 | 15% | 19,51% |
| SÃO FERNANDO | 01/2026 | 1 | 100.063,26 | 18.319,16 | 15% | 18,31% |
| PEROLA DE NITEROI SUPERMERCADOS | 12/2025 | 2 | 263.159,25 | 47.969,08 | 15% | 18,23% |
| SUPERMERCADO GUIMARAES FILHOS | 12/2025 | 1 | 96.893,75 | 17.587,85 | 12,5% | 18,15% |
| SÃO FERNANDO | 12/2025 | 2 | 369.440,15 | 65.875,05 | 15% | 17,83% |
| SUPERMERCADO GUIMARAES FILHOS | 02/2026 | 1 | 100.631,24 | 16.967,86 | 12,5% | 16,86% |
| SÃO FERNANDO | 02/2026 | 1 | 102.481,83 | 17.245,41 | 15% | 16,83% |
| GRANO E FARINA PADARIA | 01/2026 | 1 | 29.275,87 | 4.555,49 | 12,5% | 15,56% |
| GRANO E FARINA PADARIA | 02/2026 | 1 | 30.886,84 | 4.752,67 | 12,5% | 15,39% |
| SUPERMERCADO GUIMARAES FILHOS | 03/2026 | 2 | 141.338,29 | 21.273,20 | 12,5% | 15,05% |
| SUPERMERCADO GUIMARAES FILHOS | 01/2026 | 1 | 98.469,37 | 14.509,25 | 12,5% | 14,73% |
| SUPERMERCADO COURTS | 05/2026 | 4 | 53.948,41 | 7.650,48 | 20% | 14,18% |
| GRANO E FARINA PADARIA | 12/2025 | 3 | 82.763,05 | 11.436,59 | 12,5% | 13,82% |
| SUPERMERCADO COURTS | 03/2026 | 3 | 89.716,66 | 11.854,05 | 20% | 13,21% |

**O que perguntar ao Focus:** nesses meses houve tributos com taxas diferentes?
Se sim, o conserto é gravar o percentual por linha em vez de um só para o mês.

---

## Achado lateral

`SUPERMERCADO GUIMARAES\nFILHOS LTDA` tem **quebra de linha dentro do nome da
empresa** no cadastro, herdada da carga. Aparece quebrado em qualquer relatório.
Vale limpar.

## Como reproduzir esta lista

```sql
with mes as (
  select cm.cliente_id, cm.mes_referencia,
         sum(cm.valor_compensado) as compensado,
         sum(cm.honorario_valor) as honorario,
         max(cm.honorario_percentual) as perc_gravado,
         round(sum(cm.honorario_valor)/nullif(sum(cm.valor_compensado),0),4) as derivado
  from public.compensacoes_mensais cm
  where cm.criado_em::date in ('2026-07-16','2026-05-06')
  group by 1,2
  having sum(cm.honorario_valor) is not null and sum(cm.valor_compensado) > 0
)
select case when derivado > 0.25 then 'A' else 'B' end as grupo,
       c.empresa, to_char(m.mes_referencia,'MM/YYYY'), m.compensado, m.honorario,
       (m.perc_gravado*100)::numeric(6,2), (m.derivado*100)::numeric(6,2)
from mes m join public.clientes c on c.id = m.cliente_id
where abs(m.derivado - m.perc_gravado) > 0.0001
order by 1, m.derivado desc;
```
