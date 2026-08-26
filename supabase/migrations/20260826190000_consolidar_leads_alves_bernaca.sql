-- Consolida os 4 registros duplicados de "Alves e bernaca" (CNPJ 01332553000104)
-- em um só, sem perder nada.
--
-- Por que NÃO é um DELETE simples: diagnosticos_leads, relatorios_leads e
-- lead_historico têm ON DELETE CASCADE. Apagar os 3 duplicados destruiria 3
-- relatórios e 7 diagnósticos junto — o conteúdo da aba Diagnóstico, que é
-- resultado da calculadora. Então primeiro reponta os filhos, depois apaga.
--
-- Sobrevivente: 95ff92e0 (24/07, "Alves e bernaca Ltda") — nome jurídico
-- completo e o registro mais recente.
--
-- As asserções abaixo abortam a migration inteira se qualquer contagem não
-- bater. Numa operação destrutiva, falhar alto é melhor que falhar quieto.

BEGIN;

DO $$
DECLARE
  v_sobrevivente CONSTANT uuid := '95ff92e0-45b5-4b31-ab21-c3b465ef4cf4';
  v_mortos uuid[] := ARRAY[
    '3d9da7eb-7c2e-4566-aae5-792eaa703985',
    '86549569-c520-4edd-853d-836e6716c2b2',
    'caa12567-bf22-4846-b3d3-8e0c0a684fbf'
  ]::uuid[];
  v_rel_antes int;
  v_diag_antes int;
  v_rel_depois int;
  v_diag_depois int;
  v_restantes int;
BEGIN
  -- Nada a fazer se já foi consolidado (migration idempotente).
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = ANY(v_mortos)) THEN
    RAISE NOTICE 'Já consolidado, nada a fazer.';
    RETURN;
  END IF;

  ASSERT EXISTS (SELECT 1 FROM public.leads WHERE id = v_sobrevivente),
    'sobrevivente não existe — abortando';

  -- Nenhum deles pode ter virado cliente; se tiver, o desenho está errado.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE lead_id = ANY(v_mortos) OR lead_id = v_sobrevivente
  ), 'algum destes leads virou cliente — parar e reavaliar';

  SELECT count(*) INTO v_rel_antes FROM public.relatorios_leads
   WHERE lead_id = v_sobrevivente OR lead_id = ANY(v_mortos);
  SELECT count(*) INTO v_diag_antes FROM public.diagnosticos_leads
   WHERE lead_id = v_sobrevivente OR lead_id = ANY(v_mortos);

  UPDATE public.relatorios_leads  SET lead_id = v_sobrevivente WHERE lead_id = ANY(v_mortos);
  UPDATE public.diagnosticos_leads SET lead_id = v_sobrevivente WHERE lead_id = ANY(v_mortos);
  UPDATE public.lead_historico     SET lead_id = v_sobrevivente WHERE lead_id = ANY(v_mortos);
  UPDATE public.meta_leads         SET crm_lead_id = v_sobrevivente WHERE crm_lead_id = ANY(v_mortos);
  UPDATE public.atendimento_mensagens SET lead_id = v_sobrevivente WHERE lead_id = ANY(v_mortos);

  DELETE FROM public.leads WHERE id = ANY(v_mortos);

  SELECT count(*) INTO v_rel_depois  FROM public.relatorios_leads  WHERE lead_id = v_sobrevivente;
  SELECT count(*) INTO v_diag_depois FROM public.diagnosticos_leads WHERE lead_id = v_sobrevivente;
  SELECT count(*) INTO v_restantes FROM public.leads
   WHERE regexp_replace(COALESCE(cnpj,''), '\D', '', 'g') = '01332553000104';

  -- Se o cascade tivesse levado algo, estas três falhariam e reverteriam tudo.
  ASSERT v_rel_depois = v_rel_antes,
    format('relatórios perdidos: antes %s, depois %s', v_rel_antes, v_rel_depois);
  ASSERT v_diag_depois = v_diag_antes,
    format('diagnósticos perdidos: antes %s, depois %s', v_diag_antes, v_diag_depois);
  ASSERT v_restantes = 1,
    format('esperava 1 lead com o CNPJ, sobraram %s', v_restantes);

  RAISE NOTICE 'Consolidado: % relatórios e % diagnósticos preservados em 1 lead.',
    v_rel_depois, v_diag_depois;
END $$;

COMMIT;
