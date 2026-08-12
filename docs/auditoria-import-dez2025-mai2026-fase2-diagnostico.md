# Auditoria de compensações — Fase 2: aprofundamento (ainda sem escrita no banco)

Complemento a [`auditoria-import-dez2025-mai2026.md`](./auditoria-import-dez2025-mai2026.md).
**Nenhum INSERT/UPDATE/DELETE foi executado.** Toda a investigação abaixo foi feita lendo
metadados que já existem nas próprias linhas de `compensacoes_mensais` (`processo_tese_id`,
`tese_origem_id`, `observacao`, `criado_em`) — nenhuma planilha nova foi usada.

## Por que nada foi corrigido ainda

Dos 9 itens da lista de ações da Fase 1, nenhum sobrou como "seguro e reversível para aplicar
sozinho": preencher `segmento` exige valor que não temos, mesclar o CNPJ duplicado do REZENDE
exige a Focus Fintax dizer qual é o correto, e os 3 itens abaixo — mesmo agora bem diagnosticados —
significam apagar ou alterar lançamento financeiro real de cliente, o que é uma decisão do
time, não uma limpeza mecânica. Por isso o resultado desta rodada é diagnóstico mais preciso,
não mudança de dado.

## O que ficou esclarecido

### 1. FJC COMERCIO DE PRODUTO (Flavio) — dez/2025, R$ 251.371,88 → reclassificar para 🟢

Não é gap nem inconsistência. A linha tem `processo_tese_id` preenchido (`66d5ccf2-...`),
ou seja, é uma compensação vinculada a um processo/tese específico do cliente — um tipo de
lançamento que não passa pela planilha de fluxo mensal por definição. Não precisa de nenhuma
ação; só precisa deixar de aparecer como 🟡 no relatório da Fase 1 (ela permanece 🟡 lá porque
o relatório original não tinha essa informação).

> Nota: existe ainda uma segunda linha desse mesmo cliente, competência 2024-12, valor
> idêntico (251.371,88), criada um dia depois (2026-03-31) com `observacao = "Importado via
> planilha XLSX"` e outro `processo_tese_id`. Está fora da janela dez/2025–mai/2026 auditada,
> mas é candidata a duplicidade real — vale uma checagem futura, sem pressa.

### 2. SUPERMERCADOS FEIRA NOVA LTDA e COMERCIAL DE ALIMENTOS PRIMUS (FILIAL) — causa raiz identificada

As duas têm o mesmo padrão de origem: linhas criadas em **30/03/2026**, tributo genérico
`"outros"`, `tese_origem_id = NULL`, sem `observacao`, com `processo_tese_id` preenchido —
claramente de um lote/migração anterior à importação oficial (que só rodou em 16/07/2026 e
está corretamente identificada por `observacao = "Importado via SQL fluxo (...)"`).

- **FEIRA NOVA**: a linha de 30/03 marcada como jan/26 tem valor R$ 897.672,59 — que é
  exatamente o valor real de **dez/25** (confirmado pela linha correta de 16/07). A linha de
  30/03 marcada como fev/26 tem valor R$ 340.788,89 — exatamente o valor real de **jan/26**.
  Ou seja: o lote de março replicou o valor do mês anterior um mês adiante, e a importação
  oficial de julho nunca removeu essas linhas antigas.
- **PRIMUS (FILIAL, CNPJ `05904970000216`)**: mesmo padrão, mas mais grave — os dois valores
  (R$ 12.616,09 em jan/26 e R$ 12.760,99 em fev/26) não são só do mês errado, são de um
  **CNPJ errado**: batem exatamente com os valores de dez/25 e jan/26 da matriz
  ("COMERCIAL DE ALIMENTOS PRIMUS", CNPJ `05904970000135`). A filial não tem nenhuma outra
  compensação lançada — essas 2 linhas de março provavelmente nunca deveriam ter sido
  atribuídas a ela.

**Decisão pendente do time** (não é algo que eu deva decidir sozinho): confirmar que essas 4
linhas de 30/03/2026 são resíduo de um import/teste anterior e podem ser removidas, e não
compensações reais adicionais da filial/mês. Se confirmado, a correção é um `DELETE` simples
por `id` (as 4 linhas já foram identificadas com precisão — ids disponíveis na consulta usada,
reproduzível abaixo), não uma reimportação.

