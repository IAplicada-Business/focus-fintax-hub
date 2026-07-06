
-- reforma_config: chaves de configuração do motor (cmv_pct_default, alíquotas, etc.)
CREATE TABLE public.reforma_config (
  chave text PRIMARY KEY,
  valor numeric NOT NULL,
  descricao text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reforma_config TO anon, authenticated;
GRANT ALL ON public.reforma_config TO service_role;
ALTER TABLE public.reforma_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reforma_config leitura pública" ON public.reforma_config FOR SELECT USING (true);
CREATE POLICY "reforma_config admin escreve" ON public.reforma_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed defaults do motor
INSERT INTO public.reforma_config (chave, valor, descricao) VALUES
  ('cmv_pct_default', 0.74, 'CMV padrão sobre faturamento'),
  ('multiplicador_cmv_vendas', 1.29, 'CMV × multiplicador = base venda'),
  ('aliquota_ibs_cbs_total', 0.28, 'Alíquota cheia IBS+CBS'),
  ('aliquota_reduzida', 0.14, 'Alíquota reduzida (50%)'),
  ('aliquota_imposto_seletivo', 0.14, 'Imposto seletivo'),
  ('mix_isento_zero', 0.2193, 'Mix isento'),
  ('mix_reducao_50', 0.3228, 'Mix redução 50%'),
  ('mix_cheia_28', 0.4604, 'Mix alíquota cheia'),
  ('mix_seletivo', 0.1087, 'Mix seletivo'),
  ('cbs_net_split', 0.3142857, 'Split CBS'),
  ('ibs_net_split', 0.6857143, 'Split IBS');

-- focus_indices: rubricas do DRE por segmento
CREATE TABLE public.focus_indices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento text NOT NULL,
  grupo text NOT NULL,
  rubrica text NOT NULL,
  percentual_sobre_faturamento numeric NOT NULL DEFAULT 0,
  gera_credito_ibs_cbs boolean NOT NULL DEFAULT false,
  entra_na_exclusao_credito boolean NOT NULL DEFAULT false,
  ordem_exibicao integer DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_focus_indices_segmento_ativo ON public.focus_indices(segmento, ativo);
GRANT SELECT ON public.focus_indices TO anon, authenticated;
GRANT ALL ON public.focus_indices TO service_role;
ALTER TABLE public.focus_indices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "focus_indices leitura pública" ON public.focus_indices FOR SELECT USING (true);
CREATE POLICY "focus_indices admin escreve" ON public.focus_indices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed mínimo p/ supermercado (percentuais indicativos — ajuste depois via config)
INSERT INTO public.focus_indices (segmento, grupo, rubrica, percentual_sobre_faturamento, gera_credito_ibs_cbs, entra_na_exclusao_credito, ordem_exibicao) VALUES
  ('supermercado', 'Despesas com Pessoal', 'Salários e encargos CLT', 0.08, false, false, 1),
  ('supermercado', 'Despesas com Pessoal', 'Benefícios (VR/VT/plano)',   0.015, true,  false, 2),
  ('supermercado', 'Desp. Gerais Administrativas', 'Aluguel', 0.012, true, false, 1),
  ('supermercado', 'Desp. Gerais Administrativas', 'Energia elétrica', 0.010, true, false, 2),
  ('supermercado', 'Desp. Gerais Administrativas', 'Serviços de terceiros', 0.008, true, false, 3),
  ('supermercado', 'Despesas com Vendas', 'Marketing e publicidade', 0.006, true, false, 1),
  ('supermercado', 'Despesas com Vendas', 'Comissões cartão',        0.018, false, true, 2),
  ('supermercado', 'Despesas Financeiras', 'Juros e tarifas bancárias', 0.005, false, true, 1);

-- calculadora_leads: capturas do formulário público
CREATE TABLE public.calculadora_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text NOT NULL,
  email text NOT NULL,
  segmento text NOT NULL,
  regime text NOT NULL,
  faturamento_mensal numeric NOT NULL,
  ja_faz_recuperacao boolean NOT NULL DEFAULT false,
  aceite_lgpd boolean NOT NULL DEFAULT false,
  aceite_lgpd_at timestamptz,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  ip_address text,
  user_agent text,
  resultado_dre_atual jsonb,
  resultado_dre_reforma jsonb,
  ibs_cbs_estimado numeric,
  economia_potencial_anual numeric,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.calculadora_leads TO authenticated;
GRANT ALL ON public.calculadora_leads TO service_role;
ALTER TABLE public.calculadora_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calc_leads admin lê" ON public.calculadora_leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- calculadora_snapshots: auditoria de versionamento
CREATE TABLE public.calculadora_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.calculadora_leads(id) ON DELETE CASCADE,
  focus_indices_snapshot jsonb NOT NULL,
  reforma_config_snapshot jsonb NOT NULL,
  input_payload jsonb NOT NULL,
  output_payload jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calc_snapshots_lead ON public.calculadora_snapshots(lead_id);
GRANT SELECT ON public.calculadora_snapshots TO authenticated;
GRANT ALL ON public.calculadora_snapshots TO service_role;
ALTER TABLE public.calculadora_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calc_snapshots admin lê" ON public.calculadora_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
