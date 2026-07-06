-- ============================================================================
-- CALCULADORA RT — BLOCO 1
--
-- Consolida o motor da Calculadora da Reforma Tributária:
--   * focus_indices              (motor Focus — 61 rubricas do supermercado)
--   * reforma_config             (parâmetros globais editáveis)
--   * reforma_aliquotas_departamento (11 seções do supermercado, Planilha1)
--   * calculadora_leads          (leads capturados via LP /calculadora)
--   * calculadora_snapshots      (versionamento de índices por lead)
--
-- Decisões aprovadas pela Mariana em 06/07 (após auditoria do Excel do Alcir):
--   D1. Débito calculado sobre (CMV × multiplicador_cmv_vendas), não sobre
--       o Faturamento direto. Multiplicador default = 1.29 (premissa Alcir).
--   D2. §12 da spec dispensada — Excel é ground truth. Testes vão congelar
--       saldo=-20.494 pra Fat=1.500.000.
--   D3. Modelo bruto + exclusões separadas (não crédito líquido).
--       Nova coluna focus_indices.entra_na_exclusao_credito marca as
--       6 rubricas de exclusão.
--   D4. Bugs do Excel (R23 F88 typo, K72 K78 dupla contagem) NÃO
--       replicados no motor — subtotais só somam suas próprias rubricas.
--   D5. Precisão dos índices puxada da coluna K do Excel (até 10 casas).
--
-- Estrutura anti-vazamento: RLS aberta em focus_indices/reforma_config/
-- reforma_aliquotas_departamento (calculadora usa sem login). Leads e
-- snapshots são gated por role (admin/pmo/comercial) e insert só via
-- service role (edge function).
-- ============================================================================


-- ============================================================================
-- 1) focus_indices
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.focus_indices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento text NOT NULL DEFAULT 'supermercado',
  grupo text NOT NULL,
  rubrica text NOT NULL,
  percentual_sobre_faturamento numeric(14,10) NOT NULL,
  gera_credito_ibs_cbs boolean NOT NULL DEFAULT true,
  entra_na_exclusao_credito boolean NOT NULL DEFAULT false,
  fornecedor_tipico text,
  ordem_exibicao int NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segmento, grupo, rubrica)
);

COMMENT ON TABLE public.focus_indices IS
  'Motor Focus — 61 rubricas do supermercado (Excel Alcir col K). D5.';
COMMENT ON COLUMN public.focus_indices.gera_credito_ibs_cbs IS
  'false = fundamentalmente não gera crédito (folha CLT).';
COMMENT ON COLUMN public.focus_indices.entra_na_exclusao_credito IS
  'D3: true = poderia gerar mas está excluído pelo modelo Alcir. Subtraído do crédito bruto na fase Confronto.';

CREATE INDEX IF NOT EXISTS ix_focus_indices_seg_grupo
  ON public.focus_indices (segmento, grupo, ordem_exibicao) WHERE ativo;


-- ============================================================================
-- 2) reforma_config
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reforma_config (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL,
  descricao text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.reforma_config IS
  'Parâmetros globais editáveis pelo Alcir sem PR (alíquotas, mix, transição ICMS, multiplicador CMV).';


-- ============================================================================
-- 3) reforma_aliquotas_departamento
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reforma_aliquotas_departamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento text NOT NULL,
  pct_mix_faturamento numeric(5,4),
  aliquota_atual numeric(5,4),
  aliquota_2027 numeric(5,4),
  tem_imposto_seletivo boolean DEFAULT false,
  variacao_pp numeric(6,2),
  impacto_preco_pct numeric(6,4),
  ordem int,
  ativo boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.reforma_aliquotas_departamento IS
  'Matriz de impacto por seção do supermercado (Planilha1 do Excel Alcir).';


-- ============================================================================
-- 4) calculadora_leads
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.calculadora_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  nome text NOT NULL,
  telefone text NOT NULL,
  email text NOT NULL,
  segmento text NOT NULL DEFAULT 'supermercado',
  regime text NOT NULL CHECK (regime IN ('simples','presumido','real')),
  faturamento_mensal numeric(14,2) NOT NULL,
  ja_faz_recuperacao boolean NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  ip_address inet,
  user_agent text,
  resultado_dre_atual jsonb,
  resultado_dre_reforma jsonb,
  ibs_cbs_estimado numeric(14,2),
  economia_potencial_anual numeric(14,2),
  pdf_url text,
  cliente_id uuid REFERENCES public.clientes(id),
  status_pipeline text DEFAULT 'novo',
  aceite_lgpd boolean NOT NULL DEFAULT false,
  aceite_lgpd_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_calc_leads_status ON public.calculadora_leads(status_pipeline);
