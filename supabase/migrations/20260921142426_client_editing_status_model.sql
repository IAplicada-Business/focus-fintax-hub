BEGIN;

-- O status de compensação editável é uma classificação operacional explícita.
-- NULL significa "classificação pendente" (qualidade de dados), não um quarto
-- status de negócio. Os valores antigos da view (`prevista`, `sem_operacao`)
-- não são persistidos nem apagados de históricos.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS status_compensacao text;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_status_compensacao_chk;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_status_compensacao_chk
  CHECK (
    status_compensacao IS NULL
    OR status_compensacao IN ('compensando', 'reporto', 'encerrado')
  );

COMMENT ON COLUMN public.clientes.status_compensacao IS
  'Classificação operacional editável: compensando, reporto ou encerrado. NULL indica classificação pendente (qualidade de dados).';

-- Migração conservadora dos sinais legados. A precedência espelha a regra
-- anterior: operação real/manual, depois REPORTO, depois encerramento.
WITH sinais AS (
  SELECT
    c.id,
    CASE
      WHEN COALESCE(c.compensando_fintax, false)
        OR EXISTS (
          SELECT 1
          FROM public.compensacoes_mensais cm
          LEFT JOIN public.teses_tributarias tt ON tt.id = cm.tese_origem_id
          LEFT JOIN public.processos_teses ptc ON ptc.id = cm.processo_tese_id
          WHERE cm.cliente_id = c.id
            AND cm.valor_compensado > 0
            AND date_trunc('month', cm.mes_referencia) = date_trunc('month', current_date)
            AND COALESCE(tt.codigo::text, '') <> 'REPORTO'
            AND COALESCE(ptc.categoria, '') <> 'reporto'
            AND upper(COALESCE(ptc.tese, '')) <> 'REPORTO'
        )
        THEN 'compensando'
      WHEN EXISTS (
        SELECT 1
        FROM public.processos_teses ptr
        WHERE ptr.cliente_id = c.id
          AND ptr.status_contrato = 'assinado'
          AND (
            ptr.categoria = 'reporto'
            OR upper(COALESCE(ptr.tese, '')) = 'REPORTO'
          )
          AND COALESCE(ptr.status_processo, '') <> 'desistiu'
      )
        THEN 'reporto'
      WHEN c.status_operacional::text = 'fechado'
        OR (
          EXISTS (
            SELECT 1 FROM public.processos_teses pta
            WHERE pta.cliente_id = c.id
              AND pta.status_contrato = 'assinado'
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.processos_teses pte
            WHERE pte.cliente_id = c.id
              AND pte.status_contrato = 'assinado'
              AND COALESCE(pte.status_processo, '') NOT IN ('compensado', 'desistiu')
          )
        )
        THEN 'encerrado'
      ELSE NULL
    END AS status_compensacao
  FROM public.clientes c
)
UPDATE public.clientes c
SET status_compensacao = s.status_compensacao
FROM sinais s
WHERE s.id = c.id
  AND c.status_compensacao IS NULL
  AND s.status_compensacao IS NOT NULL;

-- Novos processos começam em um estado ainda suportado pela operação.
ALTER TABLE public.processos_teses
  ALTER COLUMN status_processo SET DEFAULT 'a_compensar';

-- Valida somente novas escolhas/mudanças. Linhas legadas continuam podendo ter
-- outros campos corrigidos sem que o histórico seja reescrito.
CREATE OR REPLACE FUNCTION public.validar_status_processo_editavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_reporto boolean;
BEGIN
  v_reporto :=
    COALESCE(NEW.categoria, '') = 'reporto'
    OR upper(COALESCE(NEW.tese, '')) = 'REPORTO';

  IF TG_OP = 'INSERT'
     OR NEW.status_processo IS DISTINCT FROM OLD.status_processo THEN
    IF NEW.status_processo IS NULL
       OR NEW.status_processo NOT IN (
         'a_compensar', 'compensando', 'compensado', 'pedido_feito_receita'
       ) THEN
      RAISE EXCEPTION 'Status de processo não disponível para novas alterações: %',
        COALESCE(NEW.status_processo, 'NULL')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status_processo = 'pedido_feito_receita' AND NOT v_reporto THEN
    RAISE EXCEPTION 'Pedido feito pela Receita é permitido somente para REPORTO'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_status_processo_editavel
  ON public.processos_teses;
CREATE TRIGGER trg_validar_status_processo_editavel
  BEFORE INSERT OR UPDATE OF status_processo, categoria, tese
  ON public.processos_teses
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_status_processo_editavel();

