-- Valor novo precisa commitar antes de entrar em esteira_sla_config / clientes.
ALTER TYPE public.estagio_esteira ADD VALUE IF NOT EXISTS 'devolucao_comercial';
