-- Lote 3B — Resumo semanal automático por WhatsApp (segunda 08:00 e sexta 17:00 BRT).
--
-- Substitui o fluxo n8n inativo (automacoes/n8n/relatorio-semanal-whatsapp.json):
-- agora é pg_cron -> net.http_post -> Edge Function `resumo-semanal` -> Z-API.
-- Toda a SEMÂNTICA dos números mora em resumo_semanal_dados(); a Edge Function
-- só formata e envia (supabase/functions/resumo-semanal/mensagem.ts, espelhado
-- em src/lib/resumo-semanal.ts para o preview da UI e os testes).
--
-- CONFIGURAÇÃO MANUAL (Mariana), depois de aplicar esta migration:
--   1) Criar o segredo no Vault (Dashboard → Project Settings → Vault):
--        name = resumo_semanal_token, secret = <string aleatória longa>
--   2) Criar o secret da Edge Function com o MESMO valor:
--        supabase secrets set RESUMO_SEMANAL_TOKEN=<mesma string>
--      (a função compara o header x-cron-token com esse secret).
--   3) Deploy da função: supabase functions deploy resumo-semanal
--   4) Cadastrar os destinatários (ex.: Paulo) em Dashboard → Pulso semanal →
--      card "Resumo automático por WhatsApp". Sem destinatário ativo o cron
--      roda e não envia nada.
--   Se o segredo do Vault não existir, o job apenas registra um WARNING e sai.
--
-- Pré-requisitos: extensões pg_cron, pg_net e supabase_vault habilitadas.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Destinatários — quem recebe o resumo. Gerenciado pela UI (admin/pmo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resumo_semanal_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text,
  whatsapp text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.resumo_semanal_destinatarios IS
  'Quem recebe o resumo semanal automático por WhatsApp (Lote 3B). Sem seed: cadastrado pela UI.';

ALTER TABLE public.resumo_semanal_destinatarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resumo_semanal_destinatarios FROM anon;

DROP POLICY IF EXISTS "Admin pmo gerencia destinatarios resumo" ON public.resumo_semanal_destinatarios;
CREATE POLICY "Admin pmo gerencia destinatarios resumo" ON public.resumo_semanal_destinatarios
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pmo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pmo'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumo_semanal_destinatarios TO authenticated;
GRANT ALL ON public.resumo_semanal_destinatarios TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Envios — auditoria de cada disparo E snapshot dos dados usados.
--
-- O `dados` da segunda é o que a sexta lê pra montar o "Comparativo com a
-- segunda" e o "Prioridades da semana — o que rolou". Sem gravar o snapshot
-- a sexta teria que recalcular a foto de segunda, o que não existe no banco.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resumo_semanal_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  destinatario text NOT NULL,
  mensagem text NOT NULL,
  dados jsonb,
  status text NOT NULL,
  erro text,
  zapi_response jsonb,
  executado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resumo_semanal_envios_tipo_chk CHECK (tipo IN ('segunda', 'sexta', 'teste')),
  CONSTRAINT resumo_semanal_envios_status_chk CHECK (status IN ('sucesso', 'falha'))
);

COMMENT ON TABLE public.resumo_semanal_envios IS
  'Um registro por destinatário por disparo do resumo semanal (Lote 3B). `dados` guarda o snapshot que gerou a mensagem.';

CREATE INDEX IF NOT EXISTS ix_resumo_semanal_envios_executado
  ON public.resumo_semanal_envios (executado_em DESC);
CREATE INDEX IF NOT EXISTS ix_resumo_semanal_envios_semana
  ON public.resumo_semanal_envios (tipo, periodo_inicio, executado_em DESC);

ALTER TABLE public.resumo_semanal_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resumo_semanal_envios FROM anon;

DROP POLICY IF EXISTS "Admin pmo select envios resumo" ON public.resumo_semanal_envios;
CREATE POLICY "Admin pmo select envios resumo" ON public.resumo_semanal_envios
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pmo'::app_role));

