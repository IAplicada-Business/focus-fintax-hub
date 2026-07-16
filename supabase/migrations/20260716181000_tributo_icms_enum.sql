-- Separado: novo valor de enum precisa de commit próprio (PG 55P04).
DO $$ BEGIN
  ALTER TYPE public.tributo ADD VALUE IF NOT EXISTS 'ICMS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
