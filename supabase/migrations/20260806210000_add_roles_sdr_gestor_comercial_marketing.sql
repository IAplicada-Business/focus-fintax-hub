-- Épica 6 (parcial) — novos roles: sdr, gestor_comercial, marketing.
-- ADD VALUE não pode ser usado na mesma transação em que o valor é
-- referenciado (regra do Postgres) — por isso fica em migration separada,
-- executada antes da que ajusta as RLS policies.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sdr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_comercial';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';