CREATE INDEX IF NOT EXISTS ix_calc_leads_created ON public.calculadora_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_calc_leads_email   ON public.calculadora_leads(email);
CREATE INDEX IF NOT EXISTS ix_calc_leads_tel     ON public.calculadora_leads(telefone);

COMMENT ON TABLE public.calculadora_leads IS
  'Leads capturados via /calculadora. Insert só por edge function (service role).';


-- ============================================================================
-- 5) calculadora_snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.calculadora_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.calculadora_leads(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  focus_indices_snapshot jsonb NOT NULL,
  reforma_config_snapshot jsonb NOT NULL,
  input_payload jsonb NOT NULL,
  output_payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_calc_snapshots_lead ON public.calculadora_snapshots(lead_id);

COMMENT ON TABLE public.calculadora_snapshots IS
  'Snapshot do estado dos índices + config no momento da submissão. Se Alcir editar depois, leads antigos preservam o cálculo original.';


-- ============================================================================
-- 6) RLS + policies
-- ============================================================================

-- focus_indices: leitura anônima (calculadora usa sem login); escrita admin
ALTER TABLE public.focus_indices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "focus_indices_read_all" ON public.focus_indices;
CREATE POLICY "focus_indices_read_all" ON public.focus_indices
  FOR SELECT TO anon, authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "focus_indices_write_admin" ON public.focus_indices;
CREATE POLICY "focus_indices_write_admin" ON public.focus_indices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- reforma_config: idem
ALTER TABLE public.reforma_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reforma_config_read_all" ON public.reforma_config;
CREATE POLICY "reforma_config_read_all" ON public.reforma_config
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "reforma_config_write_admin" ON public.reforma_config;
CREATE POLICY "reforma_config_write_admin" ON public.reforma_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- reforma_aliquotas_departamento: idem
ALTER TABLE public.reforma_aliquotas_departamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reforma_dep_read_all" ON public.reforma_aliquotas_departamento;
CREATE POLICY "reforma_dep_read_all" ON public.reforma_aliquotas_departamento
  FOR SELECT TO anon, authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "reforma_dep_write_admin" ON public.reforma_aliquotas_departamento;
CREATE POLICY "reforma_dep_write_admin" ON public.reforma_aliquotas_departamento
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- calculadora_leads: leitura admin/pmo/comercial; nenhum insert via anon.
ALTER TABLE public.calculadora_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calc_leads_read_internal" ON public.calculadora_leads;
CREATE POLICY "calc_leads_read_internal" ON public.calculadora_leads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'comercial'::app_role)
  );

DROP POLICY IF EXISTS "calc_leads_update_internal" ON public.calculadora_leads;
CREATE POLICY "calc_leads_update_internal" ON public.calculadora_leads
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'comercial'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'comercial'::app_role)
  );
-- Insert somente via edge function (service role bypass).

-- calculadora_snapshots: idem
ALTER TABLE public.calculadora_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calc_snapshots_read_internal" ON public.calculadora_snapshots;
CREATE POLICY "calc_snapshots_read_internal" ON public.calculadora_snapshots
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'comercial'::app_role)
  );


