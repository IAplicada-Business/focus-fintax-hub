-- Separa aquisição comercial da esteira operacional vigente.
--
-- "Nova abordagem" descreve retomada comercial e duplicava o funil de leads.
-- O valor continua no enum e no histórico para preservar auditoria, mas deixa
-- de ser uma etapa ativa/destino da operação.

BEGIN;

-- Fecha o ciclo legado pela trigger e inicia Triagem com um novo SLA.
UPDATE public.clientes
SET estagio_esteira = 'triagem'::public.estagio_esteira
WHERE estagio_esteira = 'nova_abordagem'::public.estagio_esteira;

UPDATE public.esteira_sla_config
SET
  ativo = false,
  label = 'Nova abordagem (legado comercial)',
  ordem = 99,
  atualizado_em = now()
WHERE estagio = 'nova_abordagem'::public.estagio_esteira;

-- Restaura a sequência da esteira operacional desenhada para clientes ativos.
UPDATE public.esteira_sla_config
SET
  ordem = CASE estagio::text
    WHEN 'triagem' THEN 1
    WHEN 'levantamento' THEN 2
    WHEN 'emitir_contrato' THEN 3
    WHEN 'receber_assinado' THEN 4
    WHEN 'em_compensacao' THEN 5
    WHEN 'encaminhar_financeiro' THEN 6
    WHEN 'concluido' THEN 7
    WHEN 'devolutiva_cliente' THEN 8
    ELSE ordem
  END,
  atualizado_em = now()
WHERE estagio::text IN (
  'triagem',
  'levantamento',
  'emitir_contrato',
  'receber_assinado',
  'em_compensacao',
  'encaminhar_financeiro',
  'concluido',
  'devolutiva_cliente'
);

COMMIT;
