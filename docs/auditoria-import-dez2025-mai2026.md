# Auditoria da importação de compensações (dez/2025–mai/2026) — Fase 1: Diagnóstico

**Escopo:** somente leitura. Nenhum INSERT/UPDATE/DELETE, reimportação ou alteração de
importador foi executado. Este documento é o diagnóstico para aprovação antes da Fase 2
(correções).

**Data da auditoria:** 2026-08-12
**Banco:** projeto Supabase `focus-fintax-hub` (`qzkqrhamqtchboxtwpnz`), tabela
`public.compensacoes_mensais` (+ `public.clientes`, `public.creditos_apurados`).
**Planilhas fonte:**
1. `Importar Sistema - FinTax RE.xlsx` — abas `Controle` (cadastro/crédito inicial) e
   `fluxo caixa <mês> <ano>` (lançamentos mensais de compensação).
2. `Controle_creditos_FFinTax_Maio_2026 - SISTEMA RE.xlsx` — abas `Resumo Consolidado` e
   `Detalhamento por Cliente` (saldo acumulado de crédito por tese, foto de maio/2026).

**Método:** os dois arquivos foram lidos com os parsers já existentes no repositório
(`src/lib/import-fluxo-parser.ts` e `src/lib/import-controle-parser.ts`) — os mesmos usados
pelo importador da aplicação — para garantir que a leitura da planilha nesta auditoria seja
idêntica à que o sistema usaria numa importação real. Nenhum desses arquivos foi alterado.

---

## ⚠️ Achado metodológico crítico: a aba não é a competência

As abas `fluxo caixa <mês> <ano>` da planilha "Importar Sistema" são nomeadas pelo **mês de
fechamento/entrega**, não pela competência do lançamento. O título (célula R1) de cada aba
confirma isso — e para a aba `mar 2026` o título estava em branco, exigindo fallback pelo nome
da aba:

| Aba | Título (R1) | Competência real |
|---|---|---|
| fluxo caixa dez 2025 | NOVEMBRO - 2025 | nov/2025 (fora do escopo pedido) |
| fluxo caixa jan 2026 | DEZEMBRO - 2025 | **dez/2025** |
| fluxo caixa fev 2026 | JANEIRO - 2026 | **jan/2026** |
| fluxo caixa mar 2026 | *(vazio — inferido pelo nome da aba)* | **fev/2026** |
| fluxo caixa abr 2026 | MARÇO - 2026 | **mar/2026** |
| fluxo caixa maio 2026 | ABRIL - 2026 | **abr/2026** |

**Consequência:** as 2 planilhas fornecidas cobrem, de fato, as competências **nov/2025 a
abr/2026**. **Não existe, em nenhuma das 2 planilhas, nenhuma fonte para a competência
maio/2026** — isso exigiria uma aba `fluxo caixa junho 2026`, que não foi enviada. Qualquer
lançamento de maio/2026 já existente no banco **não pôde ser conferido nesta fase** por falta
de documento-fonte; está marcado como ⚪ **SEM FONTE** na tabela abaixo, não como gap ou erro.

Isso deve ser resolvido antes da Fase 2: ou a Focus Fintax envia a aba de maio/2026 (que viria
numa próxima planilha "junho"), ou se confirma que os lançamentos de maio/2026 no banco vieram
de outra fonte (lançamento manual, apuração de tese, etc.).

---

## Resumo executivo

| Métrica | Valor |
|---|---|
| Combinações cliente/mês analisadas (dez/2025–mai/2026) | 172 |
| 🔴 FALTA SUBIR (existe na planilha, ausente/zerado no banco) | **0** |
| 🟡 INCOERENTE (existe nos dois lados, valores não batem) | **6** |
| 🟢 CORRETO (bate 100%) | **134** |
| ⚪ SEM FONTE (maio/2026 — planilha não cobre a competência) | **32** |
| Linhas de compensação lidas da planilha (abas fluxo, nov/2025–abr/2026) | 155 |
| Registros em `compensacoes_mensais` no período dez/2025–mai/2026 | 380 |
| Clientes cadastrados no total | 94 |
| Clientes com `segmento` vazio | 14 |
| Clientes com possível CNPJ duplicado/digitado errado | 1 par (2 clientes) |
| Créditos com `valor_apurado_inicial = 0` e `incluir_no_calculo = true` | 0 |

**Nenhum gap de importação (🔴) foi encontrado** — todo valor presente na planilha para
dez/2025–abr/2026 está refletido no banco. Os 6 casos 🟡 apontam para um problema real e
concreto: pelo menos um cliente (**SUPERMERCADOS FEIRA NOVA LTDA**) tem valores de
competência **deslocados em um mês** no banco (ver detalhe abaixo) — não é falta de dado, é
dado no mês errado.

### Achados 🟡 em detalhe

