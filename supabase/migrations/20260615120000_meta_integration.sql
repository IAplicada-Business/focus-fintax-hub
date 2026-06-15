-- ============================================================================
-- Focus FinTax · Meta Ads Integration · Etapa 1 (Schema + View)
-- Padrão mads_* do CRMIAplicada, adaptado ao schema real da Focus.
--
-- AJUSTES vs spec do doc Focus_Meta_Integration_Pack.md:
--   · leads.created_at  → leads.criado_em                     (coluna real)
--   · relatorios_leads.recuperacao_estimada
--       → estimativa_total_minima / estimativa_total_maxima   (colunas reais)
--   · Policies usam cast '::public.app_role' (padrão da Focus)
-- ============================================================================

-- 1) Credenciais (1 linha; tudo o que liga a Focus à conta Meta)
CREATE TABLE public.meta_credentials (
  id                     bigserial PRIMARY KEY,
  app_id                 text NOT NULL,
  business_id            text,
  ad_account_id          text NOT NULL UNIQUE,
  page_id                text NOT NULL,
  pixel_id               text,
  ig_business_account_id text,
  waba_id                text,
  webhook_verify_token   text NOT NULL,
  active                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc_read ON public.meta_credentials FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'pmo'::public.app_role));
CREATE POLICY mc_write ON public.meta_credentials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Campanhas
CREATE TABLE public.meta_campaigns (
  id              text PRIMARY KEY,
  ad_account_id   text NOT NULL,
  name            text,
  status          text,
  objective       text,
  daily_budget    numeric,
  lifetime_budget numeric,
  start_time      timestamptz,
  stop_time       timestamptz,
  created_time    timestamptz,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_meta_campaigns_acc ON public.meta_campaigns(ad_account_id);
ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY mc2_read ON public.meta_campaigns FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 3) Ad sets
CREATE TABLE public.meta_ad_sets (
  id              text PRIMARY KEY,
  campaign_id     text REFERENCES public.meta_campaigns(id) ON DELETE SET NULL,
  name            text,
  status          text,
  daily_budget    numeric,
  targeting       jsonb,
  start_time      timestamptz,
  end_time        timestamptz,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_meta_ad_sets_campaign ON public.meta_ad_sets(campaign_id);
ALTER TABLE public.meta_ad_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY mas_read ON public.meta_ad_sets FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 4) Criativos
CREATE TABLE public.meta_creatives (
  id              text PRIMARY KEY,
  name            text,
  title           text,
  body            text,
  thumbnail_url   text,
  image_url       text,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcr_read ON public.meta_creatives FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 5) Ads
