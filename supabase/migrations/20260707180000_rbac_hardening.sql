-- ================================================================
-- Hardening RBAC pós-reunião de 07/jul/26
-- ================================================================
-- Ajuste 1: compensacoes_mensais — remover fallback "tese_origem_id IS NULL"
--   da política de leitura de comercial/cliente.
--
--   Motivo: linhas legadas importadas antes do Bloco 3 podem estar sem
--   tese_origem_id preenchida. O fallback deixava essas linhas visíveis
--   para comercial/cliente mesmo que fossem REPORTO. Para eliminar o
--   vazamento potencial, a política agora exige tese_origem_id NOT NULL
--   E teses_tributarias.visivel_cliente = true.
--
--   Impacto operacional:
--   - Se houver linhas em compensacoes_mensais com tese_origem_id IS NULL,
--     elas continuarão visíveis para admin/pmo/gestor (que têm FOR ALL),
--     mas SUMIREM para comercial/cliente.
--   - Para vincular essas linhas legadas à tese correta, rodar depois:
--       UPDATE public.compensacoes_mensais
--       SET tese_origem_id = (SELECT id FROM teses_tributarias WHERE codigo = 'INSUMOS')
--       WHERE tese_origem_id IS NULL AND categoria = 'compensacao';
--     (ou o código da tese apropriado)
-- ================================================================

DROP POLICY IF EXISTS "compensacoes_read_cliente_comercial_visible" ON public.compensacoes_mensais;

CREATE POLICY "compensacoes_read_cliente_comercial_visible" ON public.compensacoes_mensais
  FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'comercial'::app_role)
      OR public.has_role(auth.uid(), 'cliente'::app_role)
    )
    AND tese_origem_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.teses_tributarias t
      WHERE t.id = compensacoes_mensais.tese_origem_id
        AND t.visivel_cliente = true
    )
  );

COMMENT ON POLICY "compensacoes_read_cliente_comercial_visible"
  ON public.compensacoes_mensais IS
  'Comercial/cliente veem apenas compensações vinculadas a uma tese visível ao cliente. Fallback tese_origem_id IS NULL foi removido em 07/jul/26 para eliminar vazamento potencial de REPORTO em dados legados.';