| Cliente | Mês | Planilha | Banco | Diagnóstico |
|---|---|---|---|---|
| SUPERMERCADOS FEIRA NOVA LTDA | 2026-01 | R$ 340.788,89 | R$ 1.238.461,48 | Banco = planilha de jan/26 **+** R$ 897.672,59 (que é exatamente o valor de dez/25, tributo "outros"). |
| SUPERMERCADOS FEIRA NOVA LTDA | 2026-02 | — | R$ 340.788,89 | Esse valor é exatamente o de jan/26 na planilha — parece ter sido lançado num mês adiante. |
| REUNIDOS | 2026-04 | R$ 948.607,32 | R$ 2.694.306,42 | Diferença de +R$ 1.745.699,10, concentrada em INSS_52, INSS_retidos, PIS e COFINS — banco tem quase o dobro do valor da planilha. Requer conferência linha a linha antes de qualquer correção. |
| FJC COMERCIO DE PRODUTO (Flavio) | 2025-12 | — | R$ 251.371,88 | Banco tem lançamento de dez/25 que não aparece em nenhuma aba fluxo — possível apuração/tese lançada fora do fluxo mensal. |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 2026-01 | — | R$ 12.616,09 | Valor idêntico ao de "COMERCIAL DE ALIMENTOS PRIMUS" (matriz) em jan/26 — suspeita de lançamento duplicado entre matriz/filial (CNPJs distintos, `05904970000135` vs `05904970000216`). |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 2026-02 | — | R$ 12.760,99 | Mesmo padrão do item anterior, para fev/26. |

> A leitura automática da planilha também sinalizou, de forma independente, duas
> inconsistências internas nas próprias abas "fluxo caixa mar 2026" e "fluxo caixa maio 2026"
> (a célula "TOTAL" da linha de rodapé não bate com a soma das colunas de tributo — diffs de
> R$ 1.894.338,27 e R$ 10,00 respectivamente). Isso é um problema na planilha de origem da
> Focus Fintax, não no banco — vale reportar para quem preenche a planilha.

---

## 1) Cobertura mês a mês em `compensacoes_mensais`

```sql
SELECT to_char(mes_referencia,'YYYY-MM') AS mes,
       count(*) AS n_registros,
       count(DISTINCT cliente_id) AS n_clientes,
       sum(valor_compensado) AS total_valor
FROM public.compensacoes_mensais
WHERE mes_referencia BETWEEN '2025-12-01' AND '2026-05-01'
GROUP BY mes ORDER BY mes;
```

| Mês | Registros | Clientes distintos | Total compensado (R$) |
|---|---|---|---|
| 2025-12 | 53 | 26 | 4.796.098,16 |
| 2026-01 | 43 | 27 | 2.497.011,14 |
| 2026-02 | 46 | 30 | 3.033.782,70 |
| 2026-03 | 65 | 28 | 5.072.575,25 |
| 2026-04 | 85 | 29 | 4.404.152,61 |
| 2026-05 | 88 | 32 | 2.503.423,08 |

O crescimento de registros/clientes mês a mês é esperado (mais teses/tributos por cliente
sendo lançados ao longo do tempo). O mês de 2026-05 não tem planilha-fonte para conferência
(ver seção anterior).

---

## 2 e 3) Cruzamento cliente × mês — planilha vs. banco

Critério de comparação: soma de `valor_compensado` por cliente (CNPJ) e mês de competência,
tolerância de R$ 0,01.

- 🔴 **FALTA SUBIR** — existe na planilha (nov/2025–abr/2026) e está ausente ou zerado no banco.
- 🟡 **INCOERENTE** — existe nos dois lados mas os valores não batem, ou existe só no banco sem
  correspondência em nenhuma aba fluxo das 2 planilhas.
- 🟢 **CORRETO** — bate 100% entre banco e planilha.
- ⚪ **SEM FONTE** — competência maio/2026, fora do que as 2 planilhas conseguem atestar (ver
  achado metodológico acima). Não é erro; é limite do material recebido nesta fase.

<details>
<summary>Tabela completa — 172 combinações cliente/mês (clique para expandir)</summary>

