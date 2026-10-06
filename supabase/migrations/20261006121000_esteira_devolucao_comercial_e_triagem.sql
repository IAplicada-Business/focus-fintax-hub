-- Continuação: usa o enum já commitado em 20261006120000.
-- Esteira: Devolução Comercial, status extras na ficha, triagem (sim/não + anexo)
-- e avanço comercial via RPC (comercial não tem UPDATE em clientes).

BEGIN;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_status_compensacao_chk;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_status_compensacao_chk
  CHECK (
    status_compensacao IS NULL
    OR status_compensacao IN (
      'compensando',
      'reporto',
      'encerrado',
      'recuperacao_judicial',
      'ressarcimento_concluido'
    )
  );

COMMENT ON COLUMN public.clientes.status_compensacao IS
  'Status geral na ficha: compensando, reporto, encerrado, recuperacao_judicial ou ressarcimento_concluido.';

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS triagem_realizada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS triagem_documento_path text,
  ADD COLUMN IF NOT EXISTS triagem_documento_nome text;

COMMENT ON COLUMN public.clientes.triagem_realizada IS
  'Operação concluiu a triagem. Obrigatório para sair da etapa Triagem no kanban/ficha.';
COMMENT ON COLUMN public.clientes.triagem_documento_path IS
  'Caminho no bucket cliente-documentos do documento de conclusão da triagem.';

INSERT INTO public.esteira_sla_config
  (estagio, label, sla_dias, ordem, ativo, atualizado_em)
VALUES
  ('triagem'::public.estagio_esteira, 'Triagem', 1, 1, true, now()),
  ('devolucao_comercial'::public.estagio_esteira, 'Devolução Comercial', 3, 2, true, now()),
  ('contrato_emitido'::public.estagio_esteira, 'Contrato Emitido', 3, 3, true, now()),
  ('contrato_assinado'::public.estagio_esteira, 'Contrato Assinado', 3, 4, true, now()),
  ('em_compensacao'::public.estagio_esteira, 'Em Compensação', 30, 5, true, now()),
  ('compensado'::public.estagio_esteira, 'Compensado', 5, 6, true, now()),
  ('concluido'::public.estagio_esteira, 'Concluído', NULL, 7, true, now())
ON CONFLICT (estagio) DO UPDATE SET
  label = EXCLUDED.label,
  sla_dias = EXCLUDED.sla_dias,
  ordem = EXCLUDED.ordem,
  ativo = EXCLUDED.ativo,
  atualizado_em = now();

UPDATE public.esteira_sla_config
SET ativo = false, ordem = 99, atualizado_em = now()
WHERE estagio::text NOT IN (
  'triagem',
  'devolucao_comercial',
  'contrato_emitido',
  'contrato_assinado',
  'em_compensacao',
  'compensado',
  'concluido'
);

CREATE OR REPLACE FUNCTION public.esteira_ordem_vigente(p_estagio public.estagio_esteira)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_estagio::text
    WHEN 'triagem' THEN 0
    WHEN 'devolucao_comercial' THEN 1
    WHEN 'contrato_emitido' THEN 2
    WHEN 'contrato_assinado' THEN 3
    WHEN 'em_compensacao' THEN 4
    WHEN 'compensado' THEN 5
    WHEN 'concluido' THEN 6
    ELSE -1
  END;
$$;

