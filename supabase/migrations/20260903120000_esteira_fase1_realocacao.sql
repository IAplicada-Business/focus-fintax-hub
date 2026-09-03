-- Esteira — Fase 1 (03/09/2026): organizar a esteira herdada da importação.
--
-- Contexto: os 94 clientes ativos estão todos em Triagem, sem responsável,
-- com ~140 dias na etapa (data_entrada_estagio = criado_em, backfill de
-- 06/08). O "atraso acumulado" de 13.024 dias no painel é artefato disso.
--
-- 1) enum: nova_abordagem (cliente que recusou tese nova) e devolutiva_cliente
--    (tese inviável) — pedido Paulo/Mariana 03/09/2026.
-- 2) clientes.tentativas_abordagem — contador incrementado pela trigger a
--    cada entrada em nova_abordagem.
-- 3) esteira_historico.origem — marca as linhas do backfill (importacao) e
--    as fechadas por reinício de SLA (reset_sla) pra excluir das médias.
-- 4) RPCs admin/pmo com auditoria em cliente_historico:
--    esteira_aplicar_realocacao(jsonb, text) e esteira_reiniciar_sla(uuid[], text).
-- 5) views v_esteira_sla / v_esteira_clientes recriadas.

-- ADD VALUE fora de bloco transacional (mesmo padrão de 20260812160000).
ALTER TYPE public.estagio_esteira ADD VALUE IF NOT EXISTS 'nova_abordagem';
ALTER TYPE public.estagio_esteira ADD VALUE IF NOT EXISTS 'devolutiva_cliente';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Seed das etapas novas na config (ordem/label/SLA editáveis na UI)
--    nova_abordagem entra ANTES de triagem; devolutiva_cliente vai pro fim.
-- ---------------------------------------------------------------------------
UPDATE public.esteira_sla_config SET ordem = ordem + 1
WHERE NOT EXISTS (SELECT 1 FROM public.esteira_sla_config WHERE estagio = 'nova_abordagem');

INSERT INTO public.esteira_sla_config (estagio, label, sla_dias, ordem, ativo)
VALUES ('nova_abordagem', 'Nova abordagem', 5, 1, true)
ON CONFLICT (estagio) DO NOTHING;

INSERT INTO public.esteira_sla_config (estagio, label, sla_dias, ordem, ativo)
SELECT 'devolutiva_cliente', 'Devolutiva ao cliente', NULL, COALESCE(max(ordem), 0) + 1, true
FROM public.esteira_sla_config
ON CONFLICT (estagio) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Contador de tentativas de abordagem
-- ---------------------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tentativas_abordagem int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.clientes.tentativas_abordagem IS
  'Quantas vezes o cliente entrou em nova_abordagem. Mantido pela trigger set_data_entrada_estagio.';

CREATE OR REPLACE FUNCTION public.set_data_entrada_estagio()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estagio_esteira IS DISTINCT FROM OLD.estagio_esteira THEN
    NEW.data_entrada_estagio := now();
    IF NEW.estagio_esteira = 'nova_abordagem' THEN
      NEW.tentativas_abordagem := COALESCE(OLD.tentativas_abordagem, 0) + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Origem da linha de histórico
--    sistema    — permanência real (trigger de mudança de etapa)
--    importacao — backfill de 06/08: duração não é ciclo real
--    reset_sla  — linha fechada por reinício manual do contador
-- ---------------------------------------------------------------------------
ALTER TABLE public.esteira_historico
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'sistema';

ALTER TABLE public.esteira_historico
  DROP CONSTRAINT IF EXISTS esteira_historico_origem_chk;
ALTER TABLE public.esteira_historico
  ADD CONSTRAINT esteira_historico_origem_chk
  CHECK (origem IN ('sistema', 'importacao', 'reset_sla'));

COMMENT ON COLUMN public.esteira_historico.origem IS
  'sistema = ciclo real; importacao = backfill (excluir das médias); reset_sla = fechada por reinício manual (excluir das médias).';

-- Linhas abertas em Triagem com entrada anterior ao schema da esteira (06/08)
-- vieram do backfill: quando forem fechadas, não podem contar como ciclo.
UPDATE public.esteira_historico
SET origem = 'importacao'
WHERE saiu_em IS NULL
  AND estagio = 'triagem'
  AND entrou_em < timestamptz '2026-08-07 00:00:00-03';

-- ---------------------------------------------------------------------------
-- 4) RPCs — SECURITY DEFINER com checagem de papel dentro da função.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.esteira_exige_admin_pmo()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pmo'::app_role)) THEN
    RAISE EXCEPTION 'Somente admin ou PMO podem organizar a esteira'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- p_itens: [{ "cliente_id": uuid, "estagio": text|null, "responsavel_id": uuid|null, "segmento": text|null }]
