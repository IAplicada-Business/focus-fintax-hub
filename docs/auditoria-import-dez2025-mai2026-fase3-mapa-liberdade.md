# Auditoria de compensações — Fase 3: bug do "mapa"/saldo em julho/2026 (2026-08-12)

Complemento a [`auditoria-import-dez2025-mai2026-fase2-aplicacao.md`](./auditoria-import-dez2025-mai2026-fase2-aplicacao.md),
que deixou como pendente: *"O bug de 'mapa'/saldo em lançamentos manuais de julho/2026 reportado
pela Focus Fintax (telas em anexo) — investigação ainda não iniciada; falta identificar o
cliente das telas."*

**Cliente identificado:** SUPERMERCADO LIBERDADE (`6fac7998-b2a3-4b1d-b82c-92a112514a8d`).

## Causa raiz

O card "Total Compensado" (topo da página do cliente) e o Mapa Tributário usam a view
`v_cliente_totais_calculo` / `v_mapa_creditos`, cujo `total_compensado` por tese é:

```sql
GREATEST(COALESCE(valor_compensado_manual, 0), COALESCE(soma_lancamentos_vinculados, 0))
```

`valor_compensado_manual` é um snapshot congelado, escrito uma única vez por migration a partir
de uma planilha "Detalhamento por Cliente" — nada no fluxo de importação ou de lançamento manual
via app atualiza esse campo depois. Para a tese **INSUMOS** de Supermercado Liberdade, esse
snapshot tinha `valor_compensado_manual = R$ 150.000,00` — exatamente igual ao
`valor_apurado_inicial`, ou seja, o import original assumiu o crédito 100% usado. A soma real dos
lançamentos vinculados na aba Compensações, porém, é de apenas **R$ 103.775,43**.

Como o `GREATEST()` sempre escolhe o maior valor, o card ficava travado nos R$ 150.000,00
"fantasmas" — R$ 46.224,57 acima do que está de fato lançado e comprovável — e mostrava
`status_utilizacao = 'utilizado'` (saldo zero) quando na verdade ainda havia R$ 46.224,57 de
saldo disponível.

**Diferença observada nos prints do cliente:** aba Compensações somava R$ 384.316,82; card
"Total Compensado" mostrava R$ 430.541,39. Diferença de **R$ 46.224,57**, 100% explicada pela
tese INSUMOS.

## Planilha `Importar Sistema - FinTax RE.xlsx` (enviada pela Focus em 2026-08-12) não resolve

Antes de qualquer alteração, os parsers reais do importador (`import-controle-parser.ts` +
`import-fluxo-parser.ts`) foram rodados contra o arquivo, somente leitura:

- Aba `Controle`: INSUMOS R$ 150.000,00 e SUBVENÇÃO R$ 647.083,86 — já idênticos ao banco.
- Abas `fluxo caixa *`: cobrem só nov/2025–abr/2026 (a mais recente, `maio 2026`, traz
  competência abr/2026 pela convenção já documentada na Fase 1). Os 6 lançamentos de Liberdade
  no arquivo já existem no banco, com os mesmos valores. Nenhum dado novo.
- `valor_compensado_manual` não existe em nenhum parser deste arquivo — vem de uma planilha
  diferente ("Detalhamento por Cliente"), populada uma única vez via migration SQL.

Conclusão: reimportar esse arquivo não alteraria o card em nada. Reportado ao usuário em vez de
reimportar às cegas, para não reforçar um número que já estava errado.

## Correção aplicada (aprovada explicitamente antes da execução)

```sql
update creditos_apurados
set valor_compensado_manual = null, atualizado_em = now()
where id = 'b84033b2-8a9a-482f-9f37-07fd1df3ef11'; -- INSUMOS / Supermercado Liberdade

update creditos_apurados ca
set status_utilizacao = v.status_utilizacao, atualizado_em = now()
from v_mapa_creditos v
where ca.id = 'b84033b2-8a9a-482f-9f37-07fd1df3ef11'
  and ca.cliente_id = v.cliente_id and ca.tese_id = v.tese_id;
```

Zerar (`NULL`) o snapshot em vez de escrever um novo número fixo faz a view voltar a confiar na
soma real dos lançamentos — que é auditável e já reflete os lançamentos manuais de julho/2026
feitos pelo cliente.

| | Antes | Depois |
|---|---|---|
| `valor_compensado_manual` (INSUMOS) | R$ 150.000,00 | `NULL` |
| `status_utilizacao` (INSUMOS) | `utilizado` | `em_uso` |
| Card "Total Compensado" (view) | R$ 430.541,39 | **R$ 384.316,82** |
| Aba Compensações (soma real) | R$ 384.316,82 | R$ 384.316,82 |
| Saldo restante do cliente | — | R$ 412.767,04 |

Card e aba agora batem 100%. A tese SUBVENÇÃO não foi tocada (já estava correta: soma linkada
R$ 280.541,39 > manual R$ 123.243,00, então o `GREATEST()` já escolhia o valor certo).

## Escopo — o mesmo padrão existe em outros ~21 clientes

Uma varredura em `v_cliente_totais_calculo` vs. soma real da aba Compensações (mesmo critério de
`sumCompensadoCanonical`) encontrou divergência em 22 clientes, por 3 causas distintas:

1. **`valor_compensado_manual` desatualizado vence no `GREATEST()`** (a maioria — MARAVISTA, AP
   MEDEIROS, REUNIDOS, REZENDE (CDD/JPA/Nova Holanda), LGH, CGX, JJ, COURTS, MULTI ALIMENTOS,
   6 ESTRELAS, PEROLA NITERÓI, PRIMUS matriz — só Liberdade foi corrigido nesta rodada).
2. **`incluir_no_calculo = false`** zera o cliente inteiro no card mesmo com lançamentos reais na
   aba (FEIRA NOVA, SOLIDICON, FJC — já mapeado na Fase 1/2, decisão pendente do time).
3. **Sem linha em `creditos_apurados`** para a tese (Irmãos Florentinos matriz/filial, Mercearia
   Vidal matriz/filial, Primus Filial).
4. **Caso oposto:** PRINCESA tem R$ 1.894.338,27 só no snapshot manual, zero lançamento
   itemizado na aba Compensações — aqui o card não é "errado", só não é auditável linha a linha.

Nenhum desses outros 21 clientes foi alterado nesta rodada — só Liberdade, por ser o caso
reportado e confirmado explicitamente.

## Pendente — decisão do time antes de qualquer ação mais ampla

- Corrigir os outros ~15 clientes da causa 1 (mesmo padrão, correção pontual análoga).
- Decidir o que fazer com os clientes da causa 2 (flag `incluir_no_calculo`) e 3 (falta linha em
  `creditos_apurados`) — já sinalizados desde a Fase 1/2.
- Correção estrutural: hoje o `GREATEST()` escolhe em silêncio entre dois números que podem
  divergir, sem nenhum aviso. Proposta (não implementada): sinalizar/alertar quando
  `valor_compensado_manual` e a soma real dos lançamentos divergem, em vez de mascarar com
  `GREATEST()` — para nunca mostrar um total sem indicar que ele é conflitante.