```sql
-- Localiza exatamente as 4 linhas candidatas a remoção (SOMENTE LEITURA)
SELECT cm.id, c.empresa, regexp_replace(c.cnpj,'\D','','g') AS cnpj,
       to_char(cm.mes_referencia,'YYYY-MM') AS mes, cm.tributo_enum::text, cm.valor_compensado,
       cm.processo_tese_id, cm.criado_em
FROM public.compensacoes_mensais cm
JOIN public.clientes c ON c.id = cm.cliente_id
WHERE cm.criado_em::date = '2026-03-30'
  AND cm.tributo_enum = 'outros'
  AND cm.tese_origem_id IS NULL
  AND c.empresa IN ('SUPERMERCADOS FEIRA NOVA LTDA', 'COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL');
```

### 3. REUNIDOS — abr/2026, banco quase 3× a planilha atual

A linha do banco tem `observacao = "Importado via SQL fluxo (fluxo caixa maio 2026, variante
novo)"`, ou seja, foi importada da mesma aba que eu tenho na planilha atual — mas os valores
não coincidem (banco tem ~2,1x a 2,9x o valor da planilha, variando por tributo, sem um fator
constante). A explicação mais provável: **a planilha foi revisada pela Focus Fintax depois do
último import (16/07/2026)** e o banco nunca foi resincronizado com a versão corrigida. Também
achei, na mesma investigação, que o banco já tem dados de **maio/2026 vindos de uma aba
"fluxo caixa jun 2026"** que não existe em nenhum dos 2 arquivos que recebi — confirma que o
último import real (16/07) usou uma versão da planilha mais completa/diferente da que está
comigo agora.

**Decisão pendente do time**: pedir à Focus Fintax a versão da planilha usada em 16/07/2026
(ou a mais atual, com a aba de junho) para decidir se REUNIDOS precisa de correção pontual
(UPDATE dos 4 valores) ou se o import de julho estava certo e a versão que recebi agora está
desatualizada.

## Resumo do que muda no relatório da Fase 1

| Item | Status anterior | Novo status | Motivo |
|---|---|---|---|
| FJC COMERCIO DE PRODUTO — dez/25 | 🟡 INCOERENTE | 🟢 CORRETO (lançamento de tese, fora do fluxo mensal) | `processo_tese_id` confirma origem legítima |
| SUPERMERCADOS FEIRA NOVA — jan/26, fev/26 | 🟡 INCOERENTE | 🟡 INCOERENTE (mantido) | Causa raiz identificada; correção pendente de confirmação do time |
| PRIMUS (FILIAL) — jan/26, fev/26 | 🟡 INCOERENTE | 🟡 INCOERENTE (mantido) | Causa raiz identificada; correção pendente de confirmação do time |
| REUNIDOS — abr/26 | 🟡 INCOERENTE | 🟡 INCOERENTE (mantido) | Hipótese forte (planilha revisada pós-import); falta a versão certa da planilha para confirmar |

**Nenhum dado foi alterado.** De 6 itens 🟡 do relatório original, 1 já pode ser fechado como
🟢 (era falta de contexto, não erro). Os outros 3 têm causa raiz conhecida, mas a correção em
si (deletar linhas órfãs, ou fazer UPDATE em REUNIDOS) segue bloqueada até:

1. o time confirmar que as 4 linhas de 30/03/2026 (FEIRA NOVA + PRIMUS FILIAL) são mesmo
   resíduo e podem ser removidas;
2. a Focus Fintax confirmar/enviar a versão de planilha certa para REUNIDOS e para a
   competência maio/2026 (aba "junho 2026" ausente nos 2 arquivos atuais);
3. a Focus Fintax confirmar qual CNPJ do REZENDE ALIMENTOS CDD LTDA é o correto (item já
   levantado na Fase 1, sem novidade aqui).

Ainda sem dados/decisão para: `segmento` dos 14 clientes, CNPJ correto do REZENDE, versão
correta da planilha de REUNIDOS/maio-2026.