-- Campo null/ausente = não mexe. Devolve quantos clientes foram alterados.
CREATE OR REPLACE FUNCTION public.esteira_aplicar_realocacao(
  p_itens jsonb,
  p_motivo text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_cliente_id uuid;
  v_estagio public.estagio_esteira;
  v_responsavel uuid;
  v_segmento text;
  v_antes record;
  v_alterados int := 0;
BEGIN
  PERFORM public.esteira_exige_admin_pmo();

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'p_itens precisa ser um array JSON';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_cliente_id := (v_item->>'cliente_id')::uuid;
    v_estagio := NULLIF(v_item->>'estagio', '')::public.estagio_esteira;
    v_responsavel := NULLIF(v_item->>'responsavel_id', '')::uuid;
    v_segmento := NULLIF(btrim(v_item->>'segmento'), '');

    SELECT estagio_esteira, responsavel_id, segmento
    INTO v_antes
    FROM public.clientes
    WHERE id = v_cliente_id AND status = 'ativo'
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF (v_estagio IS NULL OR v_estagio = v_antes.estagio_esteira)
       AND (v_responsavel IS NULL OR v_responsavel = v_antes.responsavel_id)
       AND (v_segmento IS NULL OR v_segmento = v_antes.segmento) THEN
      CONTINUE;
    END IF;

    UPDATE public.clientes
    SET estagio_esteira = COALESCE(v_estagio, estagio_esteira),
        responsavel_id  = COALESCE(v_responsavel, responsavel_id),
        segmento        = COALESCE(v_segmento, segmento),
        atualizado_em   = now()
    WHERE id = v_cliente_id;

    INSERT INTO public.cliente_historico (cliente_id, tipo, descricao, valor_anterior, valor_novo, usuario_id)
    VALUES (
      v_cliente_id,
      'esteira_realocacao',
      COALESCE(NULLIF(btrim(p_motivo), ''), 'Realocação em massa na esteira'),
      jsonb_build_object(
        'estagio', v_antes.estagio_esteira,
        'responsavel_id', v_antes.responsavel_id,
        'segmento', v_antes.segmento
      ),
      jsonb_build_object(
        'estagio', COALESCE(v_estagio, v_antes.estagio_esteira),
        'responsavel_id', COALESCE(v_responsavel, v_antes.responsavel_id),
        'segmento', COALESCE(v_segmento, v_antes.segmento)
      ),
      auth.uid()
    );

    v_alterados := v_alterados + 1;
  END LOOP;

  RETURN v_alterados;
END;
$$;

-- Zera o contador de SLA sem mudar de etapa. A linha aberta do histórico é
-- fechada como reset_sla (não vira ciclo) e uma nova é aberta em now().
CREATE OR REPLACE FUNCTION public.esteira_reiniciar_sla(
  p_cliente_ids uuid[],
  p_motivo text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_agora timestamptz := now();
BEGIN
  PERFORM public.esteira_exige_admin_pmo();

  SELECT array_agg(id) INTO v_ids
  FROM public.clientes
  WHERE id = ANY(p_cliente_ids) AND status = 'ativo';

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- Trigger BEFORE só mexe em data_entrada quando o estágio muda; aqui não muda.
  -- Trigger AFTER é "UPDATE OF estagio_esteira" e não dispara neste UPDATE.
  UPDATE public.clientes
  SET data_entrada_estagio = v_agora,
      atualizado_em = v_agora
  WHERE id = ANY(v_ids);

  UPDATE public.esteira_historico
  SET saiu_em = v_agora,
      origem = 'reset_sla'
  WHERE cliente_id = ANY(v_ids) AND saiu_em IS NULL;

  INSERT INTO public.esteira_historico (cliente_id, estagio, entrou_em, origem)
  SELECT c.id, c.estagio_esteira, v_agora, 'sistema'
  FROM public.clientes c
  WHERE c.id = ANY(v_ids);

  INSERT INTO public.cliente_historico (cliente_id, tipo, descricao, valor_anterior, valor_novo, usuario_id)
  SELECT c.id,
         'esteira_reset_sla',
         COALESCE(NULLIF(btrim(p_motivo), ''), 'Contador de SLA reiniciado'),
         NULL,
         jsonb_build_object('estagio', c.estagio_esteira, 'data_entrada_estagio', v_agora),
         auth.uid()
  FROM public.clientes c
  WHERE c.id = ANY(v_ids);

  RETURN array_length(v_ids, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.esteira_aplicar_realocacao(jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.esteira_reiniciar_sla(uuid[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.esteira_exige_admin_pmo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esteira_aplicar_realocacao(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.esteira_reiniciar_sla(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.esteira_exige_admin_pmo() TO authenticated;

COMMENT ON FUNCTION public.esteira_aplicar_realocacao(jsonb, text) IS
  'Realocação em massa (estágio/responsável/segmento) com auditoria em cliente_historico. Só admin/pmo.';
COMMENT ON FUNCTION public.esteira_reiniciar_sla(uuid[], text) IS
  'Reinicia o contador de SLA (data_entrada_estagio = now) sem mudar etapa; fecha a linha do histórico como reset_sla. Só admin/pmo.';

-- ---------------------------------------------------------------------------
-- 5) Views
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_esteira_sla;

CREATE VIEW public.v_esteira_sla AS
WITH sla AS (
  SELECT estagio, sla_dias, ordem, label
  FROM public.esteira_sla_config
),
-- Só ciclos reais entram na média: backfill e reset não medem trabalho.
historico_avg AS (
  SELECT
    h.estagio,
    ROUND(AVG(EXTRACT(EPOCH FROM (h.saiu_em - h.entrou_em)) / 86400.0)::numeric, 1) AS tempo_medio_dias,
    COUNT(*)::int AS ciclos_concluidos
  FROM public.esteira_historico h
  WHERE h.saiu_em IS NOT NULL
    AND h.origem = 'sistema'
  GROUP BY h.estagio
),
atuais AS (
  SELECT
    c.estagio_esteira AS estagio,
    COUNT(*)::int AS clientes_na_etapa,
    ROUND(AVG(EXTRACT(EPOCH FROM (now() - c.data_entrada_estagio)) / 86400.0)::numeric, 1) AS dias_medios_atuais,
    COUNT(*) FILTER (
      WHERE s.sla_dias IS NOT NULL
        AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > s.sla_dias
    )::int AS atrasados,
    COALESCE(SUM(
      GREATEST(
        0,
        EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int - s.sla_dias
      )
    ) FILTER (WHERE s.sla_dias IS NOT NULL), 0)::int AS atraso_acumulado_dias
  FROM public.clientes c
  JOIN sla s ON s.estagio = c.estagio_esteira
  WHERE c.status = 'ativo'
  GROUP BY c.estagio_esteira
)
SELECT
  s.estagio,
  s.label,
  s.sla_dias,
  s.ordem,
  COALESCE(a.clientes_na_etapa, 0) AS clientes_na_etapa,
  a.dias_medios_atuais,
  COALESCE(a.atrasados, 0) AS atrasados,
  COALESCE(a.atraso_acumulado_dias, 0) AS atraso_acumulado_dias,
  h.tempo_medio_dias,
  COALESCE(h.ciclos_concluidos, 0) AS ciclos_concluidos
FROM sla s
LEFT JOIN atuais a ON a.estagio = s.estagio
LEFT JOIN historico_avg h ON h.estagio = s.estagio
ORDER BY s.ordem;

ALTER VIEW public.v_esteira_sla SET (security_invoker = true);
GRANT SELECT ON public.v_esteira_sla TO authenticated;

COMMENT ON VIEW public.v_esteira_sla IS
  'SLA da esteira a partir de esteira_sla_config + fila atual; média histórica só de ciclos reais (origem = sistema).';

DROP VIEW IF EXISTS public.v_esteira_clientes;

CREATE VIEW public.v_esteira_clientes AS
SELECT
  c.id,
  c.empresa,
  c.cnpj,
  c.segmento,
  c.regime_tributario,
  c.estagio_esteira,
  c.data_entrada_estagio,
  EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int AS dias_na_etapa,
  s.sla_dias,
  CASE
    WHEN s.sla_dias IS NULL THEN false
    WHEN EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > s.sla_dias THEN true
    ELSE false
  END AS atrasado,
  c.responsavel_id,
  p.full_name AS responsavel_nome,
  COALESCE(l.origem, 'manual') AS origem,
  c.status,
  c.status_operacional,
  c.criado_em,
  COALESCE(ramos.tem_compensacao, false) AS tem_ramo_compensacao,
  COALESCE(ramos.tem_ressarcimento, false) AS tem_ramo_ressarcimento,
  COALESCE(ramos.tem_judicial, false) AS tem_ramo_judicial,
  c.tentativas_abordagem,
  c.motivo_parada,
  COALESCE(ramos.teses_assinadas, 0) AS teses_assinadas
FROM public.clientes c
LEFT JOIN public.esteira_sla_config s ON s.estagio = c.estagio_esteira
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.profiles p ON p.user_id = c.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    bool_or(pt.tipo_recuperacao = 'compensacao') AS tem_compensacao,
    bool_or(pt.tipo_recuperacao = 'ressarcimento') AS tem_ressarcimento,
    bool_or(pt.tipo_recuperacao = 'recuperacao_judicial') AS tem_judicial,
    count(*) FILTER (
      WHERE pt.status_contrato = 'assinado' AND pt.status_processo <> 'desistiu'
    )::int AS teses_assinadas
  FROM public.processos_teses pt
  WHERE pt.cliente_id = c.id
) ramos ON true
WHERE c.status = 'ativo';

ALTER VIEW public.v_esteira_clientes SET (security_invoker = true);
GRANT SELECT ON public.v_esteira_clientes TO authenticated;

COMMIT;