| Empresa | CNPJ | Mês | Planilha (R$) | Banco (R$) | Status | Observação |
|---|---|---|---|---|---|---|
| AM MACAE COMERCIO | 18343960000110 | 2026-04 | 15422.96 | 15422.96 | 🟢 CORRETO | — |
| AM MACAE COMERCIO | 18343960000110 | 2026-05 | — | 16368.17 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| AP MEDEIROS | 31224769000117 | 2025-12 | 351644.94 | 351644.94 | 🟢 CORRETO | — |
| AP MEDEIROS | 31224769000117 | 2026-01 | 93797.98 | 93797.98 | 🟢 CORRETO | — |
| AP MEDEIROS | 31224769000117 | 2026-02 | 83169.46 | 83169.46 | 🟢 CORRETO | — |
| AP MEDEIROS | 31224769000117 | 2026-03 | 280878.22 | 280878.22 | 🟢 CORRETO | — |
| AP MEDEIROS | 31224769000117 | 2026-04 | 93247.96 | 93247.96 | 🟢 CORRETO | — |
| AP MEDEIROS | 31224769000117 | 2026-05 | — | 94140.99 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| CGX | 15580294000145 | 2025-12 | 198967.15 | 198967.15 | 🟢 CORRETO | — |
| CGX | 15580294000145 | 2026-01 | 39241.90 | 39241.90 | 🟢 CORRETO | — |
| CGX | 15580294000145 | 2026-02 | 40274.56 | 40274.56 | 🟢 CORRETO | — |
| CGX | 15580294000145 | 2026-03 | 117892.23 | 117892.23 | 🟢 CORRETO | — |
| CGX | 15580294000145 | 2026-04 | 41764.31 | 41764.31 | 🟢 CORRETO | — |
| CGX | 15580294000145 | 2026-05 | — | 42465.62 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| COMERCIAL 2 REZENDE ALIMENTOS LTDA | 17479543000136 | 2025-12 | 54601.93 | 54601.93 | 🟢 CORRETO | — |
| COMERCIAL 2 REZENDE ALIMENTOS LTDA | 17479543000136 | 2026-01 | 2771.87 | 2771.87 | 🟢 CORRETO | — |
| COMERCIAL 2 REZENDE ALIMENTOS LTDA | 17479543000136 | 2026-02 | 2660.94 | 2660.94 | 🟢 CORRETO | — |
| COMERCIAL 2 REZENDE ALIMENTOS LTDA | 17479543000136 | 2026-03 | 6348.45 | 6348.45 | 🟢 CORRETO | — |
| COMERCIAL 2 REZENDE ALIMENTOS LTDA | 17479543000136 | 2026-04 | 4372.29 | 4372.29 | 🟢 CORRETO | — |
| COMERCIAL 2 REZENDE ALIMENTOS LTDA | 17479543000136 | 2026-05 | — | 4203.78 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| COMERCIAL DE ALIMENTOS MANO | 05904978000100 | 2025-12 | 944.88 | 944.88 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS MANO | 05904978000100 | 2026-01 | 704.68 | 704.68 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS MANO | 05904978000100 | 2026-02 | 2015.54 | 2015.54 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS MANO | 05904978000100 | 2026-03 | 1829.81 | 1829.81 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS MANO | 05904978000100 | 2026-04 | 1698.00 | 1698.00 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS PRIMUS | 05904970000135 | 2025-12 | 12616.09 | 12616.09 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS PRIMUS | 05904970000135 | 2026-01 | 12760.99 | 12760.99 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS PRIMUS | 05904970000135 | 2026-02 | 17243.69 | 17243.69 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS PRIMUS | 05904970000135 | 2026-03 | 43833.96 | 43833.96 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS PRIMUS | 05904970000135 | 2026-04 | 20710.36 | 20710.36 | 🟢 CORRETO | — |
| COMERCIAL DE ALIMENTOS PRIMUS | 05904970000135 | 2026-05 | — | 19888.39 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 05904970000216 | 2026-01 | — | 12616.09 | 🟡 INCOERENTE | Valor idêntico ao de "COMERCIAL DE ALIMENTOS PRIMUS" (matriz) em jan/26 — suspeita de duplicidade matriz/filial. |
| COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL | 05904970000216 | 2026-02 | — | 12760.99 | 🟡 INCOERENTE | Mesmo padrão do mês anterior, para fev/26. |
| EMPORIO PETROLPOLIS | 15202462000169 | 2026-02 | 231195.77 | 231195.77 | 🟢 CORRETO | — |
| FJC COMERCIO DE PRODUTO (Flavio) | 22802549000132 | 2025-12 | — | 251371.88 | 🟡 INCOERENTE | Existe no banco mas não em nenhuma aba fluxo das 2 planilhas — possível lançamento de tese/apuração fora do fluxo mensal. |
| GRANO E FARINA PADARIA E COMERCIO LTDA | 29056262000150 | 2025-12 | 91492.69 | 91492.69 | 🟢 CORRETO | — |
| GRANO E FARINA PADARIA E COMERCIO LTDA | 29056262000150 | 2026-01 | 36443.90 | 36443.90 | 🟢 CORRETO | — |
| GRANO E FARINA PADARIA E COMERCIO LTDA | 29056262000150 | 2026-02 | 38021.38 | 38021.38 | 🟢 CORRETO | — |
| GRANO E FARINA PADARIA E COMERCIO LTDA | 29056262000150 | 2026-03 | 42801.54 | 42801.54 | 🟢 CORRETO | — |
| GRANO E FARINA PADARIA E COMERCIO LTDA | 29056262000150 | 2026-04 | 42567.37 | 42567.37 | 🟢 CORRETO | — |
| GRANO E FARINA PADARIA E COMERCIO LTDA | 29056262000150 | 2026-05 | — | 42728.26 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| IRMAOS FLORENTINOS CEREAIS LTDA (MATRIZ) | 68746239000149 | 2026-05 | — | 16739.69 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| IRMAOS FLORENTINOS CEREAIS LTDA(FILIAL) | 68746239000220 | 2026-05 | — | 26947.52 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| LGH | 26061062000105 | 2025-12 | 90516.95 | 90516.95 | 🟢 CORRETO | — |
| LGH | 26061062000105 | 2026-01 | 2070.83 | 2070.83 | 🟢 CORRETO | — |
| LGH | 26061062000105 | 2026-02 | 2765.04 | 2765.04 | 🟢 CORRETO | — |
| LGH | 26061062000105 | 2026-03 | 56893.22 | 56893.22 | 🟢 CORRETO | — |
| LGH | 26061062000105 | 2026-04 | 2552.95 | 2552.95 | 🟢 CORRETO | — |
| LGH | 26061062000105 | 2026-05 | — | 2979.08 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MARAVISTA COMERCIO DE ALIMENTOS | 30140610000151 | 2025-12 | 271698.46 | 271698.46 | 🟢 CORRETO | — |
| MARAVISTA COMERCIO DE ALIMENTOS | 30140610000151 | 2026-01 | 224852.09 | 224852.09 | 🟢 CORRETO | — |
| MARAVISTA COMERCIO DE ALIMENTOS | 30140610000151 | 2026-02 | 244699.79 | 244699.79 | 🟢 CORRETO | — |
| MARAVISTA COMERCIO DE ALIMENTOS | 30140610000151 | 2026-03 | 1202514.08 | 1202514.08 | 🟢 CORRETO | — |
| MARAVISTA COMERCIO DE ALIMENTOS | 30140610000151 | 2026-04 | 240212.40 | 240212.40 | 🟢 CORRETO | — |
| MARAVISTA COMERCIO DE ALIMENTOS | 30140610000151 | 2026-05 | — | 250372.61 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MERCADO 24 HORAS DA ROCINHA LTDA | 23672895000106 | 2025-12 | 128149.80 | 128149.80 | 🟢 CORRETO | — |
| MERCADO 24 HORAS DA ROCINHA LTDA | 23672895000106 | 2026-01 | 28115.03 | 28115.03 | 🟢 CORRETO | — |
| MERCADO 24 HORAS DA ROCINHA LTDA | 23672895000106 | 2026-02 | 574.58 | 574.58 | 🟢 CORRETO | — |
| MERCADO 24 HORAS DA ROCINHA LTDA | 23672895000106 | 2026-03 | 13053.06 | 13053.06 | 🟢 CORRETO | — |
| MERCADO 24 HORAS DA ROCINHA LTDA | 23672895000106 | 2026-04 | 35953.27 | 35953.27 | 🟢 CORRETO | — |
| MERCADO 24 HORAS DA ROCINHA LTDA | 23672895000106 | 2026-05 | — | 31249.48 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MERCADO UNIÃO DE NOVA BRASILIA LTDA | 30285758000184 | 2025-12 | 9678.78 | 9678.78 | 🟢 CORRETO | — |
| MERCADO UNIÃO DE NOVA BRASILIA LTDA | 30285758000184 | 2026-01 | 7910.23 | 7910.23 | 🟢 CORRETO | — |
| MERCADO UNIÃO DE NOVA BRASILIA LTDA | 30285758000184 | 2026-02 | 10890.35 | 10890.35 | 🟢 CORRETO | — |
| MERCADO UNIÃO DE NOVA BRASILIA LTDA | 30285758000184 | 2026-03 | 15835.07 | 15835.07 | 🟢 CORRETO | — |
| MERCADO UNIÃO DE NOVA BRASILIA LTDA | 30285758000184 | 2026-04 | 10089.41 | 10089.41 | 🟢 CORRETO | — |
| MERCADO UNIÃO DE NOVA BRASILIA LTDA | 30285758000184 | 2026-05 | — | 9071.10 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MERCEARIA 6 ESTRELAS LTDA (Paulo) | 22546657000191 | 2025-12 | 240788.72 | 240788.72 | 🟢 CORRETO | — |
| MERCEARIA 6 ESTRELAS LTDA (Paulo) | 22546657000191 | 2026-01 | 24410.75 | 24410.75 | 🟢 CORRETO | — |
| MERCEARIA 6 ESTRELAS LTDA (Paulo) | 22546657000191 | 2026-02 | 26136.44 | 26136.44 | 🟢 CORRETO | — |
| MERCEARIA 6 ESTRELAS LTDA (Paulo) | 22546657000191 | 2026-03 | 73542.27 | 73542.27 | 🟢 CORRETO | — |
| MERCEARIA 6 ESTRELAS LTDA (Paulo) | 22546657000191 | 2026-04 | 26101.36 | 26101.36 | 🟢 CORRETO | — |
| MERCEARIA 6 ESTRELAS LTDA (Paulo) | 22546657000191 | 2026-05 | — | 27125.87 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MERCEARIA VIDAL LTDA (FILIAL) | 28882587000200 | 2026-05 | — | 4789.61 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MERCEARIA VIDAL LTDA (MATRIZ) | 28882587000129 | 2026-05 | — | 5538.45 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MULTI ALIMENTOS MENDANHA LTDA | 30807561000168 | 2025-12 | 62102.24 | 62102.24 | 🟢 CORRETO | — |
| MULTI ALIMENTOS MENDANHA LTDA | 30807561000168 | 2026-01 | 242.57 | 242.57 | 🟢 CORRETO | — |
| MULTI ALIMENTOS MENDANHA LTDA | 30807561000168 | 2026-02 | 101.39 | 101.39 | 🟢 CORRETO | — |
| MULTI ALIMENTOS MENDANHA LTDA | 30807561000168 | 2026-03 | 407.92 | 407.92 | 🟢 CORRETO | — |
| MULTI ALIMENTOS MENDANHA LTDA | 30807561000168 | 2026-04 | 220.62 | 220.62 | 🟢 CORRETO | — |
| MULTI ALIMENTOS MENDANHA LTDA | 30807561000168 | 2026-05 | — | 270.84 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| MULTIMIX | 03307464000133 | 2026-02 | 69999.75 | 69999.75 | 🟢 CORRETO | — |
| PADARIA JANDRES | 10440200000119 | 2026-01 | 18905.27 | 18905.27 | 🟢 CORRETO | — |
| PADARIA JANDRES | 10440200000119 | 2026-02 | 27105.80 | 27105.80 | 🟢 CORRETO | — |
| PADARIA JANDRES | 10440200000119 | 2026-03 | 26457.28 | 26457.28 | 🟢 CORRETO | — |
| PADARIA JANDRES | 10440200000119 | 2026-04 | 30680.29 | 30680.29 | 🟢 CORRETO | — |
| PADARIA JANDRES | 10440200000119 | 2026-05 | — | 28646.01 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| PEROLA DE NITEROI SUPERMERCADOS LTDA | 16564133000120 | 2025-12 | 319793.89 | 319793.89 | 🟢 CORRETO | — |
| PEROLA DE NITEROI SUPERMERCADOS LTDA | 16564133000120 | 2026-01 | 132979.38 | 132979.38 | 🟢 CORRETO | — |
| PEROLA DE NITEROI SUPERMERCADOS LTDA | 16564133000120 | 2026-02 | 127749.01 | 127749.01 | 🟢 CORRETO | — |
| PEROLA DE NITEROI SUPERMERCADOS LTDA | 16564133000120 | 2026-03 | 134769.50 | 134769.50 | 🟢 CORRETO | — |
| PEROLA DE NITEROI SUPERMERCADOS LTDA | 16564133000120 | 2026-04 | 189325.57 | 189325.57 | 🟢 CORRETO | — |
| PEROLA DE NITEROI SUPERMERCADOS LTDA | 16564133000120 | 2026-05 | — | 140715.49 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| REUNIDOS | 32352751000163 | 2026-02 | 1124495.75 | 1124495.75 | 🟢 CORRETO | — |
| REUNIDOS | 32352751000163 | 2026-03 | 1281838.81 | 1281838.81 | 🟢 CORRETO | — |
| REUNIDOS | 32352751000163 | 2026-04 | 948607.32 | 2694306.42 | 🟡 INCOERENTE | Diferença de +R$ 1.745.699,10, concentrada em INSS_52/INSS_retidos/PIS/COFINS — banco quase o dobro da planilha. |
| REUNIDOS | 32352751000163 | 2026-05 | — | 797091.78 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| REZENDE ALIMENTOS CDD LTDA | 28732157000120 | 2025-12 | 210165.59 | 210165.59 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS CDD LTDA | 28732157000120 | 2026-01 | 14725.94 | 14725.94 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS CDD LTDA | 28732157000120 | 2026-02 | 3831.28 | 3831.28 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS CDD LTDA | 28732157000120 | 2026-03 | 40288.10 | 40288.10 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS CDD LTDA | 28732157000120 | 2026-04 | 857.21 | 857.21 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS CDD LTDA | 28732157000120 | 2026-05 | — | 452.88 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| REZENDE ALIMENTOS JPA LTDA | 50250937000193 | 2025-12 | 284053.24 | 284053.24 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS JPA LTDA | 50250937000193 | 2026-01 | 448.15 | 448.15 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS JPA LTDA | 50250937000193 | 2026-02 | 22446.97 | 22446.97 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS JPA LTDA | 50250937000193 | 2026-03 | 18296.58 | 18296.58 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS JPA LTDA | 50250937000193 | 2026-04 | 71409.53 | 71409.53 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS JPA LTDA | 50250937000193 | 2026-05 | — | 76028.98 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| REZENDE ALIMENTOS NOVA HOLANDA LTDA | 32254332000199 | 2025-12 | 25303.49 | 25303.49 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS NOVA HOLANDA LTDA | 32254332000199 | 2026-01 | 10926.24 | 10926.24 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS NOVA HOLANDA LTDA | 32254332000199 | 2026-02 | 1913.13 | 1913.13 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS NOVA HOLANDA LTDA | 32254332000199 | 2026-03 | 2017.35 | 2017.35 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS NOVA HOLANDA LTDA | 32254332000199 | 2026-04 | 4881.05 | 4881.05 | 🟢 CORRETO | — |
| REZENDE ALIMENTOS NOVA HOLANDA LTDA | 32254332000199 | 2026-05 | — | 6623.93 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SÃO FERNANDO | 11304945000113 | 2025-12 | 439167.03 | 439167.03 | 🟢 CORRETO | — |
| SÃO FERNANDO | 11304945000113 | 2026-01 | 122127.76 | 122127.76 | 🟢 CORRETO | — |
| SÃO FERNANDO | 11304945000113 | 2026-02 | 114969.41 | 114969.41 | 🟢 CORRETO | — |
| SÃO FERNANDO | 11304945000113 | 2026-03 | 378460.05 | 378460.05 | 🟢 CORRETO | — |
| SÃO FERNANDO | 11304945000113 | 2026-04 | 241216.34 | 241216.34 | 🟢 CORRETO | — |
| SÃO FERNANDO | 11304945000113 | 2026-05 | — | 182509.03 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SHOPPING D CARNE BOI DE OURO | 13373989000120 | 2025-12 | 5527.42 | 5527.42 | 🟢 CORRETO | — |
| SHOPPING D CARNE BOI DE OURO | 13373989000120 | 2026-01 | 5938.74 | 5938.74 | 🟢 CORRETO | — |
| SHOPPING D CARNE BOI DE OURO | 13373989000120 | 2026-02 | 6771.93 | 6771.93 | 🟢 CORRETO | — |
| SHOPPING D CARNE BOI DE OURO | 13373989000120 | 2026-03 | 12768.37 | 12768.37 | 🟢 CORRETO | — |
| SHOPPING D CARNE BOI DE OURO | 13373989000120 | 2026-04 | 8551.88 | 8551.88 | 🟢 CORRETO | — |
| SHOPPING D CARNE BOI DE OURO | 13373989000120 | 2026-05 | — | 9716.70 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SOLIDICON | 04782837000190 | 2026-03 | 558033.59 | 558033.59 | 🟢 CORRETO | — |
| SOLIDICON | 04782837000190 | 2026-04 | 107224.47 | 107224.47 | 🟢 CORRETO | — |
| SOLIDICON | 04782837000190 | 2026-05 | — | 104516.98 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SUPERMERCADO CAMPOS NOVOS | 33333713000126 | 2026-03 | 7751.06 | 7751.06 | 🟢 CORRETO | — |
| SUPERMERCADO CAMPOS NOVOS | 33333713000126 | 2026-04 | 586.38 | 586.38 | 🟢 CORRETO | — |
| SUPERMERCADO CAMPOS NOVOS | 33333713000126 | 2026-05 | — | 901.63 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SUPERMERCADO COURTS LTDA | 00569560000161 | 2025-12 | 81481.73 | 81481.73 | 🟢 CORRETO | — |
| SUPERMERCADO COURTS LTDA | 00569560000161 | 2026-01 | 66336.53 | 66336.53 | 🟢 CORRETO | — |
| SUPERMERCADO COURTS LTDA | 00569560000161 | 2026-02 | 79315.18 | 79315.18 | 🟢 CORRETO | — |
| SUPERMERCADO COURTS LTDA | 00569560000161 | 2026-03 | 89716.66 | 89716.66 | 🟢 CORRETO | — |
| SUPERMERCADO COURTS LTDA | 00569560000161 | 2026-04 | 81122.08 | 81122.08 | 🟢 CORRETO | — |
| SUPERMERCADO COURTS LTDA | 00569560000161 | 2026-05 | — | 81597.32 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SUPERMERCADO ECONOMICO JJ LTDA | 22536813000133 | 2025-12 | 388650.16 | 388650.16 | 🟢 CORRETO | — |
| SUPERMERCADO ECONOMICO JJ LTDA | 22536813000133 | 2026-01 | 202074.19 | 202074.19 | 🟢 CORRETO | — |
| SUPERMERCADO ECONOMICO JJ LTDA | 22536813000133 | 2026-02 | 183871.48 | 183871.48 | 🟢 CORRETO | — |
| SUPERMERCADO ECONOMICO JJ LTDA | 22536813000133 | 2026-03 | 228406.36 | 228406.36 | 🟢 CORRETO | — |
| SUPERMERCADO ECONOMICO JJ LTDA | 22536813000133 | 2026-04 | 197203.87 | 197203.87 | 🟢 CORRETO | — |
| SUPERMERCADO ECONOMICO JJ LTDA | 22536813000133 | 2026-05 | — | 247085.83 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SUPERMERCADO GUIMARAES FILHOS LTDA | 50547492000108 | 2025-12 | 140702.82 | 140702.82 | 🟢 CORRETO | — |
| SUPERMERCADO GUIMARAES FILHOS LTDA | 50547492000108 | 2026-01 | 116074.00 | 116074.00 | 🟢 CORRETO | — |
| SUPERMERCADO GUIMARAES FILHOS LTDA | 50547492000108 | 2026-02 | 135742.85 | 135742.85 | 🟢 CORRETO | — |
| SUPERMERCADO GUIMARAES FILHOS LTDA | 50547492000108 | 2026-03 | 170185.58 | 170185.58 | 🟢 CORRETO | — |
| SUPERMERCADO GUIMARAES FILHOS LTDA | 50547492000108 | 2026-04 | 138995.05 | 138995.05 | 🟢 CORRETO | — |
| SUPERMERCADO GUIMARAES FILHOS LTDA | 50547492000108 | 2026-05 | — | 138726.36 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SUPERMERCADO LIBERDADE | 09633032000107 | 2025-12 | 64887.92 | 64887.92 | 🟢 CORRETO | — |
| SUPERMERCADO LIBERDADE | 09633032000107 | 2026-01 | 25635.65 | 25635.65 | 🟢 CORRETO | — |
| SUPERMERCADO LIBERDADE | 09633032000107 | 2026-02 | 26215.94 | 26215.94 | 🟢 CORRETO | — |
| SUPERMERCADO LIBERDADE | 09633032000107 | 2026-03 | 66368.86 | 66368.86 | 🟢 CORRETO | — |
| SUPERMERCADO LIBERDADE | 09633032000107 | 2026-04 | 44480.39 | 44480.39 | 🟢 CORRETO | — |
| SUPERMERCADO LIBERDADE | 09633032000107 | 2026-05 | — | 35659.73 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| SUPERMERCADOS FEIRA NOVA LTDA | 36525319000188 | 2025-12 | 897672.59 | 897672.59 | 🟢 CORRETO | — |
| SUPERMERCADOS FEIRA NOVA LTDA | 36525319000188 | 2026-01 | 340788.89 | 1238461.48 | 🟡 INCOERENTE | Banco = jan/26 + o valor de dez/25 (897.672,59, tributo "outros") — parece ter sido somado duas vezes. |
| SUPERMERCADOS FEIRA NOVA LTDA | 36525319000188 | 2026-02 | — | 340788.89 | 🟡 INCOERENTE | Valor idêntico ao de jan/26 na planilha — parece ter sido lançado num mês adiante. |
| SUPREMO | 05229674000186 | 2025-12 | 155633.11 | 155633.11 | 🟢 CORRETO | — |
| SUPREMO | 05229674000186 | 2026-01 | 45891.92 | 45891.92 | 🟢 CORRETO | — |
| SUPREMO | 05229674000186 | 2026-02 | 42617.19 | 42617.19 | 🟢 CORRETO | — |
| SUPREMO | 05229674000186 | 2026-03 | 177068.01 | 177068.01 | 🟢 CORRETO | — |
| SUPREMO | 05229674000186 | 2026-04 | 47943.51 | 47943.51 | 🟢 CORRETO | — |
| SUPREMO | 05229674000186 | 2026-05 | — | 44094.27 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |
| UNIÃO DA FAMILIA MERCEARIA LTDA | 20782168000103 | 2025-12 | 18484.66 | 18484.66 | 🟢 CORRETO | — |
| UNIÃO DA FAMILIA MERCEARIA LTDA | 20782168000103 | 2026-01 | 10546.98 | 10546.98 | 🟢 CORRETO | — |
| UNIÃO DA FAMILIA MERCEARIA LTDA | 20782168000103 | 2026-02 | 13438.22 | 13438.22 | 🟢 CORRETO | — |
| UNIÃO DA FAMILIA MERCEARIA LTDA | 20782168000103 | 2026-03 | 24319.26 | 24319.26 | 🟢 CORRETO | — |
| UNIÃO DA FAMILIA MERCEARIA LTDA | 20782168000103 | 2026-04 | 10455.31 | 10455.31 | 🟢 CORRETO | — |
| UNIÃO DA FAMILIA MERCEARIA LTDA | 20782168000103 | 2026-05 | — | 14176.70 | ⚪ SEM FONTE | Competência maio/2026 sem fonte nas 2 planilhas (ver achado metodológico). |