GRANT SELECT ON public.resumo_semanal_envios TO authenticated;
GRANT ALL ON public.resumo_semanal_envios TO service_role;

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- 3) resumo_semanal_dados(p_tipo, p_referencia) — payload único do resumo.
--
-- Um jsonb só, pelos mesmos motivos de relatorio_semanal_esteira(): período
-- calculado uma vez em BRT e todas as contagens do mesmo snapshot.
--
-- Regras financeiras espelham o front (src/lib/saldos-cliente.ts e
-- src/lib/clientes-constants.ts):
--   • crédito apurado = creditos_apurados.valor_apurado_inicial com
--     incluir_no_calculo = true e tese != REPORTO; cliente SEM nenhuma linha
--     em creditos_apurados cai no fallback do processo (maior valor_credito
--     por tese, só processos no cálculo). Simplificação assumida: o front faz
--     o fallback por tese faltante; aqui é por cliente sem crédito nenhum.
--   • compensado canônico = compensacoes_mensais SEM processo de categoria
--     reporto/recuperacao_judicial, SEM tese_origem REPORTO e SEM órfã
--     (tese_origem_id nulo) que duplique uma linha linkada do mesmo
--     cliente/mês/tributo/valor (±0,015).
--   • honorário = COALESCE(honorario_valor, valor_nf_servico, 0).
--
-- "Prioridades da semana (o que a IA sugeriu atacar)" é heurística
-- determinística, sem LLM: score = saldo_projetado × dias_parado / SLA da
-- etapa (SLA nulo → 30 dias), excluindo concluído e clientes inativos; top 3.
-- Determinística de propósito: o número tem que ser reproduzível em
-- `select resumo_semanal_dados('segunda')` sem depender de API externa.
--
-- p_tipo: 'segunda' | 'sexta' | 'teste' (teste = mesmos dados da segunda).
-- p_referencia: qualquer dia da semana desejada (default: hoje em BRT).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumo_semanal_dados(
  p_tipo text DEFAULT 'segunda',
  p_referencia date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref date;
  v_inicio date;
  v_fim date;
  v_mes_inicio date;
  v_agora timestamptz := now();
  v_result jsonb;
BEGIN
  -- Só o cron (service_role) e admin/pmo podem ler a foto consolidada.
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pmo'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar o resumo semanal' USING ERRCODE = '42501';
  END IF;

  v_ref := COALESCE(p_referencia, (v_agora AT TIME ZONE 'America/Sao_Paulo')::date);
  v_inicio := date_trunc('week', v_ref)::date;          -- segunda-feira
  v_fim := v_inicio + 4;                                 -- sexta-feira
  v_mes_inicio := date_trunc('month', v_ref)::date;

  WITH
  -- Teses fora do cálculo (REPORTO) e processos fora do cálculo
  tese_reporto AS (
    SELECT id FROM public.teses_tributarias WHERE upper(codigo::text) = 'REPORTO'
  ),
  processo_fora AS (
    SELECT id FROM public.processos_teses
    WHERE lower(btrim(categoria)) IN ('reporto', 'recuperacao_judicial')
       OR upper(btrim(tese)) = 'REPORTO'
  ),
  ativos AS (
    SELECT c.*
    FROM public.clientes c
    WHERE COALESCE(c.status, 'ativo') = 'ativo'
  ),
  -- Compensações canônicas (ver cabeçalho)
  comp_base AS (
    SELECT cm.*
    FROM public.compensacoes_mensais cm
    JOIN ativos a ON a.id = cm.cliente_id
    WHERE (cm.processo_tese_id IS NULL OR cm.processo_tese_id NOT IN (SELECT id FROM processo_fora))
      AND (cm.tese_origem_id IS NULL OR cm.tese_origem_id NOT IN (SELECT id FROM tese_reporto))
  ),
  comp_canon AS (
    SELECT o.*
    FROM comp_base o
    WHERE o.tese_origem_id IS NOT NULL
       OR NOT EXISTS (
         SELECT 1 FROM comp_base l
         WHERE l.tese_origem_id IS NOT NULL
           AND l.cliente_id = o.cliente_id
           AND date_trunc('month', l.mes_referencia) = date_trunc('month', o.mes_referencia)
           AND upper(COALESCE(l.tributo_enum::text, l.tributo, '')) = upper(COALESCE(o.tributo_enum::text, o.tributo, ''))
           AND abs(COALESCE(l.valor_compensado, 0) - COALESCE(o.valor_compensado, 0)) < 0.015
       )
  ),
  credito_cliente AS (
    SELECT ca.cliente_id, sum(ca.valor_apurado_inicial) AS apurado
    FROM public.creditos_apurados ca
    JOIN ativos a ON a.id = ca.cliente_id
    WHERE ca.incluir_no_calculo = true
      AND ca.tese_id NOT IN (SELECT id FROM tese_reporto)
    GROUP BY ca.cliente_id
  ),
  -- Fallback: cliente sem NENHUMA linha em creditos_apurados usa o processo
  credito_fallback AS (
    SELECT p.cliente_id, sum(p.maior) AS apurado
    FROM (
      SELECT pt.cliente_id, upper(btrim(pt.tese)) AS tese, max(COALESCE(pt.valor_credito, 0)) AS maior
      FROM public.processos_teses pt
      JOIN ativos a ON a.id = pt.cliente_id
      WHERE pt.id NOT IN (SELECT id FROM processo_fora)
        AND NOT EXISTS (SELECT 1 FROM public.creditos_apurados ca WHERE ca.cliente_id = pt.cliente_id)
      GROUP BY pt.cliente_id, upper(btrim(pt.tese))
    ) p
    GROUP BY p.cliente_id
  ),
  compensado_cliente AS (
    SELECT cliente_id, sum(COALESCE(valor_compensado, 0)) AS compensado
    FROM comp_canon
    GROUP BY cliente_id
  ),
  saldo_cliente AS (
    SELECT
      a.id AS cliente_id,
      COALESCE(cc.apurado, cf.apurado, 0) AS apurado,
      COALESCE(co.compensado, 0) AS compensado,
      COALESCE(cc.apurado, cf.apurado, 0) - COALESCE(co.compensado, 0) AS saldo
    FROM ativos a
    LEFT JOIN credito_cliente cc ON cc.cliente_id = a.id
    LEFT JOIN credito_fallback cf ON cf.cliente_id = a.id
    LEFT JOIN compensado_cliente co ON co.cliente_id = a.id
  ),
  -- Esteira: etapa, SLA, dias parado. Mesma regra de atraso do v_esteira_sla.
  esteira_cli AS (
    SELECT
      a.id AS cliente_id,
      a.empresa,
      a.estagio_esteira::text AS estagio,
      COALESCE(s.label, a.estagio_esteira::text) AS etapa_label,
      COALESCE(s.ordem, 99) AS ordem,
      s.sla_dias,
      EXTRACT(DAY FROM v_agora - a.data_entrada_estagio)::int AS dias_parado,
      a.responsavel_id,
      a.tese_ativa_id,
      sc.saldo
    FROM ativos a
    LEFT JOIN public.esteira_sla_config s ON s.estagio = a.estagio_esteira
    LEFT JOIN saldo_cliente sc ON sc.cliente_id = a.id
  ),
  esteira_por_etapa AS (
    SELECT
      s.estagio::text AS estagio, s.label, s.ordem,
      count(e.cliente_id)::int AS total,
      count(e.cliente_id) FILTER (WHERE s.sla_dias IS NOT NULL AND e.dias_parado > s.sla_dias)::int AS atrasados
    FROM public.esteira_sla_config s
    LEFT JOIN esteira_cli e ON e.estagio = s.estagio::text
    GROUP BY s.estagio, s.label, s.ordem
  ),
  -- Heurística de prioridade (ver cabeçalho)
  prioridades AS (
    SELECT
      e.cliente_id, e.empresa, e.etapa_label, e.estagio, e.dias_parado,
      GREATEST(e.saldo, 0) AS saldo_projetado,
      GREATEST(e.saldo, 0) * e.dias_parado / GREATEST(COALESCE(e.sla_dias, 30), 1)::numeric AS score
    FROM esteira_cli e
    WHERE e.estagio <> 'concluido'
    ORDER BY score DESC, e.saldo DESC, e.dias_parado DESC
    LIMIT 3
  ),
  -- Fluxo da semana (segunda a sexta do período)
  comp_semana AS (
    SELECT
      COALESCE(sum(valor_compensado), 0) AS compensado,
      COALESCE(sum(COALESCE(honorario_valor, valor_nf_servico, 0)), 0) AS honorarios
    FROM comp_canon
    WHERE (criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio AND v_fim
  ),
  comp_mes AS (
    SELECT
      COALESCE(sum(valor_compensado), 0) AS compensado,
      COALESCE(sum(COALESCE(honorario_valor, valor_nf_servico, 0)), 0) AS honorarios
    FROM comp_canon
    WHERE date_trunc('month', mes_referencia)::date = v_mes_inicio
  ),
  -- Último movimento de cada cliente na semana, com a etapa anterior
  movimentos AS (
    SELECT DISTINCT ON (h.cliente_id)
      h.cliente_id,
      a.empresa,
      h.estagio::text AS para,
      (SELECT h2.estagio::text FROM public.esteira_historico h2
        WHERE h2.cliente_id = h.cliente_id AND h2.entrou_em < h.entrou_em
        ORDER BY h2.entrou_em DESC LIMIT 1) AS de,
      h.entrou_em
    FROM public.esteira_historico h
    JOIN ativos a ON a.id = h.cliente_id
    WHERE (h.entrou_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio AND v_fim
    ORDER BY h.cliente_id, h.entrou_em DESC
  ),
  contratos_semana AS (
    SELECT count(DISTINCT h.cliente_id)::int AS total
    FROM public.esteira_historico h
    WHERE h.estagio = 'contrato_assinado'
      AND (h.entrou_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio AND v_fim
  ),
  -- Clientes ativos (fora de concluído) sem nenhum rastro na semana:
  -- nem etapa nova, nem compensação lançada, nem ação no histórico.
  sem_movimentacao AS (
    SELECT count(*)::int AS total
    FROM esteira_cli e
    WHERE e.estagio <> 'concluido'
      AND NOT EXISTS (SELECT 1 FROM movimentos m WHERE m.cliente_id = e.cliente_id)
      AND NOT EXISTS (
        SELECT 1 FROM comp_canon cm
        WHERE cm.cliente_id = e.cliente_id
          AND (cm.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio AND v_fim)
      AND NOT EXISTS (
        SELECT 1 FROM public.cliente_historico ch
        WHERE ch.cliente_id = e.cliente_id
          AND (ch.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio AND v_fim)
  ),
  -- Comercial
  leads_semana_passada AS (
    SELECT count(*)::int AS total
    FROM public.leads l
    WHERE (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio - 7 AND v_inicio - 1
  ),
  leads_semana AS (
    SELECT count(*)::int AS total
    FROM public.leads l
    WHERE (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio AND v_fim
  ),
  -- "Reuniões agendadas pra essa semana": não existe agenda no sistema, então
  -- o proxy é lead que entrou em Apresentação entre a semana anterior e o fim
  -- desta (mesma janela na segunda e na sexta, pra comparação fazer sentido).
  reunioes AS (
    SELECT count(DISTINCT h.lead_id)::int AS total
    FROM public.lead_historico h
    WHERE h.para_etapa IN ('apresentacao', 'em_apresentacao')
      AND (h.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio - 7 AND v_fim
  ),
  -- Funil ativo: potencial máximo do diagnóstico (maior relatório do lead),
  -- só de leads que ainda estão abertos. Sem ponderar por probabilidade —
  -- é o "potencial" de pipelinePonderado(), não o "total" ponderado.
  funil AS (
    SELECT COALESCE(sum(p.potencial), 0) AS valor
    FROM (
      SELECT l.id, max(COALESCE(r.estimativa_total_maxima, 0)) AS potencial
      FROM public.leads l
      LEFT JOIN public.relatorios_leads r ON r.lead_id = l.id
      WHERE COALESCE(l.status_funil, 'novo') NOT IN ('perdido', 'nao_vai_fazer', 'cliente_ativo', 'ganho')
      GROUP BY l.id
    ) p
  ),
  -- Alertas heurísticos (a mensagem formata o texto)
  alerta_devolucao AS (
    SELECT e.empresa, e.etapa_label AS etapa, e.saldo
    FROM esteira_cli e
    WHERE e.estagio IN ('devolucao_comercial', 'contrato_emitido') AND e.saldo > 0
    ORDER BY e.saldo DESC LIMIT 1
  ),
  alerta_sem_tese AS (
    SELECT count(*)::int AS total, COALESCE(sum(GREATEST(e.saldo, 0)), 0) AS saldo
    FROM esteira_cli e
    WHERE e.tese_ativa_id IS NULL AND e.estagio <> 'concluido'
  ),
  alerta_fora_sla AS (
    SELECT e.empresa, e.etapa_label AS etapa, e.dias_parado - e.sla_dias AS dias_acima
    FROM esteira_cli e
    WHERE e.sla_dias IS NOT NULL AND e.dias_parado > e.sla_dias
    ORDER BY (e.dias_parado - e.sla_dias) DESC, e.saldo DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'tipo', p_tipo,
    'periodo_inicio', v_inicio,
    'periodo_fim', v_fim,
    'gerado_em', v_agora,
    'foto', jsonb_build_object(
      'carteira_ativa', (SELECT count(*)::int FROM ativos),
      'credito_apurado_total', (SELECT COALESCE(sum(apurado), 0) FROM saldo_cliente),
      'saldo_a_compensar', (SELECT COALESCE(sum(GREATEST(saldo, 0)), 0) FROM saldo_cliente),
      'compensado_mes', (SELECT compensado FROM comp_mes),
      'honorarios_mes', (SELECT honorarios FROM comp_mes),
      'clientes_em_compensacao', (SELECT count(*)::int FROM esteira_cli WHERE estagio = 'em_compensacao')
    ),
    'esteira', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('estagio', estagio, 'etapa', label, 'total', total, 'atrasados', atrasados) ORDER BY ordem)
      FROM esteira_por_etapa
    ), '[]'::jsonb),
    'prioridades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cliente_id', cliente_id, 'empresa', empresa, 'etapa', etapa_label, 'estagio', estagio,
        'dias_parado', dias_parado, 'saldo_projetado', saldo_projetado, 'score', round(score, 2)
      ) ORDER BY score DESC, saldo_projetado DESC)
      FROM prioridades
    ), '[]'::jsonb),
    'atencao', jsonb_build_object(
      'sem_tese', (SELECT count(*)::int FROM esteira_cli WHERE tese_ativa_id IS NULL AND estagio <> 'concluido'),
      'sem_responsavel', (SELECT count(*)::int FROM esteira_cli WHERE responsavel_id IS NULL AND estagio <> 'concluido'),
      'fora_sla', (SELECT count(*)::int FROM esteira_cli WHERE sla_dias IS NOT NULL AND dias_parado > sla_dias)
    ),
    'comercial', jsonb_build_object(
      'leads_novos_semana_passada', (SELECT total FROM leads_semana_passada),
      'reunioes_semana', (SELECT total FROM reunioes),
      'funil_ativo', (SELECT valor FROM funil)
    ),
    'semana', jsonb_build_object(
      'compensado', (SELECT compensado FROM comp_semana),
      'honorarios', (SELECT honorarios FROM comp_semana),
      'leads_novos', (SELECT total FROM leads_semana),
      'contratos_assinados', (SELECT total FROM contratos_semana),
      'clientes_avancaram', (SELECT count(*)::int FROM movimentos)
    ),
    'movimentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cliente_id', cliente_id, 'empresa', empresa, 'de', de, 'para', para, 'em', entrou_em))
      FROM movimentos
    ), '[]'::jsonb),
    'pendentes', jsonb_build_object(
      'fora_sla', (SELECT count(*)::int FROM esteira_cli WHERE sla_dias IS NOT NULL AND dias_parado > sla_dias),
      'sem_movimentacao', (SELECT total FROM sem_movimentacao),
      'contratos_aguardando', (SELECT count(*)::int FROM esteira_cli WHERE estagio = 'contrato_emitido')
    ),
    'alertas', jsonb_build_object(
      'maior_saldo_parado', (SELECT jsonb_build_object('empresa', empresa, 'etapa', etapa, 'saldo', saldo) FROM alerta_devolucao),
      'sem_tese', (SELECT jsonb_build_object('total', total, 'saldo', saldo) FROM alerta_sem_tese),
      'pior_sla', (SELECT jsonb_build_object('empresa', empresa, 'etapa', etapa, 'dias_acima', dias_acima) FROM alerta_fora_sla)
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.resumo_semanal_dados(text, date) IS
  'Payload jsonb do resumo semanal WhatsApp (Lote 3B). Semana seg-sex em America/Sao_Paulo. Só service_role, admin e pmo.';

REVOKE EXECUTE ON FUNCTION public.resumo_semanal_dados(text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resumo_semanal_dados(text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_dados(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_dados(text, date) TO service_role;

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- 4) Disparo: lê o token do Vault e chama a Edge Function. Chamado pelo cron.
--
-- Função separada (em vez de SQL inline no cron.schedule) pra conseguir
-- tratar o segredo ausente com WARNING em vez de erro silencioso no job.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumo_semanal_disparar(p_tipo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets WHERE name = 'resumo_semanal_token';

  IF v_token IS NULL OR btrim(v_token) = '' THEN
    RAISE WARNING 'resumo_semanal_disparar(%): segredo resumo_semanal_token ausente no Vault; nada enviado', p_tipo;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://qzkqrhamqtchboxtwpnz.supabase.co/functions/v1/resumo-semanal',
    body := jsonb_build_object('tipo', p_tipo),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    timeout_milliseconds := 30000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'resumo_semanal_disparar(%) falhou: %', p_tipo, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resumo_semanal_disparar(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resumo_semanal_disparar(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resumo_semanal_disparar(text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5) pg_cron: segunda 08:00 BRT (11:00 UTC) e sexta 17:00 BRT (20:00 UTC).
-- Re-run safe: remove jobs com o mesmo nome antes de agendar. Se pg_cron não
-- estiver habilitado, só avisa — a migration não pode falhar por isso.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'pg_cron não habilitado: jobs resumo-semanal-* não agendados';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname IN ('resumo-semanal-segunda', 'resumo-semanal-sexta');

  PERFORM cron.schedule(
    'resumo-semanal-segunda',
    '0 11 * * 1',
    $job$ SELECT public.resumo_semanal_disparar('segunda'); $job$
  );
  PERFORM cron.schedule(
    'resumo-semanal-sexta',
    '0 20 * * 5',
    $job$ SELECT public.resumo_semanal_disparar('sexta'); $job$
  );
END;
$$;

COMMIT;