-- ============================================================================
-- 7) SEED — reforma_config
-- ============================================================================
INSERT INTO public.reforma_config (chave, valor, descricao) VALUES
  ('aliquota_ibs_cbs_total',    '0.28',      'IBS+CBS somados (Reforma cheia 2033)'),
  ('aliquota_cbs',              '0.088',     'CBS federal'),
  ('aliquota_ibs',              '0.192',     'IBS subnacional'),
  ('cbs_net_split',             '0.3142857', 'Fração CBS do saldo (D118 do Excel)'),
  ('ibs_net_split',             '0.6857143', 'Fração IBS do saldo (D119 do Excel)'),
  ('aliquota_reduzida',         '0.14',      'Alíquota reduzida = metade da cheia'),
  ('aliquota_imposto_seletivo', '0.14',      'IS sobre categorias específicas'),
  ('cmv_pct_default',           '0.74',      'CMV assumido como % do Faturamento'),
  ('multiplicador_cmv_vendas',  '1.29',      'D1: Alcir aproxima Vendas ≈ CMV × 1.29. Débito IBS/CBS calculado sobre essa base, não sobre o Faturamento direto.'),
  ('mix_isento_zero',           '0.2193',    'Mix produtos alíquota zero'),
  ('mix_reducao_50',            '0.3228',    'Mix produtos redução 50%'),
  ('mix_cheia_28',              '0.4604',    'Mix produtos tributação cheia'),
  ('mix_seletivo',              '0.1087',    'Mix produtos com Imposto Seletivo (soma total mix = 111,12% — IS é overlap com cheia)'),
  ('icms_reducao_2029',         '0.10',      'Redução ICMS em 2029'),
  ('icms_reducao_2030',         '0.20',      'Redução ICMS em 2030'),
  ('icms_reducao_2031',         '0.30',      'Redução ICMS em 2031'),
  ('icms_reducao_2032',         '0.40',      'Redução ICMS em 2032'),
  ('icms_reducao_2033',         '1.00',      'ICMS extinto em 2033')
ON CONFLICT (chave) DO NOTHING;


-- ============================================================================
-- 8) SEED — reforma_aliquotas_departamento (Planilha1 do Excel Alcir)
-- ============================================================================
INSERT INTO public.reforma_aliquotas_departamento
  (departamento, pct_mix_faturamento, aliquota_atual, aliquota_2027, tem_imposto_seletivo, variacao_pp, impacto_preco_pct, ordem) VALUES
  ('Hortifruti / In Natura',              0.12, 0.0650, 0.0280, false, -3.70, -0.0400,  1),
  ('Açougue / Peixaria',                  0.15, 0.1280, 0.1400, false,  1.20,  0.0140,  2),
  ('Padaria / Confeitaria',               0.08, 0.1420, 0.1550, false,  1.30,  0.0150,  3),
  ('Laticínios / Frios',                  0.11, 0.1350, 0.1480, false,  1.30,  0.0150,  4),
  ('Mercearia Básica',                    0.14, 0.1200, 0.0950, false, -2.50, -0.0270,  5),
  ('Mercearia Seca / Ultraprocessados',   0.18, 0.1780, 0.2250, false,  4.70,  0.0580,  6),
  ('Bebidas (Refrigerantes/Sucos)',       0.09, 0.1850, 0.2650, false,  8.00,  0.1020,  7),
  ('Cervejas / Alcoólicas',               0.07, 0.1920, 0.2800, true,  10.50,  0.1380,  8),
  ('Higiene / Perfumaria',                0.06, 0.1650, 0.2100, false,  4.50,  0.0560,  9),
  ('Limpeza / Descartáveis',              0.05, 0.1580, 0.2300, false,  7.20,  0.0890, 10),
  ('Pet Shop / Outros',                   0.05, 0.1600, 0.1950, false,  3.50,  0.0420, 11);


-- ============================================================================
-- 9) SEED — focus_indices (61 rubricas — Excel col K)
--
-- Precisão puxada direto da coluna K (10 casas decimais). Subtotais bateram
-- dentro de 0.05 pp da tolerância (Pessoal 9.2654% / Adm 7.2550% /
-- Vendas 1.4086% / Financeiras 3.6872%).
--
-- Flag gera_credito_ibs_cbs:
--   false = folha CLT (12 rubricas de Salários a Aviso prévio)
--   true  = benefícios, materiais, serviços PJ
-- Flag entra_na_exclusao_credito (D3):
--   true = 6 rubricas que Alcir exclui do crédito por regra do modelo:
--          Propaganda, Desp. Op. Loja, Cartão Crédito, Juros Cheque
--          Especial, Juros Empréstimos, Perdas Estoque
-- ============================================================================
INSERT INTO public.focus_indices
  (segmento, grupo, rubrica, percentual_sobre_faturamento, gera_credito_ibs_cbs, entra_na_exclusao_credito, fornecedor_tipico, ordem_exibicao)
VALUES
-- CMV (parâmetro editável em reforma_config.cmv_pct_default; aqui é só espelho pra UI)
('supermercado', 'CMV', 'Custo Mercadoria Vendida',       0.7400000000, true,  false, 'PJ não-Simples',         1),