</details>

**Nota sobre clientes fora desta tabela:** dos 94 clientes cadastrados, apenas os que têm
pelo menos uma linha na planilha ou no banco no período dez/2025–mai/2026 aparecem acima. Os
demais (a maioria dos clientes do segmento "supermercado" cadastrados mais recentemente) ainda
não têm nenhum lançamento de compensação no período — não é necessariamente um gap, pode
significar que o cliente não compensou nesses meses.

---

## 4) Qualidade de cadastro do cliente

### 4.1 — `segmento` vazio

```sql
SELECT empresa, regexp_replace(cnpj,'\D','','g') AS cnpj, segmento, status
FROM public.clientes
WHERE segmento IS NULL OR btrim(segmento) = ''
ORDER BY empresa;
```

14 clientes classificados como 🟡 **INCOERENTE** (cadastro incompleto — não impede o
cálculo hoje, mas deveria ser preenchido):

| Empresa | CNPJ |
|---|---|
| AM MACAE COMERCIO | 18343960000110 |
| AP MEDEIROS | 31224769000117 |
| COMERCIAL DE ALIMENTOS PRIMUS | 05904970000135 |
| IRMAOS FLORENTINOS CEREAIS LTDA(FILIAL) | 68746239000220 |
| J PINTO COMÉRCIO DE ALIMENTOS (SERRA AZUL) | 11820069000188 |
| L.C.D. ENGENHARIA, CONSTRUCOES, MONTAGENS E MANUTENCOES | 03593765000170 |
| MARICA TAXI AEREO LTDA | 31548241000101 |
| MERCEARIA VIDAL LTDA (FILIAL) | 28882587000200 |
| POLISUPER DISTRIBUIDORA DE ALIMENTOS LTDA | 07369040000154 |
| REUNIDOS | 32352751000163 |
| REZENDE ALIMENTOS CDD LTDA (CNPJ `...78...`, ver 4.3) | 28782157000120 |
| SUPERMERCADO CAMPOS NOVOS | 33333713000126 |
| USINA DE LEITE PARAISO LTDA | 45621875000149 |

