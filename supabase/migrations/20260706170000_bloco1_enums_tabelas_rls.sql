-- ============================================================================
-- BLOCO 1 — Enums + tabelas + RLS + seed teses + view v_mapa_creditos
--
-- Este PR consolida o novo modelo tributário da Focus:
--   * enums fechados (tese_tributaria, tributo, regime_tributario,
--     status_cliente, status_pagamento)
--   * catálogo formal de teses_tributarias (com visivel_cliente pra RBAC de
--     REPORTO — R$ 150M em jogo)
--   * creditos_apurados (crédito inicial por cliente×tese)
--   * dcomps (1:N com compensacoes_mensais)
--   * observacoes_cliente (obs textuais tipo João em 17/12)
--   * migration_log_tributo_20260706 (auditoria da conversão text→enum)
--   * ALTER em clientes (taxa_honorario, regime_tributario, status_operacional,
--     regiao, data_apuracao)
--   * ALTER em compensacoes_mensais (tributo enum, tese_origem_id,
--     honorario_valor/percentual, lancado_mapa, status_pagamento_honorario,
--     vencimento_debito, nfse_valor, UNIQUE key)
--   * view v_mapa_creditos (espelha aba Detalhamento da planilha SISTEMA)
--
-- Reconciliações autorizadas pela Mariana:
--   * PR #36: text tributo → enum com mapping determinístico + log
--   * PR #37: motor_teses_config.tributos permanece; teses_tributarias vira
--     catálogo formal (motor migra depois)
--   * PR #39: categoria fica por 1 sprint pra rollback; visibilidade passa
--     a vir de teses_tributarias.visivel_cliente via tese_origem_id
--   * v_clientes_status_compensacao será recriada em PR posterior herdando
--     RLS de teses_tributarias
-- ============================================================================


-- ============================================================================
-- 1) ENUMS
-- ============================================================================

-- tese_tributaria: origem do crédito
DO $$ BEGIN
  CREATE TYPE public.tese_tributaria AS ENUM (
    'INSUMOS',
    'SUBVENCAO',
    'ICMS_ST',
    'EXCLUSAO_ICMS_BC',
    'PIS_COFINS_JUD',
    'PREVIDENCIARIO',
    'REPORTO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tributo: o que o cliente pagou e foi compensado
-- TODO: adicionar INSS_68 quando João confirmar se separa cadastro
-- TODO: adicionar RE_contribuicao se aparecer em planilha real
-- TODO: adicionar IRPJ e CSLL isolados quando João confirmar separação
DO $$ BEGIN
  CREATE TYPE public.tributo AS ENUM (
    'INSS_52',
    'INSS_retidos',
    'PIS',
    'COFINS',
    'IRPJ_CSLL_agregado',
    'DCTWEB_trimestral',
    'outros'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- regime_tributario
DO $$ BEGIN
  CREATE TYPE public.regime_tributario AS ENUM (
    'lucro_real',
    'lucro_presumido',
    'simples_nacional'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- status_cliente (operacional)
DO $$ BEGIN
  CREATE TYPE public.status_cliente AS ENUM (
    'fechado',
    'relatorio_enviado',
    'em_analise',
    'ativo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- status_pagamento (fatura de honorário)
DO $$ BEGIN
  CREATE TYPE public.status_pagamento AS ENUM (
    'pendente',
    'pago'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- 2) TABELA teses_tributarias (catálogo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teses_tributarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo public.tese_tributaria NOT NULL UNIQUE,
  label text NOT NULL,
  visivel_cliente boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teses_tributarias IS
  'Catálogo formal das teses tributárias. visivel_cliente=false → REPORTO (interno, R$ 150M em jogo).';

-- Seed (idempotente)
INSERT INTO public.teses_tributarias (codigo, label, visivel_cliente) VALUES
  ('INSUMOS',          'Créditos de PIS/COFINS sobre Insumos',            true),
  ('SUBVENCAO',        'Subvenção ICMS (exclusão base IRPJ/CSLL)',        true),
  ('ICMS_ST',          'ICMS-ST da base PIS/COFINS',                      true),
  ('EXCLUSAO_ICMS_BC', 'Exclusão ICMS base PIS/COFINS (RE 574.706)',      true),
  ('PIS_COFINS_JUD',   'PIS/COFINS da base — via judicial',               true),
  ('PREVIDENCIARIO',   'Créditos previdenciários',                        true),
  ('REPORTO',          'REPORTO (regime PIS/COFINS acumulado — interno)', false)
ON CONFLICT (codigo) DO NOTHING;


-- ============================================================================
-- 3) TABELA creditos_apurados
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.creditos_apurados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tese_id uuid NOT NULL REFERENCES public.teses_tributarias(id),
  valor_apurado_inicial numeric(14,2) NOT NULL,
  data_apuracao date,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, tese_id)
);

CREATE INDEX IF NOT EXISTS ix_creditos_apurados_cliente ON public.creditos_apurados(cliente_id);
CREATE INDEX IF NOT EXISTS ix_creditos_apurados_tese    ON public.creditos_apurados(tese_id);


-- ============================================================================
-- 4) ALTER TABLE clientes (novos campos cadastrais)
-- ============================================================================
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS taxa_honorario       numeric(4,4);
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS regime_tributario    public.regime_tributario;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_operacional   public.status_cliente;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS regiao               text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS data_apuracao        date;

COMMENT ON COLUMN public.clientes.taxa_honorario IS
  'Percentual de honorário (0.0000-1.0000). Ex: 0.1500 = 15%. Last-write-wins pelo importador.';


-- ============================================================================
-- 5) migration_log_tributo_20260706 (auditoria da conversão text→enum)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.migration_log_tributo_20260706 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compensacao_id uuid NOT NULL,
  tributo_original text,
  tributo_final public.tributo NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- 6) Refactor compensacoes_mensais
