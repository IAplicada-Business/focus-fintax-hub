-- O prompt semeado pedia para o robô se apresentar como Focus FinTax.
-- A identidade na primeira linha já tinha virado AGF, mas a instrução de
-- cumprimento continuava mandando dizer Focus FinTax — e era essa frase que
-- o modelo obedecia.

UPDATE public.bot_config
SET prompt = replace(prompt, 'Focus FinTax', 'AGF'),
    atualizado_em = now()
WHERE prompt LIKE '%Focus FinTax%';