### 4.2 — Crédito zerado de forma inconsistente

```sql
-- (a) valor_apurado_inicial = 0 mas incluído no cálculo
SELECT c.empresa, regexp_replace(c.cnpj,'\D','','g') AS cnpj, t.codigo::text AS tese,
       ca.valor_apurado_inicial, ca.incluir_no_calculo, ca.status_utilizacao
FROM public.creditos_apurados ca
JOIN public.clientes c ON c.id = ca.cliente_id
JOIN public.teses_tributarias t ON t.id = ca.tese_id
WHERE ca.valor_apurado_inicial = 0 AND ca.incluir_no_calculo = true;

-- (b) mesmo cliente/tributo com valor_compensado = 0 em um mês e > 0 em outro,
--     dentro do período auditado
WITH por_cliente_tributo_mes AS (
  SELECT cliente_id, tributo_enum, to_char(mes_referencia,'YYYY-MM') AS mes,
         sum(valor_compensado) AS valor
  FROM public.compensacoes_mensais
  WHERE mes_referencia BETWEEN '2025-12-01' AND '2026-05-01'
  GROUP BY cliente_id, tributo_enum, mes
),
agg AS (
  SELECT cliente_id, tributo_enum,
         count(*) FILTER (WHERE valor = 0) AS meses_zero,
         count(*) FILTER (WHERE valor > 0) AS meses_positivo
  FROM por_cliente_tributo_mes
  GROUP BY cliente_id, tributo_enum
)
SELECT c.empresa, regexp_replace(c.cnpj,'\D','','g') AS cnpj, a.tributo_enum::text,
       a.meses_zero, a.meses_positivo
FROM agg a JOIN public.clientes c ON c.id = a.cliente_id
WHERE a.meses_zero > 0 AND a.meses_positivo > 0
ORDER BY c.empresa;
```