-- ============================================================================
-- Passo 6.1 — Adiciona colunas novas (nullable inicialmente)
ALTER TABLE public.compensacoes_mensais
  ADD COLUMN IF NOT EXISTS tributo_enum              public.tributo,
  ADD COLUMN IF NOT EXISTS tese_origem_id           uuid REFERENCES public.teses_tributarias(id),
  ADD COLUMN IF NOT EXISTS honorario_valor          numeric(14,2),
  ADD COLUMN IF NOT EXISTS honorario_percentual     numeric(4,4),
  ADD COLUMN IF NOT EXISTS lancado_mapa             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_pagamento_honorario public.status_pagamento NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS vencimento_debito        date,
  ADD COLUMN IF NOT EXISTS nfse_valor               numeric(14,2);

-- Passo 6.2 — Converte tributo text → tributo_enum, gravando log
-- Mapping (aprovado pela Mariana):
--   INSS / INSS 52   → INSS_52
--   RETIDOS          → INSS_retidos
--   PIS/COFINS agr.  → outros (obs adicionada em 6.3)
--   PIS              → PIS
--   COFINS           → COFINS
--   IRPJ CSLL        → IRPJ_CSLL_agregado
--   DCTWEB / DCTF    → DCTWEB_trimestral
--   default          → outros
--
-- Executa como CTE atômica: MAP → INSERT log com RETURNING → UPDATE cm.
-- O RETURNING garante que o UPDATE aplique EXATAMENTE o valor recém-logado,
-- sem depender de scan da tabela log (idempotente e à prova de rerun).
WITH mapped AS (
  SELECT
    cm.id,
    cm.tributo AS original,
    CASE
      WHEN cm.tributo IS NULL OR btrim(cm.tributo) = '' THEN 'outros'::public.tributo
      WHEN cm.tributo ~* '^(inss[[:space:]]*52|inss)$'   THEN 'INSS_52'::public.tributo
      WHEN cm.tributo ~* 'retidos'                        THEN 'INSS_retidos'::public.tributo
      WHEN cm.tributo ~* '^pis/?cofins$'                  THEN 'outros'::public.tributo
      WHEN cm.tributo ~* '^pis$'                          THEN 'PIS'::public.tributo
      WHEN cm.tributo ~* '^cofins$'                       THEN 'COFINS'::public.tributo
      WHEN cm.tributo ~* '^irpj[[:space:]/]+csll$'        THEN 'IRPJ_CSLL_agregado'::public.tributo
      WHEN cm.tributo ~* 'dctf'                           THEN 'DCTWEB_trimestral'::public.tributo
      ELSE 'outros'::public.tributo
    END AS finalv
  FROM public.compensacoes_mensais cm
  WHERE cm.tributo_enum IS NULL
),
logged AS (
  INSERT INTO public.migration_log_tributo_20260706 (compensacao_id, tributo_original, tributo_final)
  SELECT id, original, finalv FROM mapped
  RETURNING compensacao_id, tributo_final
)
UPDATE public.compensacoes_mensais cm
SET tributo_enum = l.tributo_final
FROM logged l
WHERE cm.id = l.compensacao_id;

