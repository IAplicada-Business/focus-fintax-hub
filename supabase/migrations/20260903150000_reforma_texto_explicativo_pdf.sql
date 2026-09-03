-- Calculadora da Reforma: texto do bloco "Sobre a Reforma" (tela + PDF).
--
-- reforma_config.valor é NUMERIC (o CREATE TABLE de 20260706174019 venceu o
-- IF NOT EXISTS de 20260706180000, que previa jsonb). Texto vai numa coluna
-- própria; `valor` fica 0 nessa linha só pra satisfazer o NOT NULL.
-- Editável pelo Alcir direto no banco, sem deploy — o front cai no texto
-- padrão (src/lib/reforma-calculadora.ts) se a chave não existir.
ALTER TABLE public.reforma_config
  ADD COLUMN IF NOT EXISTS valor_texto text;

COMMENT ON COLUMN public.reforma_config.valor_texto IS
  'Valor textual (parágrafos separados por linha em branco). Usado por chaves de texto como texto_explicativo_pdf; NULL nas chaves numéricas.';

INSERT INTO public.reforma_config (chave, valor, valor_texto, descricao)
VALUES (
  'texto_explicativo_pdf',
  0,
  'A Reforma Tributária (EC 132/2023 e LC 214/2025) substitui PIS, COFINS, ICMS, ISS e IPI por dois tributos sobre o consumo: a CBS, federal, e o IBS, estadual e municipal. A alíquota de referência somada fica em torno de 28%, com reduções para itens da cesta básica e alguns setores.' || E'\n\n' ||
  'Diferente do modelo atual, o crédito passa a ser amplo: quase toda compra de bens e serviços usada na operação gera crédito, inclusive despesas administrativas, benefícios da folha e serviços financeiros. Por isso o resultado depende muito do cadastro tributário e da qualidade das notas de entrada.' || E'\n\n' ||
  'IRPJ e CSLL não fazem parte da Reforma do consumo: continuam existindo e por isso ficam fora deste comparativo. A transição começa em 2026, com alíquotas de teste, e termina em 2033, quando ICMS e ISS deixam de existir.',
  'Texto do bloco "Sobre a Reforma Tributária" na calculadora e no PDF (coluna valor_texto). Parágrafos separados por linha em branco. Rascunho inicial — Alcir substitui.'
)
ON CONFLICT (chave) DO NOTHING;