**Resultado: 🟢 CORRETO — nenhuma linha em (a) nem em (b).** Não há, hoje, nenhum
`creditos_apurados` com crédito inicial zerado marcado para entrar no cálculo, e não há nenhum
cliente/tributo com `valor_compensado = 0` num mês do período convivendo com valor positivo em
outro mês do mesmo período. Ou seja, a hipótese de "crédito zerado inconsistente" descrita no
pedido **não se confirmou** na amostra atual — mas vale manter essa query como checagem
recorrente, porque um caso desses passaria a existir assim que a Fase 2 subir dados.

### 4.3 — CNPJ possivelmente duplicado/digitado errado

```sql
WITH c AS (
  SELECT id, empresa, regexp_replace(cnpj,'\D','','g') AS cnpj_digits
  FROM public.clientes
  WHERE length(regexp_replace(cnpj,'\D','','g')) = 14
)
SELECT a.empresa AS empresa_a, a.cnpj_digits AS cnpj_a,
       b.empresa AS empresa_b, b.cnpj_digits AS cnpj_b,
       (SELECT count(*) FROM generate_series(1,14) i
        WHERE substring(a.cnpj_digits,i,1) <> substring(b.cnpj_digits,i,1)) AS diffs
FROM c a JOIN c b ON a.id < b.id
WHERE (SELECT count(*) FROM generate_series(1,14) i
       WHERE substring(a.cnpj_digits,i,1) <> substring(b.cnpj_digits,i,1)) <= 2
ORDER BY diffs, empresa_a;
```