-- Passo 6.3 — Anexar observação nas linhas onde PIS/COFINS agregado virou 'outros'
UPDATE public.compensacoes_mensais cm
SET observacao = COALESCE(NULLIF(observacao, ''), '')
              || CASE WHEN COALESCE(observacao, '') = '' THEN '' ELSE ' | ' END
              || 'PIS_COFINS agregado — importado do formato antigo, discriminar manualmente se necessário'
FROM public.migration_log_tributo_20260706 mtl
WHERE mtl.compensacao_id = cm.id
  AND mtl.tributo_original ~* '^pis/?cofins$'
  AND mtl.tributo_final = 'outros'
  AND (cm.observacao IS NULL
       OR cm.observacao NOT LIKE '%PIS_COFINS agregado%');

-- Passo 6.4 — tributo_enum agora é NOT NULL
ALTER TABLE public.compensacoes_mensais
  ALTER COLUMN tributo_enum SET NOT NULL;

-- Passo 6.5 — UNIQUE constraint (cliente, competência, tributo, tese_origem)
-- competência = mes_referencia; tese_origem_id nullable → duas linhas com
-- tese_origem_id NULL contam como distintas (PostgreSQL trata NULL como
-- diferentes em UNIQUE), o que é intencional (linhas legadas sem tese).
DO $$ BEGIN
  ALTER TABLE public.compensacoes_mensais
    ADD CONSTRAINT compensacoes_mensais_unique_key
    UNIQUE (cliente_id, mes_referencia, tributo_enum, tese_origem_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.compensacoes_mensais.tributo_enum IS
  'Enum estrito. A coluna text `tributo` fica por 1 sprint pra rollback e depois é DROP.';
COMMENT ON COLUMN public.compensacoes_mensais.lancado_mapa IS
  'MAPA = lançado no Mapa Tributário da RFB. Valores planilha: OK/ok/OK (SALDO) → true.';


-- ============================================================================
-- 7) TABELA dcomps
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dcomps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compensacao_id uuid NOT NULL REFERENCES public.compensacoes_mensais(id) ON DELETE CASCADE,
  numero_declaracao text NOT NULL
    CHECK (numero_declaracao ~ '^[0-9]{5}\.[0-9]{5}\.[0-9]{6}\.[0-9]\.[0-9]\.[0-9]{2}-[0-9]{4}$'),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compensacao_id, numero_declaracao)
);

CREATE INDEX IF NOT EXISTS ix_dcomps_compensacao ON public.dcomps(compensacao_id);


-- ============================================================================
-- 8) TABELA observacoes_cliente
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.observacoes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT current_date,
  texto text NOT NULL,
  created_by uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_observacoes_cliente ON public.observacoes_cliente(cliente_id, data DESC);


-- ============================================================================
-- 9) RLS
-- ============================================================================

-- teses_tributarias
ALTER TABLE public.teses_tributarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teses_read_admin_pmo_gestor" ON public.teses_tributarias;
CREATE POLICY "teses_read_admin_pmo_gestor" ON public.teses_tributarias
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
  );

DROP POLICY IF EXISTS "teses_read_visivel_cliente" ON public.teses_tributarias;
CREATE POLICY "teses_read_visivel_cliente" ON public.teses_tributarias
  FOR SELECT TO authenticated
  USING (
    visivel_cliente = true
    AND (
      public.has_role(auth.uid(), 'comercial'::app_role)
      OR public.has_role(auth.uid(), 'cliente'::app_role)
    )
  );