CREATE TABLE public.meta_ads (
  id              text PRIMARY KEY,
  campaign_id     text REFERENCES public.meta_campaigns(id) ON DELETE SET NULL,
  ad_set_id       text REFERENCES public.meta_ad_sets(id) ON DELETE SET NULL,
  creative_id     text REFERENCES public.meta_creatives(id) ON DELETE SET NULL,
  name            text,
  status          text,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_meta_ads_campaign ON public.meta_ads(campaign_id);
CREATE INDEX ix_meta_ads_adset    ON public.meta_ads(ad_set_id);
ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ma_read ON public.meta_ads FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 6) Formulários de leadgen
CREATE TABLE public.meta_leadgen_forms (
  id              text PRIMARY KEY,
  page_id         text NOT NULL,
  name            text,
  status          text,
  leads_count     int,
  questions       jsonb,
  created_time    timestamptz,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_meta_forms_page ON public.meta_leadgen_forms(page_id);
ALTER TABLE public.meta_leadgen_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY mlf_read ON public.meta_leadgen_forms FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 7) Insights diários
CREATE TABLE public.meta_insights_daily (
  id                   bigserial PRIMARY KEY,
  level                text NOT NULL CHECK (level IN ('account','campaign','adset','ad')),
  object_id            text NOT NULL,
  date                 date NOT NULL,
  spend                numeric,
  impressions          bigint,
  reach                bigint,
  frequency            numeric,
  clicks               bigint,
  link_clicks          bigint,
  ctr                  numeric,
  cpc                  numeric,
  cpm                  numeric,
  leads                bigint,
  cost_per_lead        numeric,
  actions              jsonb,
  cost_per_action_type jsonb,
  raw                  jsonb,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, object_id, date)
);
CREATE INDEX ix_mid_date   ON public.meta_insights_daily(date DESC);
CREATE INDEX ix_mid_object ON public.meta_insights_daily(level, object_id);
ALTER TABLE public.meta_insights_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY mid_read ON public.meta_insights_daily FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 8) Leads do Meta (PII!) — RLS estrita
CREATE TABLE public.meta_leads (
  id                   text PRIMARY KEY,                                       -- leadgen_id do Meta
  form_id              text REFERENCES public.meta_leadgen_forms(id) ON DELETE SET NULL,
  ad_id                text,
  campaign_id          text,
  page_id              text NOT NULL,
  created_time         timestamptz,
  field_data           jsonb NOT NULL,                                         -- payload bruto, auditoria
  -- desnormalizado p/ busca rápida
  email                text,
  phone                text,
  cnpj                 text,
  razao_social         text,
  nome                 text,
  segmento             text,
  regime_tributacao    text,
  faturamento_faixa    text,
  faturamento_estimado numeric,
  ja_fez_compensacao   boolean,
  -- ligação com o CRM da Focus
  crm_lead_id          uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  processed_at         timestamptz,
  error_text           text,
  raw                  jsonb,
  inserted_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ml_email    ON public.meta_leads(email);
CREATE INDEX ix_ml_cnpj     ON public.meta_leads(cnpj);
CREATE INDEX ix_ml_crm_lead ON public.meta_leads(crm_lead_id);
CREATE INDEX ix_ml_created  ON public.meta_leads(created_time DESC);
ALTER TABLE public.meta_leads ENABLE ROW LEVEL SECURITY;
-- Leitura: admin / pmo / comercial (PII)
CREATE POLICY ml_read ON public.meta_leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'pmo'::public.app_role)
      OR public.has_role(auth.uid(), 'comercial'::public.app_role));
-- escrita só via service role (edge function meta-webhook); sem policy de INSERT/UPDATE.

-- 9) Log de execução das edge functions
CREATE TABLE public.meta_execution_log (
  id              bigserial PRIMARY KEY,
  function_name   text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  ok              boolean,
  rows_affected   int,
  error_text      text,
  context         jsonb
);
CREATE INDEX ix_mel_started ON public.meta_execution_log(started_at DESC);
ALTER TABLE public.meta_execution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY mel_read ON public.meta_execution_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'pmo'::public.app_role));

-- ============================================================================
-- View que cruza meta_leads com o CRM existente (leads / relatorios_leads / clientes)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_meta_lead_funnel AS
SELECT
  ml.id                          AS meta_lead_id,
  ml.created_time                AS lead_at,
  ml.email,
  ml.phone,
  ml.nome,
  ml.cnpj,
  ml.razao_social,
  ml.segmento,
  ml.regime_tributacao,
  ml.faturamento_faixa,
  ml.faturamento_estimado,
  ml.ja_fez_compensacao,
  mc.id                          AS campaign_id,
  mc.name                        AS campaign_name,
  mc.objective,
  ma.id                          AS ad_id,
  ma.name                        AS ad_name,
  mf.name                        AS form_name,
  l.id                           AS crm_lead_id,
  l.status                       AS crm_status,
  l.criado_em                    AS crm_lead_at,
  rl.id                          AS relatorio_id,
  rl.estimativa_total_minima     AS valor_estimado_min,
  rl.estimativa_total_maxima     AS valor_estimado_max,
  rl.score                       AS relatorio_score,
  cli.id                         AS cliente_id,
  cli.status                     AS cliente_status
FROM public.meta_leads ml
LEFT JOIN public.meta_campaigns      mc  ON mc.id  = ml.campaign_id
LEFT JOIN public.meta_ads            ma  ON ma.id  = ml.ad_id
LEFT JOIN public.meta_leadgen_forms  mf  ON mf.id  = ml.form_id
LEFT JOIN public.leads               l   ON l.id   = ml.crm_lead_id
LEFT JOIN public.relatorios_leads    rl  ON rl.lead_id = l.id
LEFT JOIN public.clientes            cli ON cli.lead_id = l.id;

GRANT SELECT ON public.v_meta_lead_funnel TO authenticated;
