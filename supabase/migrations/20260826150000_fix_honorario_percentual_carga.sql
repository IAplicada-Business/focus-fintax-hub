-- Corrige honorario_percentual em meses da carga legada onde o percentual
-- gravado não corresponde à taxa efetivamente aplicada.
--
-- Contexto (investigado em 26/08/2026):
-- A planilha de origem tinha UM honorário por cliente/mês; compensacoes_mensais
-- modela uma linha por tributo. A carga (20260716160000_fox_carga_planilhas)
-- gravou o honorário do mês inteiro na primeira linha e deixou as demais nulas.
-- Consequência: comparar honorario_valor com valor_compensado * percentual
-- LINHA A LINHA falha, mas a soma do mês está correta — e é a soma que o Mapa
-- exibe. Nenhum valor financeiro está errado.
--
-- O que está errado é só o honorario_percentual: em 44 meses ele diz uma taxa
-- e o honorário do mês reflete outra. Esta migration corrige APENAS os casos
-- em que a taxa derivada (honorário do mês / compensado do mês) cai exatamente
-- numa taxa contratual conhecida — 5 meses, todos derivando para 20%.
--
-- Os outros 39 meses NÃO são tocados de propósito: 21 parecem meses de taxa
-- mista (precisam de rateio por linha) e 18 derivam para taxas impossíveis
-- (>25%), o que sugere linhas de compensação faltando na carga, não erro de
-- rótulo. Esses vão para conferência manual do Focus.
--
-- NENHUM honorario_valor é alterado aqui. Só o percentual.

BEGIN;

WITH mes AS (
  SELECT
    cm.cliente_id,
    cm.mes_referencia,
    SUM(cm.honorario_valor) / NULLIF(SUM(cm.valor_compensado), 0) AS perc_derivado,
    MAX(cm.honorario_percentual) AS perc_gravado
  FROM public.compensacoes_mensais cm
  WHERE cm.criado_em::date IN ('2026-07-16', '2026-05-06')
  GROUP BY cm.cliente_id, cm.mes_referencia
  HAVING SUM(cm.honorario_valor) IS NOT NULL
     AND SUM(cm.valor_compensado) > 0
),
alvo AS (
  SELECT cliente_id, mes_referencia, round(perc_derivado, 4) AS perc_correto
  FROM mes
  WHERE abs(perc_derivado - perc_gravado) > 0.0001
    -- Guarda-chuva: só taxas contratuais conhecidas. Derivar um percentual
    -- qualquer gravaria no banco uma taxa que nunca existiu, deixando o
    -- relatório "consistente" e errado.
    AND round(perc_derivado, 4) IN (0.1000, 0.1250, 0.1500, 0.2000, 0.2500)
)
UPDATE public.compensacoes_mensais cm
SET honorario_percentual = a.perc_correto
FROM alvo a
WHERE cm.cliente_id = a.cliente_id
  AND cm.mes_referencia = a.mes_referencia
  AND cm.honorario_percentual IS NOT NULL
  AND cm.criado_em::date IN ('2026-07-16', '2026-05-06');

COMMIT;