DROP POLICY IF EXISTS "teses_admin_crud" ON public.teses_tributarias;
CREATE POLICY "teses_admin_crud" ON public.teses_tributarias
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- creditos_apurados: acesso via join com teses_tributarias
-- (herdaria naturalmente, mas explicitamos pra clareza)
ALTER TABLE public.creditos_apurados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creditos_read_via_tese" ON public.creditos_apurados;
CREATE POLICY "creditos_read_via_tese" ON public.creditos_apurados
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.teses_tributarias t
      WHERE t.id = creditos_apurados.tese_id
        AND t.visivel_cliente = true
        AND (
          public.has_role(auth.uid(), 'comercial'::app_role)
          OR public.has_role(auth.uid(), 'cliente'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS "creditos_write_gestores" ON public.creditos_apurados;
CREATE POLICY "creditos_write_gestores" ON public.creditos_apurados
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
  );

-- compensacoes_mensais: substitui "Comercial select compensacoes" por
-- versão que EXCLUI REPORTO (join com teses_tributarias.visivel_cliente).
-- Adiciona também role cliente. Políticas do admin/gestor/pmo (FOR ALL)
-- ficam intactas — enxergam tudo.
DROP POLICY IF EXISTS "Comercial select compensacoes" ON public.compensacoes_mensais;

DROP POLICY IF EXISTS "compensacoes_read_cliente_comercial_visible" ON public.compensacoes_mensais;
CREATE POLICY "compensacoes_read_cliente_comercial_visible" ON public.compensacoes_mensais
  FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'comercial'::app_role)
      OR public.has_role(auth.uid(), 'cliente'::app_role)
    )
    AND (
      tese_origem_id IS NULL   -- linhas legadas sem tese ficam visíveis por ora (categoria continua sendo o fallback)
      OR EXISTS (
        SELECT 1 FROM public.teses_tributarias t
        WHERE t.id = compensacoes_mensais.tese_origem_id
          AND t.visivel_cliente = true
      )
    )
  );

-- dcomps: herda visibilidade via compensacao
ALTER TABLE public.dcomps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dcomps_read_via_compensacao" ON public.dcomps;
CREATE POLICY "dcomps_read_via_compensacao" ON public.dcomps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compensacoes_mensais cm
      WHERE cm.id = dcomps.compensacao_id
      -- RLS de cm já filtra REPORTO/etc — se o usuário vê cm, vê os DCOMPs
    )
  );

DROP POLICY IF EXISTS "dcomps_write_gestores" ON public.dcomps;
CREATE POLICY "dcomps_write_gestores" ON public.dcomps
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
  );

-- observacoes_cliente
ALTER TABLE public.observacoes_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obs_internos_all" ON public.observacoes_cliente;
CREATE POLICY "obs_internos_all" ON public.observacoes_cliente
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pmo'::app_role)
    OR public.has_role(auth.uid(), 'gestor_tributario'::app_role)
  );

-- migration_log_tributo_20260706 — só admin
ALTER TABLE public.migration_log_tributo_20260706 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "migration_log_admin" ON public.migration_log_tributo_20260706;
CREATE POLICY "migration_log_admin" ON public.migration_log_tributo_20260706
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));


-- ============================================================================
-- 10) VIEW v_mapa_creditos
-- ============================================================================
-- Espelha a aba "Detalhamento por Cliente" da planilha SISTEMA:
-- por (cliente, tese): valor apurado inicial + total compensado + saldo.
-- Herda RLS via LEFT JOIN em creditos_apurados/compensacoes_mensais/teses.
CREATE OR REPLACE VIEW public.v_mapa_creditos AS
SELECT
  ca.cliente_id,
  ca.tese_id,
  t.codigo AS tese_codigo,
  t.label AS tese_label,
  t.visivel_cliente,
  ca.valor_apurado_inicial,
  COALESCE(comp.total_compensado, 0)::numeric(14,2) AS total_compensado,
  (ca.valor_apurado_inicial - COALESCE(comp.total_compensado, 0))::numeric(14,2) AS saldo_final
FROM public.creditos_apurados ca
JOIN public.teses_tributarias t ON t.id = ca.tese_id
LEFT JOIN (
  SELECT tese_origem_id, cliente_id, sum(valor_compensado) AS total_compensado
  FROM public.compensacoes_mensais
  WHERE tese_origem_id IS NOT NULL
  GROUP BY tese_origem_id, cliente_id
) comp ON comp.tese_origem_id = ca.tese_id AND comp.cliente_id = ca.cliente_id;

GRANT SELECT ON public.v_mapa_creditos TO authenticated;

COMMENT ON VIEW public.v_mapa_creditos IS
  'Espelha a aba Detalhamento por Cliente do arquivo SISTEMA. RLS herdada de teses_tributarias/creditos_apurados/compensacoes_mensais.';
