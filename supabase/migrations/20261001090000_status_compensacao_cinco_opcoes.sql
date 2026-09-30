-- Status geral do cliente com as 5 opções do filtro (AGF set/2026):
-- Total Compensados (compensando) · Possíveis recebimentos (reporto) ·
-- Encerrado / Liquidado (encerrado) · Recuperação Judicial · Ressarcimento
-- concluído. Até aqui o cadastro só aceitava as 3 primeiras.
-- A view v_clientes_status_compensacao já repassa clientes.status_compensacao
-- como status_principal, então não precisa mudar.

BEGIN;

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_status_compensacao_chk;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_status_compensacao_chk CHECK (
    status_compensacao IS NULL
    OR status_compensacao IN (
      'compensando', 'reporto', 'encerrado',
      'recuperacao_judicial', 'ressarcimento_concluido'
    )
  );

CREATE OR REPLACE FUNCTION public.cliente_atualizar_operacao(
  p_cliente_id uuid,
  p_status_compensacao text DEFAULT NULL::text,
  p_estagio estagio_esteira DEFAULT NULL::estagio_esteira,
  p_responsavel_id uuid DEFAULT NULL::uuid,
  p_atualizar_responsavel boolean DEFAULT false
)
RETURNS clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
       'compensando', 'reporto', 'encerrado',
       'recuperacao_judicial', 'ressarcimento_concluido'
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
$function$;

COMMIT;
