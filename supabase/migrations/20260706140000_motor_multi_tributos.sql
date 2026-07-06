-- ============================================================================
-- PR 3 — Motor de cálculo aceita múltiplos tributos por tese
--
-- Contexto: no PR 2 as compensações e processos passaram a carregar um tributo
-- individual. Agora o motor (motor_teses_config) precisa saber *quais* tributos
-- uma tese cobre — pra o diagnóstico dizer ao lead o que ele pode compensar, e
-- pra Visão Executiva (PR 10) agrupar valores por tributo.
--
-- Estratégia:
--   1) motor_teses_config ganha coluna `tributos text[]` (array; uma tese pode
--      cobrir mais de um tributo — ex: Subvenção ICMS → {IRPJ, CSLL}).
--   2) Backfill do array a partir de nome_exibicao/tese com heurística
--      alinhada ao PR 2.
--   3) diagnosticos_leads ganha `tributos text[]` — a RPC calcular_diagnostico
--      propaga o array pra o lead.
--   4) calcular_diagnostico é recriada preservando a assinatura, mas agora
--      escreve `tributos` em diagnosticos_leads e no JSON de relatorios_leads.
-- ============================================================================

-- 1) Coluna tributos em motor_teses_config -----------------------------------
ALTER TABLE public.motor_teses_config
  ADD COLUMN IF NOT EXISTS tributos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.motor_teses_config.tributos IS
  'Tributos cobertos pela tese. Vocabulário: INSS, PIS/COFINS, IRPJ, CSLL, ICMS, Outros. Vazio = ainda não classificado.';


-- 2) Backfill de motor_teses_config.tributos ---------------------------------
-- Idempotente: só toca linhas com array vazio.
UPDATE public.motor_teses_config
SET tributos = CASE
  -- Subvenção ICMS → afeta IRPJ e CSLL
  WHEN nome_exibicao ILIKE '%subven%icms%' OR tese ILIKE '%subven%icms%'
    THEN ARRAY['IRPJ', 'CSLL']
  -- Reporto trabalha PIS/COFINS acumulado
  WHEN nome_exibicao ILIKE '%reporto%' OR tese ILIKE '%reporto%'
    THEN ARRAY['PIS/COFINS']
  -- Exclusão ICMS da base PIS/COFINS / ICMS-ST → recupera PIS/COFINS
  WHEN nome_exibicao ILIKE '%icms%base%pis%'
    OR nome_exibicao ILIKE '%exclusao%icms%'
    OR nome_exibicao ILIKE '%exclusão%icms%'
    OR nome_exibicao ILIKE '%icms-st%'
    OR nome_exibicao ILIKE '%icms st%'
    THEN ARRAY['PIS/COFINS']
  -- PIS/COFINS Insumos
  WHEN nome_exibicao ILIKE '%pis%cofins%'
    OR nome_exibicao ILIKE '%pis/cofins%'
    OR nome_exibicao ILIKE '%pis-cofins%'
    OR tese ILIKE '%pis%cofins%'
    THEN ARRAY['PIS/COFINS']
  -- Palavras isoladas
  WHEN nome_exibicao ~* '\minss\M' OR tese ~* '\minss\M'
    THEN ARRAY['INSS']
  WHEN nome_exibicao ~* '\micms\M' OR tese ~* '\micms\M'
    THEN ARRAY['ICMS']
  WHEN nome_exibicao ~* '\mirpj\M' OR tese ~* '\mirpj\M'
    THEN ARRAY['IRPJ']
  WHEN nome_exibicao ~* '\mcsll\M' OR tese ~* '\mcsll\M'
    THEN ARRAY['CSLL']
  ELSE ARRAY[]::text[]
END
WHERE cardinality(tributos) = 0;


-- 3) Coluna tributos em diagnosticos_leads -----------------------------------
ALTER TABLE public.diagnosticos_leads
  ADD COLUMN IF NOT EXISTS tributos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.diagnosticos_leads.tributos IS
  'Snapshot dos tributos da tese no momento em que o diagnóstico foi gerado. Ver motor_teses_config.tributos.';