-- Despesas com Pessoal (folha CLT + benefícios)
('supermercado', 'Despesas com Pessoal', 'Salários',                                 0.0462800000, false, false, 'folha CLT', 10),
('supermercado', 'Despesas com Pessoal', 'Pró-Labore',                               0.0002000000, false, false, 'sócio',     11),
('supermercado', 'Despesas com Pessoal', 'Quebra de Caixa',                          0.0004000000, false, false, 'folha CLT', 12),
('supermercado', 'Despesas com Pessoal', 'Adicional noturno',                        0.0001000000, false, false, 'folha CLT', 13),
('supermercado', 'Despesas com Pessoal', 'Prêmios e Gratificações',                  0.0000000000, false, false, 'folha CLT', 14),
('supermercado', 'Despesas com Pessoal', 'Horas extras',                             0.0012000000, false, false, 'folha CLT', 15),
('supermercado', 'Despesas com Pessoal', 'Férias',                                   0.0048300000, false, false, 'folha CLT', 16),
('supermercado', 'Despesas com Pessoal', '13º Salário',                              0.0042000000, false, false, 'folha CLT', 17),
('supermercado', 'Despesas com Pessoal', 'FGTS',                                     0.0077600000, false, false, 'folha CLT', 18),
('supermercado', 'Despesas com Pessoal', 'INSS',                                     0.0166000000, false, false, 'folha CLT', 19),
('supermercado', 'Despesas com Pessoal', 'Multa rescisória FGTS',                    0.0003480000, false, false, 'folha CLT', 20),
('supermercado', 'Despesas com Pessoal', 'Aviso prévio/indenizações trabalhistas',   0.0035600000, false, false, 'folha CLT', 21),
('supermercado', 'Despesas com Pessoal', 'Uniformes e EPIs',                         0.0002480000, true,  false, 'PJ',        22),
('supermercado', 'Despesas com Pessoal', 'Vale Combustível',                         0.0000000000, true,  false, 'PJ',        23),
('supermercado', 'Despesas com Pessoal', 'Vale Transporte',                          0.0021348000, true,  false, 'PJ',        24),
('supermercado', 'Despesas com Pessoal', 'Despesas com Refeição',                    0.0021435600, true,  false, 'PJ',        25),
('supermercado', 'Despesas com Pessoal', 'Outros benefícios',                        0.0000000000, true,  false, 'PJ',        26),
('supermercado', 'Despesas com Pessoal', 'Exames Admissão/Periódico/Demissional',    0.0002143560, true,  false, 'PJ',        27),
('supermercado', 'Despesas com Pessoal', 'Plano de Saúde/Dental',                    0.0024348000, true,  false, 'PJ',        28),