🔴 **FALTA SUBIR (cadastro):** encontrado **1 par** de clientes com o mesmo nome e CNPJs que
diferem em apenas 1 dígito — muito provável duplicidade por erro de digitação:

| Empresa A | CNPJ A | Empresa B | CNPJ B | Dígitos diferentes |
|---|---|---|---|---|
| REZENDE ALIMENTOS CDD LTDA | `28732157000120` | REZENDE ALIMENTOS CDD LTDA | `28782157000120` | 1 (posição 5: "73" vs "78") |

Os dois registros têm **valores idênticos** de `valor_apurado_inicial` para INSUMOS
(280.460,30), SUBVENCAO (1.146.481,03) e ICMS_ST (173.889,96) — são claramente o mesmo cliente
cadastrado duas vezes. O CNPJ `28732157000120` é o que tem compensações mensais reais lançadas
(dez/25–mai/26, ver tabela da seção 2/3); `28782157000120` está com `segmento` vazio e nenhuma
compensação. Precisa de conferência com a Focus Fintax para saber qual CNPJ é o correto antes
de decidir qual registro mesclar/descartar.

---

## Ações recomendadas para a Fase 2 (não executadas nesta fase)

1. **Confirmar a origem do CNPJ correto de "REZENDE ALIMENTOS CDD LTDA"** (`28732157000120`
   vs `28782157000120`) com a Focus Fintax antes de mesclar os dois cadastros de cliente —
   mesclar sem confirmação pode apagar o histórico correto.