-- 4) Atualiza a RPC calcular_diagnostico -------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_diagnostico(
  _lead_id uuid,
  _faturamento_mensal numeric,
  _regime text,
  _segmento text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tese RECORD;
  _est_min numeric;
  _est_max numeric;
  _total_min numeric := 0;
  _total_max numeric := 0;
  _score integer;
  _faturamento_anual numeric;
  _teses_json jsonb := '[]'::jsonb;
BEGIN
  -- Clear previous diagnosticos for this lead
  DELETE FROM diagnosticos_leads WHERE lead_id = _lead_id;

  -- Fetch eligible teses and insert into diagnosticos_leads
  FOR _tese IN
    SELECT
      nome_exibicao,
      descricao_comercial,
      ordem_exibicao,
      percentual_min,
      percentual_max,
      COALESCE(tributos, ARRAY[]::text[]) AS tributos
    FROM motor_teses_config
    WHERE ativo = true
      AND _regime = ANY(regimes_elegiveis)
      AND _segmento = ANY(segmentos_elegiveis)
    ORDER BY ordem_exibicao ASC
  LOOP
    _est_min := round(_faturamento_mensal * 60 * _tese.percentual_min);
    _est_max := round(_faturamento_mensal * 60 * _tese.percentual_max);

    INSERT INTO diagnosticos_leads (
      lead_id, tese_nome, descricao_comercial, ordem_exibicao,
      estimativa_minima, estimativa_maxima,
      percentual_minimo, percentual_maximo,
      tributos
    )
    VALUES (
      _lead_id, _tese.nome_exibicao, COALESCE(_tese.descricao_comercial, ''), COALESCE(_tese.ordem_exibicao, 0),
      _est_min, _est_max,
      _tese.percentual_min, _tese.percentual_max,
      _tese.tributos
    );

    _total_min := _total_min + _est_min;
    _total_max := _total_max + _est_max;

    _teses_json := _teses_json || jsonb_build_object(
      'tese_nome', _tese.nome_exibicao,
      'descricao_comercial', COALESCE(_tese.descricao_comercial, ''),
      'ordem_exibicao', COALESCE(_tese.ordem_exibicao, 0),
      'estimativa_minima', _est_min,
      'estimativa_maxima', _est_max,
      'percentual_minimo', _tese.percentual_min,
      'percentual_maximo', _tese.percentual_max,
      'tributos', to_jsonb(_tese.tributos)
    );
  END LOOP;

  -- Calculate score
  _faturamento_anual := _faturamento_mensal * 12;
  IF _faturamento_anual > 0 THEN
    _score := LEAST(100, round((_total_max / _faturamento_anual) * 100));
  ELSE
    _score := 0;
  END IF;

  -- Update lead
  UPDATE leads SET score_lead = _score, status = 'relatorio_gerado' WHERE id = _lead_id;

  -- Sync relatorios_leads (upsert)
  IF EXISTS (SELECT 1 FROM relatorios_leads WHERE lead_id = _lead_id) THEN
    UPDATE relatorios_leads
    SET teses_identificadas = _teses_json,
        estimativa_total_minima = _total_min,
        estimativa_total_maxima = _total_max,
        score = _score
    WHERE lead_id = _lead_id;
  ELSE
    INSERT INTO relatorios_leads (lead_id, conteudo_html, teses_identificadas, estimativa_total_minima, estimativa_total_maxima, score)
    VALUES (_lead_id, '', _teses_json, _total_min, _total_max, _score);
  END IF;
END;
$$;


-- 5) Índice GIN opcional pra buscas por tributo no motor ----------------------
-- Barato porque a tabela é pequena (dezenas de linhas), mas facilita filtros
-- do tipo "quais teses cobrem PIS/COFINS?".
CREATE INDEX IF NOT EXISTS ix_motor_teses_config_tributos
  ON public.motor_teses_config USING GIN (tributos);