-- Permissão efetiva da ficha: uma linha explícita em user_permissions manda;
-- sem linha, vale o padrão dos papéis internos que já têm UPDATE por RLS.
CREATE OR REPLACE FUNCTION public.pode_editar_clientes(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p_user_id
        AND ur.role IN (
          'admin'::public.app_role,
          'pmo'::public.app_role,
          'gestor_tributario'::public.app_role
        )
    )
    AND COALESCE(
      (
        SELECT up.can_access AND NOT up.read_only
        FROM public.user_permissions up
        WHERE up.user_id = p_user_id
          AND up.screen_key = 'clientes'
        LIMIT 1
      ),
      true
    );
$$;

CREATE OR REPLACE FUNCTION public.cliente_responsaveis_elegiveis()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  cargo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.full_name, p.cargo
  FROM public.profiles p
  WHERE public.pode_editar_clientes(auth.uid())
    AND p.is_active = true
    AND public.pode_editar_clientes(p.user_id)
  ORDER BY p.full_name;
$$;

-- Edição operacional atômica da ficha. A mudança de etapa passa pelos triggers
-- canônicos: data_entrada_estagio é reiniciada e esteira_historico é fechado/
-- reaberto. A auditoria de status, etapa e responsável fica em cliente_historico.
CREATE OR REPLACE FUNCTION public.cliente_atualizar_operacao(
  p_cliente_id uuid,
  p_status_compensacao text DEFAULT NULL,
  p_estagio public.estagio_esteira DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL,
  p_atualizar_responsavel boolean DEFAULT false
)
RETURNS public.clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes public.clientes%ROWTYPE;
  v_depois public.clientes%ROWTYPE;
BEGIN
  IF NOT public.pode_editar_clientes(auth.uid()) THEN
    RAISE EXCEPTION 'Usuário sem permissão de edição de clientes'
      USING ERRCODE = '42501';
  END IF;

  IF p_status_compensacao IS NOT NULL
     AND p_status_compensacao NOT IN ('compensando', 'reporto', 'encerrado') THEN
    RAISE EXCEPTION 'Status de compensação inválido'
      USING ERRCODE = '23514';
  END IF;

  IF p_atualizar_responsavel
     AND p_responsavel_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.user_id = p_responsavel_id
         AND p.is_active = true
         AND public.pode_editar_clientes(p.user_id)
     ) THEN
    RAISE EXCEPTION 'Responsável inativo ou sem acesso de edição a clientes'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_antes
  FROM public.clientes
  WHERE id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.clientes
  SET
    status_compensacao = COALESCE(p_status_compensacao, status_compensacao),
    compensando_fintax = CASE
      WHEN p_status_compensacao IS NULL THEN compensando_fintax
      ELSE p_status_compensacao = 'compensando'
    END,
    estagio_esteira = COALESCE(p_estagio, estagio_esteira),
    responsavel_id = CASE
      WHEN p_atualizar_responsavel THEN p_responsavel_id
      ELSE responsavel_id
    END,
    atualizado_em = now()
  WHERE id = p_cliente_id
  RETURNING * INTO v_depois;

  IF v_depois.status_compensacao IS DISTINCT FROM v_antes.status_compensacao
     OR v_depois.estagio_esteira IS DISTINCT FROM v_antes.estagio_esteira
     OR v_depois.responsavel_id IS DISTINCT FROM v_antes.responsavel_id THEN
    INSERT INTO public.cliente_historico (
      cliente_id,
      tipo,
      descricao,
      valor_anterior,
      valor_novo,
      usuario_id
    )
    VALUES (
      p_cliente_id,
      'operacao_cliente_editada',
      'Classificação operacional do cliente atualizada',
      jsonb_build_object(
        'status_compensacao', v_antes.status_compensacao,
        'estagio_esteira', v_antes.estagio_esteira,
        'responsavel_id', v_antes.responsavel_id
      ),
      jsonb_build_object(
        'status_compensacao', v_depois.status_compensacao,
        'estagio_esteira', v_depois.estagio_esteira,
        'responsavel_id', v_depois.responsavel_id
      ),
      auth.uid()
    );
  END IF;

  RETURN v_depois;
END;
$$;

