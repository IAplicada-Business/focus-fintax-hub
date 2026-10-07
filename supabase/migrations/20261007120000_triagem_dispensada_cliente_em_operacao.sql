-- Triagem só trava quem ainda não opera.
--
-- A base legada foi importada direto em Triagem já compensando (36 clientes
-- ativos com status geral definido e triagem_realizada = false). A regra de
-- 20261006121000 exigia "triagem realizada + documento" de todos eles para
-- mudar de etapa, travando a ficha. Cliente com status geral definido
-- (compensando, reporto, encerrado, recuperacao_judicial,
-- ressarcimento_concluido) já está em operação: a triagem é etapa de quem
-- chega do funil comercial, não dele.
--
-- Também expõe clientes.status_compensacao em v_esteira_clientes para o
-- kanban aplicar a mesma regra no arrastar.

BEGIN;

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
  v_status_efetivo text;
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

  -- Status geral que vale depois deste salvar (o do formulário, senão o gravado).
  v_status_efetivo := NULLIF(btrim(COALESCE(p_status_compensacao, v_antes.status_compensacao, '')), '');

  IF p_estagio IS NOT NULL
     AND p_estagio IS DISTINCT FROM v_antes.estagio_esteira THEN
    IF v_antes.estagio_esteira = 'triagem'::public.estagio_esteira
       AND v_status_efetivo IS NULL
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

COMMENT ON COLUMN public.clientes.triagem_realizada IS
  'Operação concluiu a triagem. Obrigatório para sair da etapa Triagem no kanban/ficha quando o cliente ainda não tem status geral (não está em operação).';

-- Mesmas colunas da view vigente + status_compensacao no fim.
CREATE OR REPLACE VIEW public.v_esteira_clientes AS
 SELECT c.id,
    c.empresa,
    c.cnpj,
    c.segmento,
    c.regime_tributario,
    c.estagio_esteira,
    c.data_entrada_estagio,
    (EXTRACT(day FROM (now() - c.data_entrada_estagio)))::integer AS dias_na_etapa,
    s.sla_dias,
        CASE
            WHEN (s.sla_dias IS NULL) THEN false
            WHEN ((EXTRACT(day FROM (now() - c.data_entrada_estagio)))::integer > s.sla_dias) THEN true
            ELSE false
        END AS atrasado,
    c.responsavel_id,
    p.full_name AS responsavel_nome,
    COALESCE(l.origem, 'manual'::text) AS origem,
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
    c.triagem_documento_nome,
    c.status_compensacao
   FROM (((((clientes c
     LEFT JOIN esteira_sla_config s ON ((s.estagio = c.estagio_esteira)))
     LEFT JOIN leads l ON ((l.id = c.lead_id)))
     LEFT JOIN profiles p ON ((p.user_id = c.responsavel_id)))
     LEFT JOIN LATERAL ( SELECT bool_or((pt.tipo_recuperacao = 'compensacao'::tipo_recuperacao)) AS tem_compensacao,
            bool_or((pt.tipo_recuperacao = 'ressarcimento'::tipo_recuperacao)) AS tem_ressarcimento,
            bool_or((pt.tipo_recuperacao = 'recuperacao_judicial'::tipo_recuperacao)) AS tem_judicial,
            (count(*) FILTER (WHERE ((pt.status_contrato = 'assinado'::text) AND (pt.status_processo <> 'desistiu'::text))))::integer AS teses_assinadas
           FROM processos_teses pt
          WHERE (pt.cliente_id = c.id)) ramos ON (true))
     LEFT JOIN LATERAL ( SELECT h.tipo,
            h.descricao,
            h.created_at
           FROM cliente_historico h
          WHERE (h.cliente_id = c.id)
          ORDER BY h.created_at DESC
         LIMIT 1) ua ON (true))
  WHERE (c.status = 'ativo'::text);

COMMIT;
