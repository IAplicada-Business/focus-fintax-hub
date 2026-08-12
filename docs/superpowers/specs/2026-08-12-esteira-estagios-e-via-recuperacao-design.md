# Esteira: estágios configuráveis + via de recuperação padrão por tese (2026-08-12)

Spec curta (path arquitetural, mas escopo final ficou pequeno depois do brainstorming). Cobre 2
dos parciais mapeados na auditoria de tasks do dia: "Esteira administrativa configurável" e
"Motor de decisão automática da via de recuperação".

## Decisões tomadas no brainstorming

1. **Grão do estágio da esteira permanece em `clientes`** (1 estágio por cliente), não migra pra
   `processos_teses`. Migrar o grão reabriria a Épica 14 (múltiplas teses simultâneas, esteiras
   por ramo), que a migration `20260806220000` registra como decisão explícita de escopo — fora
   desta tarefa.
2. **Enum `estagio_esteira` do Postgres não é substituído por FK.** `esteira_sla_config` (criada
   ontem, `20260812160000`) já é 90% do que a tarefa original chamava de "tabela
   `esteira_estagios`": PK = valor do enum, `label`, `sla_dias`, `ordem`. Falta só `ativo`. Trocar
   o enum por FK de verdade (permitir criar estágio 100% pela UI, sem migration) foi descartado
   por custo/risco — toca trigger, 2 views e o kanban, pra um ganho que ninguém pediu ainda
   (nenhuma etapa nova além das 7 que já existem foi cogitada).
3. **`tese_via_recuperacao` não é uma tabela nova.** O catálogo de teses que `ProcessoFormModal`
   already usa pra popular o seletor é `motor_teses_config` (não `teses_tributarias`), e já tem
   CRUD completo em `/configuracoes/motor` (`MotorConfig.tsx`). A "via padrão por tese" vira uma
   coluna nessa tabela em vez de uma tabela+tela nova — reaproveita RLS, screen permission e UI
   existentes, mesmo padrão já usado quando o motor ganhou a coluna `tributos` (migration
   `20260706140000_motor_multi_tributos.sql`).

## Feature 1 — Estágios da esteira configuráveis (ordem, label, SLA, ativo)

**Escopo:** admin consegue reordenar, renomear, ativar/desativar e ajustar SLA das 7 etapas
existentes sem deploy. Criar uma etapa **nova** (8ª etapa) continua exigindo migration — não é
esse o problema que está sendo resolvido agora.

- Migration: `ALTER TABLE esteira_sla_config ADD COLUMN ativo boolean NOT NULL DEFAULT true;` +
  estende o `GRANT UPDATE (...)` existente pra incluir `ordem` e `ativo` (hoje só
  `label, sla_dias, ordem, atualizado_em` — `ordem` já está lá, falta só `ativo`).
- `esteiraSlaConfigService.ts`: `EsteiraSlaConfigRow` ganha `ativo`; `listEsteiraSlaConfig` seleciona
  a coluna; `updateEsteiraSlaConfig` passa a persistir `ordem` e `ativo`, não só `label`/`sla_dias`.
- `EsteiraSlaConfig.tsx`: além do campo de SLA por linha, ganha input numérico de ordem e um
  `Switch` de ativo. Cabeçalho/texto atualizados pra refletir o escopo maior (deixa de ser só
  "SLA da Esteira"). Rota (`/configuracoes/esteira-sla`) e permissão (`screenKey: "esteira"`) não
  mudam — só o rótulo no sidebar.
- `Esteira.tsx` / `EsteiraKanban.tsx`: hoje o kanban itera `ESTEIRA_STAGES` (array estático de
  `esteira-constants.ts`). Passa a receber a lista de colunas como prop, montada a partir de
  `useEsteiraSlaConfig()` (ordenada por `ordem`, filtrada por `ativo`).
  **Regra de segurança de dado** (consistente com o resto desta conversa: nunca esconder dado
  sem avisar): se uma etapa for desativada mas **ainda tiver cliente alocado nela**, a coluna
  continua aparecendo — só desaparece quando `ativo = false` E zero clientes atualmente na etapa.
  Isso evita cliente "desaparecer" do quadro por um toggle administrativo.
- `esteira-constants.ts` continua existindo (usado por `isEstagioEsteira`, drag validation,
  fallback local) — não é removido, só deixa de ser a fonte de ordem/label/ativo pro kanban.

## Feature 2 — Via de recuperação padrão por tese

**Escopo:** trocar a heurística por regex (`sugerirTipoRecuperacao`, que só reconhece "JUD" e
"ressarc" no nome) por um valor explícito e editável por tese, mantendo a heurística como
fallback pra tese ainda não configurada.

**Fora de escopo (idêntico ao que já estava mapeado):** roteamento automático pra uma esteira
separada de Ressarcimento/Judicial não existe — só existe 1 kanban (Compensação). O resultado
prático continua sendo a tag/badge no card, não uma segunda esteira.

- Migration: `ALTER TABLE motor_teses_config ADD COLUMN tipo_recuperacao_padrao public.tipo_recuperacao NOT NULL DEFAULT 'compensacao';`
  seguida de um `UPDATE` de backfill com a mesma regra da heurística atual (`ILIKE '%JUD%'` /
  `nome_exibicao ILIKE '%judicial%'` → `recuperacao_judicial`; `ILIKE '%ressarc%'` →
  `ressarcimento`) — comportamento não muda no dia 1, só passa a ser editável.
- `MotorConfig.tsx`: `TeseConfig` ganha `tipo_recuperacao_padrao`; dialog de criar/editar tese
  ganha um `Select` com as 3 opções (`TIPOS_RECUPERACAO` de `tipo-recuperacao.ts`).
- `ProcessoFormModal.tsx`: o `select` de teses passa a trazer `tipo_recuperacao_padrao`; nos dois
  pontos que chamam `sugerirTipoRecuperacao(value, nome)` (linha ~87 e ~108), a prioridade passa a
  ser `t?.tipo_recuperacao_padrao ?? sugerirTipoRecuperacao(value, nome)` — fallback preserva
  comportamento pra qualquer linha que escape do backfill.

## Testes

- Estende `src/test/esteira-sla.test.ts`: `ordem`/`ativo` persistem via `updateEsteiraSlaConfig`;
  regra "etapa inativa com cliente alocado continua visível".
- Estende `src/test/tipo-recuperacao.test.ts` (ou cria teste de integração leve no componente): a
  função que resolve o tipo prioriza o valor configurado sobre a heurística, e cai pra heurística
  quando não há config.

## Não faz parte desta spec

- Múltiplas teses simultâneas por cliente no kanban (Épica 14).
- Esteiras paralelas de Ressarcimento/Judicial com kanban próprio (Épica 14).
- Criar estágio genuinamente novo sem migration (precisaria da Abordagem A descartada na seção 2).