-- Recria a view sem `prevista`/`sem_operacao` como estados de negócio.
-- Na ausência de classificação segura, status_principal fica NULL.
CREATE OR REPLACE VIEW public.v_clientes_status_compensacao
WITH (security_invoker = true) AS
WITH
  comp AS (
    SELECT
      cm.cliente_id,
      bool_or(
        cm.valor_compensado > 0
        AND date_trunc('month', cm.mes_referencia) = date_trunc('month', current_date)
        AND COALESCE(t.codigo::text, '') <> 'REPORTO'
        AND COALESCE(pt.categoria::text, '') <> 'reporto'
        AND upper(COALESCE(pt.tese::text, '')) <> 'REPORTO'
      ) AS tem_compensacao_mes_corrente,
      bool_or(
        cm.valor_compensado > 0
        AND COALESCE(t.codigo::text, '') <> 'REPORTO'
        AND COALESCE(pt.categoria::text, '') <> 'reporto'
        AND upper(COALESCE(pt.tese::text, '')) <> 'REPORTO'
      ) AS tem_compensacao_qualquer,
      max(cm.mes_referencia) FILTER (
        WHERE cm.valor_compensado > 0
          AND COALESCE(t.codigo::text, '') <> 'REPORTO'
          AND COALESCE(pt.categoria::text, '') <> 'reporto'
          AND upper(COALESCE(pt.tese::text, '')) <> 'REPORTO'
      ) AS ultima_competencia_compensada
    FROM public.compensacoes_mensais cm
    LEFT JOIN public.teses_tributarias t ON t.id = cm.tese_origem_id
    LEFT JOIN public.processos_teses pt ON pt.id = cm.processo_tese_id
    GROUP BY cm.cliente_id
  ),
  proc AS (
    SELECT
      pt.cliente_id,
      bool_or(
        pt.status_contrato = 'assinado'
        AND COALESCE(pt.status_processo, '') NOT IN ('compensado', 'desistiu')
      ) AS tem_tese_ativa,
      bool_or(pt.status_contrato = 'assinado') AS tem_alguma_tese_assinada,
      bool_or(
        (
          COALESCE(pt.categoria, '') = 'reporto'
          OR upper(COALESCE(pt.tese, '')) = 'REPORTO'
        )
        AND pt.status_contrato = 'assinado'
        AND COALESCE(pt.status_processo, '') <> 'desistiu'
      ) AS tem_reporto,
      bool_or(
        pt.tipo_recuperacao = 'recuperacao_judicial'
        AND pt.status_contrato = 'assinado'
        AND COALESCE(pt.status_processo, '') <> 'desistiu'
      ) AS tem_judicial,
      bool_or(
        pt.tipo_recuperacao = 'ressarcimento'
        AND pt.status_contrato = 'assinado'
        AND COALESCE(pt.status_processo, '') <> 'desistiu'
      ) AS tem_ressarcimento,
      (
        count(*) FILTER (WHERE pt.status_contrato = 'assinado') > 0
        AND COALESCE(
          bool_and(
            COALESCE(pt.status_processo, '') IN ('compensado', 'desistiu')
          ) FILTER (WHERE pt.status_contrato = 'assinado'),
          false
        )
      ) AS todos_encerrados
    FROM public.processos_teses pt
    GROUP BY pt.cliente_id
  )
SELECT
  c.id AS cliente_id,
  COALESCE(comp.tem_compensacao_mes_corrente, false) AS tem_compensacao_mes_corrente,
  COALESCE(comp.tem_compensacao_qualquer, false) AS tem_compensacao_qualquer,
  COALESCE(proc.tem_tese_ativa, false) AS tem_tese_ativa,
  COALESCE(proc.tem_alguma_tese_assinada, false) AS tem_alguma_tese_assinada,
  COALESCE(proc.todos_encerrados, false) AS todos_encerrados,
  COALESCE(proc.tem_reporto, false) AS tem_reporto,
  COALESCE(proc.tem_judicial, false) AS tem_judicial,
  comp.ultima_competencia_compensada,
  COALESCE(c.compensando_fintax, false) AS compensando_fintax,
  NULLIF(c.compensacao_outro_escritorio, '') AS compensacao_outro_escritorio,
  COALESCE(
    c.status_compensacao,
    CASE
      WHEN COALESCE(comp.tem_compensacao_mes_corrente, false)
        OR COALESCE(c.compensando_fintax, false)
        THEN 'compensando'
      WHEN COALESCE(proc.tem_reporto, false) THEN 'reporto'
      WHEN COALESCE(proc.todos_encerrados, false)
        OR c.status_operacional::text = 'fechado'
        THEN 'encerrado'
      ELSE NULL
    END
  ) AS status_principal,
  COALESCE(proc.tem_ressarcimento, false) AS tem_ressarcimento
FROM public.clientes c
LEFT JOIN comp ON comp.cliente_id = c.id
LEFT JOIN proc ON proc.cliente_id = c.id;

COMMENT ON VIEW public.v_clientes_status_compensacao IS
  'Status padrão: compensando, reporto ou encerrado. NULL é pendência de classificação, não status de negócio.';

REVOKE ALL ON FUNCTION public.pode_editar_clientes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cliente_responsaveis_elegiveis() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cliente_atualizar_operacao(uuid, text, public.estagio_esteira, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_editar_clientes(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cliente_responsaveis_elegiveis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_atualizar_operacao(uuid, text, public.estagio_esteira, uuid, boolean)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validar_status_processo_editavel()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.v_clientes_status_compensacao FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.v_clientes_status_compensacao TO authenticated;

COMMIT;
