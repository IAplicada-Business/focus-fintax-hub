-- Flag "tratamento financeiro padrão" por tese do catálogo (review AGF 02/10,
-- pedido do Paulo): o time decide sozinho, em Configurações → Teses, se uma
-- tese entra no saldo a compensar ou fica fora (Reporto / via judicial), sem
-- esperar ajuste de código quando aparecer tese nova (ex.: ICMS estadual).
--
-- É só o padrão sugerido ao criar o processo do cliente — o processo continua
-- com a própria `categoria`, que o usuário pode sobrescrever.

BEGIN;

ALTER TABLE public.motor_teses_config
  ADD COLUMN IF NOT EXISTS tratamento_financeiro_padrao text NOT NULL DEFAULT 'compensacao';

ALTER TABLE public.motor_teses_config
  DROP CONSTRAINT IF EXISTS motor_teses_config_tratamento_financeiro_padrao_check;
ALTER TABLE public.motor_teses_config
  ADD CONSTRAINT motor_teses_config_tratamento_financeiro_padrao_check
  CHECK (tratamento_financeiro_padrao IN ('compensacao', 'reporto', 'recuperacao_judicial'));

COMMENT ON COLUMN public.motor_teses_config.tratamento_financeiro_padrao IS
  'Padrão sugerido ao criar processo desta tese: compensacao (entra no saldo), reporto (possível recebimento, fora do saldo) ou recuperacao_judicial (em julgamento, fora do saldo).';

-- Seed pelo que o sistema já deduzia: Reporto pelo nome, judicial pelo ramo.
UPDATE public.motor_teses_config
   SET tratamento_financeiro_padrao = 'reporto'
 WHERE tratamento_financeiro_padrao = 'compensacao'
   AND (lower(tese) LIKE '%reporto%' OR lower(nome_exibicao) LIKE '%reporto%');

UPDATE public.motor_teses_config
   SET tratamento_financeiro_padrao = 'recuperacao_judicial'
 WHERE tratamento_financeiro_padrao = 'compensacao'
   AND tipo_recuperacao_padrao = 'recuperacao_judicial';

COMMIT;