CREATE OR REPLACE FUNCTION public.esteira_papel_pode_emitir_contrato(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(p_uid, 'comercial'::public.app_role)
    OR public.has_role(p_uid, 'sdr'::public.app_role)
    OR public.has_role(p_uid, 'gestor_comercial'::public.app_role)
    OR public.has_role(p_uid, 'admin'::public.app_role)
    OR public.has_role(p_uid, 'pmo'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.esteira_validar_movimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.estagio_esteira IS NOT DISTINCT FROM NEW.estagio_esteira THEN
    RETURN NEW;
  END IF;

  IF OLD.estagio_esteira = 'devolucao_comercial'::public.estagio_esteira
     AND NEW.estagio_esteira = 'contrato_emitido'::public.estagio_esteira
     AND NOT public.esteira_papel_pode_emitir_contrato(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o comercial pode mover de Devolução Comercial para Contrato Emitido'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_esteira_validar_movimento ON public.clientes;
CREATE TRIGGER trg_clientes_esteira_validar_movimento
  BEFORE UPDATE OF estagio_esteira ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.esteira_validar_movimento();

CREATE OR REPLACE FUNCTION public.esteira_avancar_pelo_funil(
  p_cliente_id uuid,
  p_destino public.estagio_esteira
)
RETURNS public.estagio_esteira
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_atual public.estagio_esteira;
  v_novo public.estagio_esteira;
BEGIN
  IF NOT public.esteira_papel_pode_emitir_contrato(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o comercial pode avançar a esteira pelo funil'
      USING ERRCODE = '42501';
  END IF;

  SELECT estagio_esteira
  INTO v_atual
  FROM public.clientes
  WHERE id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_atual IS NULL
     OR public.esteira_ordem_vigente(v_atual) < 0
     OR public.esteira_ordem_vigente(p_destino) >= public.esteira_ordem_vigente(v_atual) THEN
    v_novo := p_destino;
  ELSE
    v_novo := v_atual;
  END IF;

  IF v_novo IS DISTINCT FROM v_atual THEN
    UPDATE public.clientes
    SET estagio_esteira = v_novo, atualizado_em = now()
    WHERE id = p_cliente_id;
  END IF;

  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION public.esteira_avancar_pelo_funil(uuid, public.estagio_esteira)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esteira_avancar_pelo_funil(uuid, public.estagio_esteira)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.esteira_ordem_vigente(public.estagio_esteira) TO authenticated;
GRANT EXECUTE ON FUNCTION public.esteira_papel_pode_emitir_contrato(uuid) TO authenticated;

COMMENT ON FUNCTION public.esteira_avancar_pelo_funil(uuid, public.estagio_esteira) IS
  'Avança a esteira a partir do funil comercial sem regressão. Usado porque comercial não tem UPDATE em clientes.';

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
SET search_path TO 'public'
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
     AND p_status_compensacao NOT IN (
       'compensando',
       'reporto',
       'encerrado',
       'recuperacao_judicial',
       'ressarcimento_concluido'
     ) THEN
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

  IF p_estagio IS NOT NULL
     AND p_estagio IS DISTINCT FROM v_antes.estagio_esteira THEN
    IF v_antes.estagio_esteira = 'triagem'::public.estagio_esteira
       AND (
         NOT COALESCE(v_antes.triagem_realizada, false)
         OR NULLIF(btrim(COALESCE(v_antes.triagem_documento_path, '')), '') IS NULL
       ) THEN
      RAISE EXCEPTION 'Conclua a triagem (realizada + documento) antes de avançar a etapa'
        USING ERRCODE = '23514';
    END IF;

    IF v_antes.estagio_esteira = 'devolucao_comercial'::public.estagio_esteira
       AND p_estagio = 'contrato_emitido'::public.estagio_esteira
       AND NOT (
         public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'pmo'::public.app_role)
       ) THEN
      RAISE EXCEPTION 'Somente o comercial pode mover de Devolução Comercial para Contrato Emitido'
        USING ERRCODE = '42501';
    END IF;
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

REVOKE ALL ON FUNCTION public.cliente_atualizar_operacao(uuid, text, public.estagio_esteira, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_atualizar_operacao(uuid, text, public.estagio_esteira, uuid, boolean)
  TO authenticated;

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
  ua.tipo AS ultima_acao_tipo,
  c.triagem_realizada,
  c.triagem_documento_path,
  c.triagem_documento_nome
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cliente-documentos',
  'cliente-documentos',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "operacao_select_cliente_documentos" ON storage.objects;
CREATE POLICY "operacao_select_cliente_documentos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'cliente-documentos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pmo'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
  )
);

DROP POLICY IF EXISTS "operacao_insert_cliente_documentos" ON storage.objects;
CREATE POLICY "operacao_insert_cliente_documentos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cliente-documentos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pmo'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
  )
);

DROP POLICY IF EXISTS "operacao_update_cliente_documentos" ON storage.objects;
CREATE POLICY "operacao_update_cliente_documentos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'cliente-documentos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pmo'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
  )
);

DROP POLICY IF EXISTS "operacao_delete_cliente_documentos" ON storage.objects;
CREATE POLICY "operacao_delete_cliente_documentos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'cliente-documentos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pmo'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::public.app_role)
  )
);

COMMIT;
