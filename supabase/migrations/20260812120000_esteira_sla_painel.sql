-- Épica: Painel SLA por etapa (esteira administrativa).
--
-- 1) esteira_historico — fecha/abre linha a cada mudança de estágio
-- 2) trigger AFTER INSERT/UPDATE em clientes
-- 3) backfill da etapa corrente
-- 4) v_esteira_sla — tempo médio histórico + fila atual vs SLA
-- 5) v_esteira_clientes — passa a expor sla_dias e atrasado

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Histórico de permanência por etapa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.esteira_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  estagio public.estagio_esteira NOT NULL,
  entrou_em timestamptz NOT NULL DEFAULT now(),
  saiu_em timestamptz,
  CONSTRAINT esteira_historico_intervalo_chk CHECK (saiu_em IS NULL OR saiu_em >= entrou_em)
);

CREATE INDEX IF NOT EXISTS ix_esteira_historico_cliente
  ON public.esteira_historico (cliente_id, entrou_em DESC);

CREATE INDEX IF NOT EXISTS ix_esteira_historico_aberto
  ON public.esteira_historico (cliente_id)
  WHERE saiu_em IS NULL;

CREATE INDEX IF NOT EXISTS ix_esteira_historico_estagio_fechado
  ON public.esteira_historico (estagio)
  WHERE saiu_em IS NOT NULL;

COMMENT ON TABLE public.esteira_historico IS
  'Permanência do cliente em cada etapa da esteira. Uma linha aberta (saiu_em NULL) por cliente.';

ALTER TABLE public.esteira_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "esteira_historico_select_interno" ON public.esteira_historico;
CREATE POLICY "esteira_historico_select_interno" ON public.esteira_historico
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_tributario'::app_role)
  );

-- ---------------------------------------------------------------------------
-- 2) Trigger: ao entrar / mudar estágio, fecha a anterior e abre a nova
--    SECURITY DEFINER: o insert no histórico não depende de GRANT pro role app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_esteira_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.esteira_historico (cliente_id, estagio, entrou_em)
    VALUES (NEW.id, NEW.estagio_esteira, COALESCE(NEW.data_entrada_estagio, now()));
    RETURN NEW;
  END IF;

  IF NEW.estagio_esteira IS DISTINCT FROM OLD.estagio_esteira THEN
    UPDATE public.esteira_historico
    SET saiu_em = now()
    WHERE cliente_id = NEW.id
      AND estagio = OLD.estagio_esteira
      AND saiu_em IS NULL;

    INSERT INTO public.esteira_historico (cliente_id, estagio, entrou_em)
    VALUES (NEW.id, NEW.estagio_esteira, COALESCE(NEW.data_entrada_estagio, now()));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_esteira_historico ON public.clientes;
CREATE TRIGGER trg_clientes_esteira_historico
  AFTER INSERT OR UPDATE OF estagio_esteira ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_esteira_historico();

-- ---------------------------------------------------------------------------
-- 3) Backfill: etapa corrente aberta (não inventa ciclos fechados)
-- ---------------------------------------------------------------------------
INSERT INTO public.esteira_historico (cliente_id, estagio, entrou_em)
SELECT c.id, c.estagio_esteira, c.data_entrada_estagio
FROM public.clientes c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.esteira_historico h
  WHERE h.cliente_id = c.id AND h.saiu_em IS NULL
);

-- ---------------------------------------------------------------------------
-- 4) View agregada por etapa
--    SLA esperado (decisão produto 12/08/2026):
--      Triagem 1d | Levantamento 3d | Emitir Contrato 1d | Receber Assinado 3d
--      Em Compensação 30d (não estava no backlog — default operacional)
--      Concluído sem SLA
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_esteira_sla AS
WITH sla AS (
  SELECT *
  FROM (
    VALUES
      ('triagem'::public.estagio_esteira, 1, 1),
      ('levantamento'::public.estagio_esteira, 3, 2),
      ('emitir_contrato'::public.estagio_esteira, 1, 3),
      ('receber_assinado'::public.estagio_esteira, 3, 4),
      ('em_compensacao'::public.estagio_esteira, 30, 5),
      ('concluido'::public.estagio_esteira, NULL::int, 6)
  ) AS t(estagio, sla_dias, ordem)
),
historico_avg AS (
  SELECT
    h.estagio,
    ROUND(AVG(EXTRACT(EPOCH FROM (h.saiu_em - h.entrou_em)) / 86400.0)::numeric, 1) AS tempo_medio_dias,
    COUNT(*)::int AS ciclos_concluidos
  FROM public.esteira_historico h
  WHERE h.saiu_em IS NOT NULL
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
  'SLA da esteira: tempo médio histórico por etapa + fila atual vs meta.';

-- ---------------------------------------------------------------------------
-- 5) Kanban: sla_dias + atrasado por cliente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_esteira_clientes AS
SELECT
  c.id,
  c.empresa,
  c.cnpj,
  c.segmento,
  c.regime_tributario,
  c.estagio_esteira,
  c.data_entrada_estagio,
  EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int AS dias_na_etapa,
  CASE c.estagio_esteira
    WHEN 'triagem' THEN 1
    WHEN 'levantamento' THEN 3
    WHEN 'emitir_contrato' THEN 1
    WHEN 'receber_assinado' THEN 3
    WHEN 'em_compensacao' THEN 30
    ELSE NULL
  END AS sla_dias,
  CASE
    WHEN c.estagio_esteira = 'concluido' THEN false
    WHEN c.estagio_esteira = 'triagem'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 1 THEN true
    WHEN c.estagio_esteira = 'levantamento'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 3 THEN true
    WHEN c.estagio_esteira = 'emitir_contrato'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 1 THEN true
    WHEN c.estagio_esteira = 'receber_assinado'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 3 THEN true
    WHEN c.estagio_esteira = 'em_compensacao'
      AND EXTRACT(DAY FROM now() - c.data_entrada_estagio)::int > 30 THEN true
    ELSE false
  END AS atrasado,
  c.responsavel_id,
  p.full_name AS responsavel_nome,
  COALESCE(l.origem, 'manual') AS origem,
  c.status,
  c.status_operacional,
  c.criado_em
FROM public.clientes c
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.profiles p ON p.user_id = c.responsavel_id
WHERE c.status = 'ativo';

ALTER VIEW public.v_esteira_clientes SET (security_invoker = true);
GRANT SELECT ON public.v_esteira_clientes TO authenticated;

COMMIT;
