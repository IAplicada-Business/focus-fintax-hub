-- Alinha os nomes e a passagem entre o funil comercial e a esteira.
-- Os valores antigos do enum ficam disponíveis apenas para auditoria histórica.

ALTER TYPE public.estagio_esteira ADD VALUE IF NOT EXISTS 'contrato_emitido';
ALTER TYPE public.estagio_esteira ADD VALUE IF NOT EXISTS 'contrato_assinado';
ALTER TYPE public.estagio_esteira ADD VALUE IF NOT EXISTS 'compensado';

BEGIN;

-- Funil comercial vigente:
-- Novo > Qualificado > Apresentação > Triagem > Contrato Emitido >
-- Contrato Assinado > Ganho > Perdido.
UPDATE public.leads
SET status_funil = CASE status_funil
  WHEN 'em_apresentacao' THEN 'apresentacao'
  WHEN 'em_negociacao' THEN 'triagem'
  WHEN 'levantamento_teses' THEN 'triagem'
  WHEN 'cliente_ativo' THEN 'ganho'
  WHEN 'nao_vai_fazer' THEN 'perdido'
  ELSE status_funil
END
WHERE status_funil IN (
  'em_apresentacao',
  'em_negociacao',
  'levantamento_teses',
  'cliente_ativo',
  'nao_vai_fazer'
);

UPDATE public.lead_historico
SET para_etapa = CASE para_etapa
  WHEN 'em_apresentacao' THEN 'apresentacao'
  WHEN 'em_negociacao' THEN 'triagem'
  WHEN 'levantamento_teses' THEN 'triagem'
  WHEN 'cliente_ativo' THEN 'ganho'
  WHEN 'nao_vai_fazer' THEN 'perdido'
  ELSE para_etapa
END
WHERE para_etapa IN (
  'em_apresentacao',
  'em_negociacao',
  'levantamento_teses',
  'cliente_ativo',
  'nao_vai_fazer'
);

UPDATE public.lead_historico
SET de_etapa = CASE de_etapa
  WHEN 'em_apresentacao' THEN 'apresentacao'
  WHEN 'em_negociacao' THEN 'triagem'
  WHEN 'levantamento_teses' THEN 'triagem'
  WHEN 'cliente_ativo' THEN 'ganho'
  WHEN 'nao_vai_fazer' THEN 'perdido'
  ELSE de_etapa
END
WHERE de_etapa IN (
  'em_apresentacao',
  'em_negociacao',
  'levantamento_teses',
  'cliente_ativo',
  'nao_vai_fazer'
);

INSERT INTO public.pipeline_sla_config
  (etapa, label, sla_dias, ordem, ativo, atualizado_em)
VALUES
  ('novo', 'Novo', 3, 1, true, now()),
  ('qualificado', 'Qualificado', 5, 2, true, now()),
  ('apresentacao', 'Apresentação', 7, 3, true, now()),
  ('triagem', 'Triagem', 3, 4, true, now()),
  ('contrato_emitido', 'Contrato Emitido', 3, 5, true, now()),
  ('contrato_assinado', 'Contrato Assinado', 2, 6, true, now())
ON CONFLICT (etapa) DO UPDATE SET
  label = EXCLUDED.label,
  sla_dias = EXCLUDED.sla_dias,
  ordem = EXCLUDED.ordem,
  ativo = EXCLUDED.ativo,
  atualizado_em = now();

UPDATE public.pipeline_sla_config
SET ativo = false, atualizado_em = now()
WHERE etapa NOT IN (
  'novo',
  'qualificado',
  'apresentacao',
  'triagem',
  'contrato_emitido',
  'contrato_assinado'
);

-- Esteira vigente:
-- Triagem > Contrato Emitido > Contrato Assinado > Em Compensação >
-- Compensado > Concluído.
UPDATE public.clientes
SET estagio_esteira = CASE estagio_esteira::text
  WHEN 'nova_abordagem' THEN 'triagem'::public.estagio_esteira
  WHEN 'levantamento' THEN 'triagem'::public.estagio_esteira
  WHEN 'emitir_contrato' THEN 'contrato_emitido'::public.estagio_esteira
  WHEN 'receber_assinado' THEN 'contrato_assinado'::public.estagio_esteira
  WHEN 'encaminhar_financeiro' THEN 'compensado'::public.estagio_esteira
  WHEN 'devolutiva_cliente' THEN 'concluido'::public.estagio_esteira
  ELSE estagio_esteira
END
WHERE estagio_esteira::text IN (
  'nova_abordagem',
  'levantamento',
  'emitir_contrato',
  'receber_assinado',
  'encaminhar_financeiro',
  'devolutiva_cliente'
);

INSERT INTO public.esteira_sla_config
  (estagio, label, sla_dias, ordem, ativo, atualizado_em)
VALUES
  ('triagem'::public.estagio_esteira, 'Triagem', 1, 1, true, now()),
  ('contrato_emitido'::public.estagio_esteira, 'Contrato Emitido', 3, 2, true, now()),
  ('contrato_assinado'::public.estagio_esteira, 'Contrato Assinado', 3, 3, true, now()),
  ('em_compensacao'::public.estagio_esteira, 'Em Compensação', 30, 4, true, now()),
  ('compensado'::public.estagio_esteira, 'Compensado', 5, 5, true, now()),
  ('concluido'::public.estagio_esteira, 'Concluído', NULL, 6, true, now())
ON CONFLICT (estagio) DO UPDATE SET
  label = EXCLUDED.label,
  sla_dias = EXCLUDED.sla_dias,
  ordem = EXCLUDED.ordem,
  ativo = EXCLUDED.ativo,
  atualizado_em = now();

UPDATE public.esteira_sla_config
SET ativo = false, ordem = 99, atualizado_em = now()
WHERE estagio::text NOT IN (
  'triagem',
  'contrato_emitido',
  'contrato_assinado',
  'em_compensacao',
  'compensado',
  'concluido'
);

-- Sincroniza clientes já ligados a leads sem regredir quem avançou na operação.
UPDATE public.clientes c
SET estagio_esteira = CASE l.status_funil
  WHEN 'triagem' THEN 'triagem'::public.estagio_esteira
  WHEN 'contrato_emitido' THEN 'contrato_emitido'::public.estagio_esteira
  WHEN 'contrato_assinado' THEN 'contrato_assinado'::public.estagio_esteira
  WHEN 'ganho' THEN 'em_compensacao'::public.estagio_esteira
  ELSE c.estagio_esteira
END
FROM public.leads l
WHERE c.lead_id = l.id
  AND (
    (l.status_funil = 'triagem' AND c.estagio_esteira = 'triagem')
    OR (
      l.status_funil = 'contrato_emitido'
      AND c.estagio_esteira IN ('triagem', 'contrato_emitido')
    )
    OR (
      l.status_funil = 'contrato_assinado'
      AND c.estagio_esteira IN ('triagem', 'contrato_emitido', 'contrato_assinado')
    )
    OR (
      l.status_funil = 'ganho'
      AND c.estagio_esteira IN (
        'triagem',
        'contrato_emitido',
        'contrato_assinado',
        'em_compensacao'
      )
    )
  );

COMMIT;
