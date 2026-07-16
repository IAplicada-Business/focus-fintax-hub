-- =============================================================================
-- PASSO 1/2 — só cria o valor ICMS no enum
-- Lovable SQL Editor → colar ESTE arquivo sozinho → Run → aguardar sucesso
-- Depois rode o PASSO 2.
-- =============================================================================

DO $$ BEGIN
  ALTER TYPE public.tributo ADD VALUE IF NOT EXISTS 'ICMS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
