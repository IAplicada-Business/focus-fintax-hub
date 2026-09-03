-- Esteira — Fase 2 (03/09/2026): visão de acompanhamento pro PMO.
--
-- 1) esteira_historico.responsavel_id — quem era o responsável em cada
--    permanência (linha do tempo do cliente pede "quem era o responsável").
-- 2) trigger log_esteira_historico passa a gravar o responsável e a
--    atualizá-lo na linha aberta quando ele muda sem mudar de etapa.
-- 3) esteira_reiniciar_sla grava o responsável na linha nova.
-- 4) v_esteira_clientes ganha a última ação registrada (cliente_historico)
--    pra tabela de acompanhamento não precisar de N+1.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Responsável por permanência
-- ---------------------------------------------------------------------------
ALTER TABLE public.esteira_historico
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.esteira_historico.responsavel_id IS
  'Responsável pelo cliente durante esta permanência (snapshot na entrada; atualizado se trocar sem mudar de etapa).';

-- Backfill das linhas abertas com o responsável atual do cliente.
UPDATE public.esteira_historico h
SET responsavel_id = c.responsavel_id
FROM public.clientes c
WHERE c.id = h.cliente_id
  AND h.saiu_em IS NULL
  AND h.responsavel_id IS NULL
  AND c.responsavel_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Trigger: grava responsável; se só o responsável mudar, atualiza a aberta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_esteira_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.esteira_historico (cliente_id, estagio, entrou_em, responsavel_id)
    VALUES (NEW.id, NEW.estagio_esteira, COALESCE(NEW.data_entrada_estagio, now()), NEW.responsavel_id);
    RETURN NEW;
  END IF;

  IF NEW.estagio_esteira IS DISTINCT FROM OLD.estagio_esteira THEN
    UPDATE public.esteira_historico
    SET saiu_em = now()
    WHERE cliente_id = NEW.id
      AND estagio = OLD.estagio_esteira
      AND saiu_em IS NULL;

    INSERT INTO public.esteira_historico (cliente_id, estagio, entrou_em, responsavel_id)
    VALUES (NEW.id, NEW.estagio_esteira, COALESCE(NEW.data_entrada_estagio, now()), NEW.responsavel_id);
  ELSIF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    UPDATE public.esteira_historico
    SET responsavel_id = NEW.responsavel_id
    WHERE cliente_id = NEW.id
      AND saiu_em IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_esteira_historico ON public.clientes;
CREATE TRIGGER trg_clientes_esteira_historico
  AFTER INSERT OR UPDATE OF estagio_esteira, responsavel_id ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_esteira_historico();

-- ---------------------------------------------------------------------------
-- 3) Reinício de SLA grava o responsável na linha nova
-- ---------------------------------------------------------------------------
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

  UPDATE public.clientes
  SET data_entrada_estagio = v_agora,
      atualizado_em = v_agora
  WHERE id = ANY(v_ids);

  UPDATE public.esteira_historico
  SET saiu_em = v_agora,
      origem = 'reset_sla'
  WHERE cliente_id = ANY(v_ids) AND saiu_em IS NULL;

  INSERT INTO public.esteira_historico (cliente_id, estagio, entrou_em, origem, responsavel_id)
  SELECT c.id, c.estagio_esteira, v_agora, 'sistema', c.responsavel_id
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

-- ---------------------------------------------------------------------------
-- 4) Última ação registrada na view (evita N+1 na tabela de acompanhamento)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_cliente_historico_cliente_created
  ON public.cliente_historico (cliente_id, created_at DESC);

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
  COALESCE(ramos.teses_assinadas, 0) AS teses_assinadas,
  ua.created_at AS ultima_acao_em,
  ua.descricao AS ultima_acao_descricao,
  ua.tipo AS ultima_acao_tipo
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
LEFT JOIN LATERAL (
  SELECT h.tipo, h.descricao, h.created_at
  FROM public.cliente_historico h
  WHERE h.cliente_id = c.id
  ORDER BY h.created_at DESC
  LIMIT 1
) ua ON true
WHERE c.status = 'ativo';

ALTER VIEW public.v_esteira_clientes SET (security_invoker = true);
GRANT SELECT ON public.v_esteira_clientes TO authenticated;

COMMIT;
