-- Calculadora da Reforma: texto do bloco "Sobre a Reforma" (tela + PDF).
-- Editável pelo Alcir direto em reforma_config, sem deploy — o front cai no
-- texto padrão (src/lib/reforma-calculadora.ts) se a chave não existir.
INSERT INTO public.reforma_config (chave, valor, descricao)
VALUES (
  'texto_explicativo_pdf',
  to_jsonb(
    'A Reforma Tributária (EC 132/2023 e LC 214/2025) substitui PIS, COFINS, ICMS, ISS e IPI por dois tributos sobre o consumo: a CBS, federal, e o IBS, estadual e municipal. A alíquota de referência somada fica em torno de 28%, com reduções para itens da cesta básica e alguns setores.' || E'\n\n' ||
    'Diferente do modelo atual, o crédito passa a ser amplo: quase toda compra de bens e serviços usada na operação gera crédito, inclusive despesas administrativas, benefícios da folha e serviços financeiros. Por isso o resultado depende muito do cadastro tributário e da qualidade das notas de entrada.' || E'\n\n' ||
    'IRPJ e CSLL não fazem parte da Reforma do consumo: continuam existindo e por isso ficam fora deste comparativo. A transição começa em 2026, com alíquotas de teste, e termina em 2033, quando ICMS e ISS deixam de existir.'
  ),
  'Texto do bloco "Sobre a Reforma Tributária" na calculadora e no PDF. Parágrafos separados por linha em branco. Rascunho inicial — Alcir substitui.'
)
ON CONFLICT (chave) DO NOTHING;
