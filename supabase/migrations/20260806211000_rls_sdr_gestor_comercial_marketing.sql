-- Épica 6 (parcial) — estende as policies que hoje liberam 'comercial' pra
-- também liberar 'sdr' e 'gestor_comercial' (decisão: mesmo escopo de dados
-- do comercial, confirmado com o usuário em 06/08/2026).
--
-- Tabelas como meta_ad_sets/meta_ads/meta_campaigns/meta_creatives/
-- meta_leadgen_forms/meta_insights_daily já liberam SELECT pra qualquer
-- usuário autenticado (auth.uid() IS NOT NULL) — não precisam de ajuste.
-- meta_leads é a exceção (só admin/pmo/comercial): estendida aqui também
-- pra 'marketing', pra Alonso ver os leads capturados pelos próprios
-- criativos que ele publica — sem isso a aba "Leads (Meta)" ficaria vazia
-- pra ele mesmo com acesso à tela liberado no screen-permissions.

-- benchmarks_teses
DROP POLICY IF EXISTS "Comercial select benchmarks" ON public.benchmarks_teses;
CREATE POLICY "Comercial select benchmarks" ON public.benchmarks_teses
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'comercial'::app_role) OR has_role(auth.uid(), 'sdr'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role));

-- cliente_historico
DROP POLICY IF EXISTS "comercial_select_historico" ON public.cliente_historico;
CREATE POLICY "comercial_select_historico" ON public.cliente_historico
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'comercial'::app_role) OR has_role(auth.uid(), 'sdr'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role));

-- clientes
DROP POLICY IF EXISTS "Comercial insert clientes" ON public.clientes;
CREATE POLICY "Comercial insert clientes" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'comercial'::app_role) OR has_role(auth.uid(), 'sdr'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role));

DROP POLICY IF EXISTS "Comercial select clientes" ON public.clientes;
CREATE POLICY "Comercial select clientes" ON public.clientes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'comercial'::app_role) OR has_role(auth.uid(), 'sdr'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role));

-- compensacoes_mensais
DROP POLICY IF EXISTS "compensacoes_read_cliente_comercial_visible" ON public.compensacoes_mensais;
CREATE POLICY "compensacoes_read_cliente_comercial_visible" ON public.compensacoes_mensais
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(), 'comercial'::app_role) OR has_role(auth.uid(), 'sdr'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role) OR has_role(auth.uid(), 'cliente'::app_role))
    AND (
      (tese_origem_id IS NULL)
      OR (EXISTS (
        SELECT 1 FROM teses_tributarias t
        WHERE t.id = compensacoes_mensais.tese_origem_id AND t.visivel_cliente = true
      ))
    )
  );

-- creditos_apurados
DROP POLICY IF EXISTS "creditos_read_via_tese" ON public.creditos_apurados;
CREATE POLICY "creditos_read_via_tese" ON public.creditos_apurados
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'gestor_tributario'::app_role)
    OR EXISTS (
      SELECT 1 FROM teses_tributarias t
      WHERE t.id = creditos_apurados.tese_id
        AND t.visivel_cliente = true
        AND (
          has_role(auth.uid(), 'comercial'::app_role)
          OR has_role(auth.uid(), 'sdr'::app_role)
          OR has_role(auth.uid(), 'gestor_comercial'::app_role)
          OR has_role(auth.uid(), 'cliente'::app_role)
        )
    )
  );

-- diagnosticos_leads
DROP POLICY IF EXISTS "Admin comercial pmo select diagnosticos" ON public.diagnosticos_leads;
CREATE POLICY "Admin comercial pmo select diagnosticos" ON public.diagnosticos_leads
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
  );

-- intimacoes
DROP POLICY IF EXISTS "intimacoes_comercial_read" ON public.intimacoes;
CREATE POLICY "intimacoes_comercial_read" ON public.intimacoes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'comercial'::app_role) OR has_role(auth.uid(), 'sdr'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role));

-- lead_historico
DROP POLICY IF EXISTS "Admin comercial pmo insert historico" ON public.lead_historico;
CREATE POLICY "Admin comercial pmo insert historico" ON public.lead_historico
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
  );

DROP POLICY IF EXISTS "Admin comercial pmo select historico" ON public.lead_historico;
CREATE POLICY "Admin comercial pmo select historico" ON public.lead_historico
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
  );

-- leads
DROP POLICY IF EXISTS "Admin comercial insert leads" ON public.leads;
CREATE POLICY "Admin comercial insert leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Admin comercial select leads" ON public.leads;
CREATE POLICY "Admin comercial select leads" ON public.leads
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Admin comercial update leads" ON public.leads;
CREATE POLICY "Admin comercial update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

-- meta_leads (também estendida pra 'marketing' — ver nota no topo do arquivo)
DROP POLICY IF EXISTS "ml_read" ON public.meta_leads;
CREATE POLICY "ml_read" ON public.meta_leads
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
    OR has_role(auth.uid(), 'marketing'::app_role)
  );

-- processos_teses
DROP POLICY IF EXISTS "Comercial select processos_teses" ON public.processos_teses;
CREATE POLICY "Comercial select processos_teses" ON public.processos_teses
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'comercial'::app_role) OR has_role(auth.uid(), 'sdr'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role));

-- relatorios_leads
DROP POLICY IF EXISTS "Admin comercial insert relatorios" ON public.relatorios_leads;
CREATE POLICY "Admin comercial insert relatorios" ON public.relatorios_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Admin comercial select relatorios" ON public.relatorios_leads;
CREATE POLICY "Admin comercial select relatorios" ON public.relatorios_leads
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Admin comercial update relatorios" ON public.relatorios_leads;
CREATE POLICY "Admin comercial update relatorios" ON public.relatorios_leads
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'sdr'::app_role)
    OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

-- teses_tributarias
DROP POLICY IF EXISTS "teses_read_visivel_cliente" ON public.teses_tributarias;
CREATE POLICY "teses_read_visivel_cliente" ON public.teses_tributarias
  FOR SELECT TO authenticated
  USING (
    visivel_cliente = true
    AND (
      has_role(auth.uid(), 'comercial'::app_role)
      OR has_role(auth.uid(), 'sdr'::app_role)
      OR has_role(auth.uid(), 'gestor_comercial'::app_role)
      OR has_role(auth.uid(), 'cliente'::app_role)
    )
  );