-- Despesas Gerais Administrativas
('supermercado', 'Desp. Gerais Administrativas', 'Energia elétrica',                 0.0147314348, true,  false, 'PJ', 40),
('supermercado', 'Desp. Gerais Administrativas', 'Seguros',                          0.0006241393, true,  false, 'PJ', 41),
('supermercado', 'Desp. Gerais Administrativas', 'Telefones e Internet',             0.0002911082, true,  false, 'PJ', 42),
('supermercado', 'Desp. Gerais Administrativas', 'Água e esgoto',                    0.0014959271, true,  false, 'PJ', 43),
('supermercado', 'Desp. Gerais Administrativas', 'Aluguel e Condomínios',            0.0121309757, true,  false, 'PJ', 44),
('supermercado', 'Desp. Gerais Administrativas', 'Aluguel de Bens Móveis',           0.0017034776, true,  false, 'PJ', 45),
('supermercado', 'Desp. Gerais Administrativas', 'Bens de pequeno valor',            0.0006941149, true,  false, 'PJ', 46),
('supermercado', 'Desp. Gerais Administrativas', 'Gás',                              0.0009176801, true,  false, 'PJ', 47),
('supermercado', 'Desp. Gerais Administrativas', 'Taxa Aluguel Máq. Cartão',         0.0001414713, true,  false, 'PJ', 48),
('supermercado', 'Desp. Gerais Administrativas', 'Legais e Judiciais',               0.0011000000, true,  false, 'PJ', 49),
('supermercado', 'Desp. Gerais Administrativas', 'Manutenção e conservação',         0.0042000000, true,  false, 'PJ', 50),
('supermercado', 'Desp. Gerais Administrativas', 'Bobina, Etiqueta e Bandejas',      0.0034384970, true,  false, 'PJ', 51),
('supermercado', 'Desp. Gerais Administrativas', 'Serviços de Terceiros PJ',         0.0066000000, true,  false, 'PJ', 52),
('supermercado', 'Desp. Gerais Administrativas', 'Manutenção de Sistemas',           0.0018886047, true,  false, 'PJ', 53),
('supermercado', 'Desp. Gerais Administrativas', 'Material de Informática',          0.0002475075, true,  false, 'PJ', 54),
('supermercado', 'Desp. Gerais Administrativas', 'Combustíveis',                     0.0005951406, true,  false, 'PJ', 55),
('supermercado', 'Desp. Gerais Administrativas', 'Manutenção Veículos',              0.0005008443, true,  false, 'PJ', 56),
('supermercado', 'Desp. Gerais Administrativas', 'Feiras/Congressos/Cursos',         0.0000715783, true,  false, 'PJ', 57),
('supermercado', 'Desp. Gerais Administrativas', 'Material Uso e Consumo',           0.0018493908, true,  false, 'PJ', 58),
('supermercado', 'Desp. Gerais Administrativas', 'Material Uso e Consumo MP',        0.0081200000, true,  false, 'PJ', 59),
('supermercado', 'Desp. Gerais Administrativas', 'Lanches e Refeições',              0.0000000000, true,  false, 'PJ', 60),
('supermercado', 'Desp. Gerais Administrativas', 'Pedágios',                         0.0000297227, true,  false, 'PJ', 61),
('supermercado', 'Desp. Gerais Administrativas', 'Despesas com Obra',                0.0024000000, true,  false, 'PJ', 62),
('supermercado', 'Desp. Gerais Administrativas', 'Material de escritório',           0.0001782796, true,  false, 'PJ', 63),
('supermercado', 'Desp. Gerais Administrativas', 'Material de limpeza',              0.0014603199, true,  false, 'PJ', 64),
('supermercado', 'Desp. Gerais Administrativas', 'Estacionamento',                   0.0002393656, true,  false, 'PJ', 65),
('supermercado', 'Desp. Gerais Administrativas', 'Desp. Operacionais de Loja',       0.0069000000, true,  true,  'PJ (excluído D3)', 66),

-- Despesas com Vendas
('supermercado', 'Despesas com Vendas', 'Embalagens',                                0.0055462348, true,  false, 'PJ',                80),
('supermercado', 'Despesas com Vendas', 'Propaganda e Publicidade',                  0.0026405490, true,  true,  'PJ (excluído D3)',  81),
('supermercado', 'Despesas com Vendas', 'Fretes',                                    0.0015722707, true,  false, 'PJ',                82),
('supermercado', 'Despesas com Vendas', 'Franquias',                                 0.0034000000, true,  false, 'PJ',                83),
('supermercado', 'Despesas com Vendas', 'Associações',                               0.0009270614, true,  false, 'PJ',                84),

-- Despesas Financeiras
('supermercado', 'Despesas Financeiras', 'Despesas Bancárias',                       0.0000986985, true,  false, 'banco',                100),
('supermercado', 'Despesas Financeiras', 'Outras Financeiras',                       0.0006732122, true,  false, '—',                    101),
('supermercado', 'Despesas Financeiras', 'S/Vendas Cartão Crédito',                  0.0000000000, true,  true,  'operadora (excluído)', 102),
('supermercado', 'Despesas Financeiras', 'S/Vendas Cartão Crédito/Débito/Benefícios',0.0109429947, true,  false, 'operadora',            103),
('supermercado', 'Despesas Financeiras', 'Bonificações Enviadas',                    0.0000000000, true,  false, '—',                    104),
('supermercado', 'Despesas Financeiras', 'Multas Fiscais Punitivas',                 0.0003196735, true,  false, '—',                    105),
('supermercado', 'Despesas Financeiras', 'Juros s/Cheque Especial',                  0.0000004538, true,  true,  'banco (excluído D3)',  106),
('supermercado', 'Despesas Financeiras', 'Juros s/Empréstimos Bancários',            0.0027371563, true,  true,  'banco (excluído D3)',  107),
('supermercado', 'Despesas Financeiras', 'Perdas e Avarias Estoque',                 0.0221000000, true,  true,  '— (excluído D3)',      108)
ON CONFLICT (segmento, grupo, rubrica) DO NOTHING;