2. **Investigar e corrigir o deslocamento de competência de SUPERMERCADOS FEIRA NOVA LTDA**
   (dez/25 → jan/26 → fev/26): o valor de dez/25 parece ter sido somado ao lançamento de
   jan/26, e o de jan/26 replicado em fev/26. Provável causa: import duplicado sem
   `tese_origem_id`/chave natural batendo corretamente para esse cliente específico.
3. **Conferir linha a linha REUNIDOS em abr/2026** — banco tem quase o dobro do valor da
   planilha em INSS_52/INSS_retidos/PIS/COFINS; pode ser importação duplicada ou lançamento
   manual somado por cima do import da planilha.
4. **Verificar a origem de "COMERCIAL DE ALIMENTOS PRIMUS LTDA/BOI DE OURO/FILIAL"** em
   jan/26 e fev/26 (valores idênticos aos da matriz) — decidir se é um lançamento legítimo da
   filial ou duplicidade por CNPJ de filial cadastrado incorretamente.
5. **Conferir a origem de FJC COMERCIO DE PRODUTO (dez/25, R$ 251.371,88)** — não está em
   nenhuma aba fluxo; se for um lançamento manual de tese, documentar a origem para não ser
   confundido com gap numa próxima auditoria.
6. **Pedir à Focus Fintax a planilha "fluxo caixa junho 2026"** — é a única forma de obter
   fonte comparável para a competência maio/2026, hoje sem nenhuma conferência possível.
7. **Reportar à Focus Fintax as duas inconsistências internas de TOTAL** nas abas
   "fluxo caixa mar 2026" (diff R$ 1.894.338,27) e "fluxo caixa maio 2026" (diff R$ 10,00) — a
   célula de rodapé "TOTAL" da própria planilha não bate com a soma das colunas de tributo.
8. **Preencher o campo `segmento`** dos 14 clientes listados na seção 4.1.
9. Somente depois dos itens 1–5 estarem resolvidos/confirmados, considerar a reimportação
   seletiva dos gaps (não há gaps 🔴 hoje, mas o item 2 pode gerar a necessidade de uma
   correção pontual de mês/valor, não uma reimportação em massa).

Nenhuma dessas ações foi executada nesta fase. Aguardando aprovação deste relatório para
seguir para a Fase 2.
