# CRM Atendimento — upgrade de mídia e padrão 3 colunas

Branch: `feature/crm-atendimento-upgrade` (worktree isolado). Projeto: **focus-fintax-hub**.
Supabase: `qzkqrhamqtchboxtwpnz` ("focus-fintax-hub"), confirmado via `list_projects` do MCP
Supabase e cruzado com `VITE_SUPABASE_PROJECT_ID` do `.env` — **bate 100%**.

## Achado importante antes de começar: o fluxo já não depende mais de n8n

O brief desta tarefa descrevia o envio de mensagem como "INSERT com status pendente +
n8n escutando e mandando pra Z-API". Isso **era** verdade, mas deixou de ser: o commit
`c069395` ("Substituir n8n por Edge Function para transporte Z-API do atendimento"),
já na `main` antes deste branch existir, substituiu os dois workflows n8n por uma
Edge Function única em `supabase/functions/atendimento-zapi/` com duas rotas:

- `POST /atendimento-zapi/webhook` — recebe o webhook da Z-API (mensagem entrando).
- `POST /atendimento-zapi/enviar` — chamada pelo trigger de banco `atendimento_disparar_envio`
  (via `pg_net.http_post`, URL guardada em `vault.decrypted_secrets` como `atendimento_enviar_url`),
  fala com a Z-API e atualiza o `status` da mensagem.

Ou seja: **a dependência externa que faltava mídia não é mais o n8n — é esta Edge
Function, que já está neste repo.** Por isso este trabalho estendeu o lado do banco
E o lado do transporte (a função), não só a UI. Isso é mais abrangente do que o
brief original previa, e está sinalizado abaixo como algo que precisa de validação
humana antes de ir ao ar (ver "O que falta para ir ao ar").

## O que foi implementado

### 1. Composer com anexo e áudio (`src/components/pipeline/AtendimentoTab.tsx`)
- Botão de anexo (clipe) abre um `<input type="file">` oculto, aceitando imagem,
  áudio, PDF e Office (`accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"`).
- Botão de microfone grava com `MediaRecorder`, preferindo `audio/ogg;codecs=opus` /
  `audio/webm;codecs=opus`; quando o navegador não suporta nenhum dos dois, converte
  pra WAV via `AudioContext.decodeAudioData` + encoder PCM manual — mesma lógica já em
  produção no projeto **bz-advocacia** (`src/components/leads/ConversaBot.tsx`), reusada
  aqui porque já é código testado em WhatsApp real.
- Ao enviar com anexo: sobe o arquivo pro bucket `atendimento-midia`, gera uma signed
  URL, e faz o **mesmo INSERT que já existia pro texto** — `tipo` e `midia_url`
  preenchidos, `status: 'pendente'`. Nenhuma lógica de envio nova no cliente.
- Mensagens recebidas/enviadas do tipo `imagem` agora mostram thumbnail inline (clicável
  pra abrir em tamanho real) e `audio` mostra um player `<audio controls>`; `documento`/
  `outro` continuam com o ícone + link "abrir" que já existia.
- **Não removido**: o switch "Robô SDR nesta conversa" continua exatamente como estava.

### 2. Transporte de mídia (Edge Function `supabase/functions/atendimento-zapi/`)
- `whatsapp.ts`: nova função `enviarMidia(telefone, tipo, midiaUrl, legenda)`, usando os
  mesmos endpoints Z-API já validados em produção no bz-advocacia
  (`supabase/functions/_shared/zapi.ts` de lá): `send-image`, `send-audio` (com
  `waveform: true`, vira nota de voz) e `send-document/<extensão>` para documento/outro.
- `index.ts`: a rota `/enviar` agora aceita `tipo`/`midia_url` no payload (além de
  `texto`, que já existia) e decide entre `enviarTexto` e `enviarMidia`. **100%
  retrocompatível**: se `midia_url` não vier no payload (comportamento antigo), o
  caminho é idêntico ao de antes — nenhuma mudança de comportamento pra mensagem de texto.

### 3. Trigger de banco repassa mídia (migration `20261009091000_atendimento_envio_midia.sql`)
- `atendimento_disparar_envio()` (o trigger que dispara o POST pro transporte) agora
  inclui `tipo` e `midia_url` no corpo do `net.http_post`, além de `texto`. Antes esses
  dois campos existiam na tabela e na RPC de leitura, mas o trigger nunca os repassava —
  por isso um anexo gravava certo no banco mas saía como mensagem vazia na Z-API.
- Mantém **exatamente** a mesma lógica de espaçamento de lote (`pg_sleep(1.5)` a partir
  da 2ª mensagem pendente) da migration anterior (`20261007180000`). `CREATE OR REPLACE`
  puro — não altera a trigger em si, só o corpo da função.

### 4. Bucket de mídia (migration `20261009090000_atendimento_midia_bucket.sql`)
- Cria `atendimento-midia`: **privado**, 15 MB de limite (abaixo do limite de 16 MB da
  Z-API/WhatsApp), `allowed_mime_types` cobrindo imagem, áudio (ogg/webm/wav/mpeg/mp4),
  PDF e Office.
- Políticas de `storage.objects` (SELECT/INSERT para os 6 papéis que já leem/escrevem
  `atendimento_mensagens` desde a migration `20260826170000`: `admin`, `gestor_tributario`,
  `pmo`, `comercial`, `gestor_comercial`, `sdr`; DELETE restrito a `admin`/`gestor_tributario`/
  `pmo`, espelhando o bucket `cliente-documentos` já existente).
- **Nenhuma coluna nova**: `atendimento_mensagens.tipo`/`midia_url` já existiam desde o
  Step 11 (migration `20260826170000`) — só faltava onde guardar o arquivo.

### 5. Painel lateral — "Contexto"/"Histórico" (`src/components/atendimento/AtendimentoLeadPanel.tsx`)
- Abas **Dados** e **Diagnóstico** mantidas, nada removido.
- Nova aba **Histórico**: mostra data de criação do lead, quando a conversa foi assumida
  (se houver), e o aviso de leads compartilhando o número (já existia solto, agora
  também aparece aqui). É deliberadamente enxuta: a conversa de WhatsApp é **uma só por
  telefone** neste schema (`atendimento_conversas.telefone` é PK — decisão registrada na
  migration `20260826170000`), então não existe "histórico de atendimentos anteriores"
  como lista de conversas passadas — o histórico de mensagens já é a própria janela de
  chat ao centro. A aba Histórico documenta isso em vez de fingir uma lista que não existe.
- Bloco fixo **"Este atendimento"**, sempre visível (inclusive sem lead vinculado):
  - **Status**: derivado (não é campo novo) de `bot_ativo` + direção da última mensagem —
    "Robô respondendo" / "Aguardando resposta" / "Respondido".
  - **Canal**: "WhatsApp" (fixo, é o único canal deste atendimento).
  - **Registros vinculados**: reaproveita `leads_compartilhando`, que a RPC
    `atendimento_conversa` já devolvia. *Decisão importante*: o brief original falava em
    "conversas abertas com esse mesmo WhatsApp" no plural, mas neste schema só existe
    **uma** conversa por telefone — o que pode existir em múltiplos registros são *leads*
    compartilhando o número (típico de duplicata de cadastro). Por isso o campo mostra
    quantos registros de lead apontam pro mesmo telefone, não "conversas abertas" — seria
    enganoso inventar uma contagem que o modelo de dados não suporta.
  - **Responsável**: usa `atendimento_conversas.assumido_por`/`assumido_em`, que **já
    existiam no schema** (migration `20260826170000`) mas não eram lidos em lugar nenhum
    da UI. Acrescentado botão **Assumir atendimento** / **Liberar atendimento** (grava
    direto na tabela, reusando a policy de UPDATE já existente — nenhuma RLS nova).
- **"Lead vinculado"**: o que já era o link solto "Abrir no pipeline" virou um card
  explícito (empresa, nome, estágio, score) com o link dentro — a entidade de negócio
  vinculada agora é visualmente um bloco, não só uma linha de texto.

### 6. Filtros (`src/pages/Atendimento.tsx`)
- Toggle **Todas/Robô/Humano** mantido — é a distinção bot/humano do domínio, pedida
  explicitamente pra não remover.
- Novo filtro por **status da conversa** (Todos/Aguardando resposta/Respondido) — reusa
  `ultima_direcao`, que o `atendimentoService` já buscava; nenhuma query nova.
- Novo filtro por **responsável**: lista só quem já assumiu alguma conversa (evita
  oferecer nomes sem nada pra filtrar) + opção "Sem responsável". Alimentado pelo mesmo
  `assumido_por` acrescentado ao `listConversasInbox` (um `SELECT` extra em `profiles`
  pra resolver nome, feito uma vez e cacheado em memória por render).

## Arquivos tocados

```
src/components/pipeline/AtendimentoTab.tsx          composer: anexo + áudio + render de mídia
src/components/atendimento/AtendimentoLeadPanel.tsx  bloco "Este atendimento" + aba Histórico + card Lead vinculado
src/pages/Atendimento.tsx                            filtros de status/responsável
src/services/atendimentoService.ts                   assumido_por/nome no inbox + assumirAtendimento/liberarAtendimento
supabase/functions/atendimento-zapi/whatsapp.ts       enviarMidia() (send-image/send-audio/send-document)
supabase/functions/atendimento-zapi/index.ts          rota /enviar aceita tipo/midia_url
supabase/migrations/20261009090000_atendimento_midia_bucket.sql   bucket atendimento-midia (novo)
supabase/migrations/20261009091000_atendimento_envio_midia.sql    trigger repassa tipo/midia_url (novo)
CRM_UPGRADE_NOTES.md                                  este arquivo
```

## SQL das migrations (resumo — arquivos completos em `supabase/migrations/`)

**`20261009090000_atendimento_midia_bucket.sql`** — cria o bucket `atendimento-midia`
(privado, 15 MB, mime types de imagem/áudio/PDF/Office) e 3 policies em
`storage.objects` (SELECT/INSERT para os 6 papéis do atendimento, DELETE só pra
admin/gestor_tributario/pmo).

**`20261009091000_atendimento_envio_midia.sql`** — `CREATE OR REPLACE FUNCTION
atendimento_disparar_envio()`, igual à versão da migration `20261007180000` (mesmo
espaçamento de lote), só que o `jsonb_build_object` do `net.http_post` ganha `'tipo',
r.tipo` e `'midia_url', r.midia_url`.

Nenhuma migration altera ou remove coluna, tabela, policy ou trigger existente — ambas
são estritamente aditivas (bucket novo; função substituída via `CREATE OR REPLACE`,
trigger já apontava pra ela e continua apontando).

## Decisões e trade-offs — alguns precisam de validação humana

1. **Migrations preparadas, não aplicadas.** Os dois arquivos em `supabase/migrations/`
   não foram rodados contra o banco `qzkqrhamqtchboxtwpnz` nem a Edge Function foi
   deployada — isso fica para quando o branch for revisado e integrado, via
   `supabase db push` (migrations) e `supabase functions deploy atendimento-zapi`
   (função). Optei por isso porque a tarefa pediu só commit, sem merge/push, e alterar
   infraestrutura de produção (ainda mais uma função que hoje manda mensagem de texto
   real pro WhatsApp de clientes) antes de revisão humana pareceu o lado errado pra errar.
   **Ambas as mudanças são seguras de aplicar em qualquer ordem** (o trigger manda campos
   novos que uma função antiga simplesmente ignora; a função nova trata payload antigo
   sem `midia_url` exatamente como sempre tratou) — mas ninguém mandou mídia de verdade
   até isso ser deployado.

2. **Signed URL de 5 anos.** `atendimento_mensagens.midia_url` é permanente (é o que a
   tela usa pra sempre exibir aquele anexo, e o que a Z-API busca no momento do envio).
   Uma signed URL "normal" expira em minutos/horas — inútil aqui. A saída foi gerar a
   signed URL com `expiresIn` de 5 anos (`createSignedUrl` aceita valores grandes).
   **Trade-off real**: não é mais "verdadeiramente" revogável no curto prazo — quem tiver
   o link guardado acessa até o vencimento, mesmo que percam acesso à conta depois.
   Pra ter um link de fato revogável seria preciso guardar o **caminho** no storage (não
   a URL assinada) numa coluna nova e gerar a signed URL sob demanda a cada leitura — o
   que pede uma coluna que o schema atual não tem. Decisão a validar: 5 anos é aceitável
   pro caso de uso (CRM interno, não link público), ou vale a pena abrir uma migration
   pra coluna `midia_path` no futuro?

3. **"Conversas abertas" virou "Registros vinculados".** Ver seção 5 acima — o schema
   modela uma conversa por telefone (decisão deliberada da migration `20260826170000`,
   não uma limitação acidental). Resolvi reaproveitar `leads_compartilhando` em vez de
   inventar uma contagem de "conversas abertas" que não existe no modelo. Se a chefe
   quiser literalmente "conversas abertas" como conceito (ex: múltiplos atendimentos
   simultâneos por outros canais), isso é desenho de schema novo, fora do escopo aditivo
   desta tarefa.

4. **Z-API: endpoints de mídia não testados contra a conta de produção deste projeto.**
   `send-image`, `send-audio` (`waveform: true`) e `send-document/<ext>` são os mesmos
   endpoints em produção real no bz-advocacia (outra conta Z-API, mesmo fornecedor) — alta
   confiança de que o formato do payload está certo, mas **não foram testados contra a
   instância Z-API do focus-fintax-hub**, porque isso exige mandar mensagem de WhatsApp de
   verdade. Validar no roteiro de teste abaixo antes de confiar no fluxo.

5. **Papéis de storage.** Copiei a régua de `has_role` de quem já lê/escreve
   `atendimento_mensagens` (6 papéis) pro bucket novo. Se o time quiser restringir
   quem sobe anexo (ex: só comercial/sdr, não pmo/gestor_tributario), é mudar a policy de
   INSERT — fácil, mas decisão de produto, não técnica.

## Roteiro de teste manual (depois de aplicar as migrations e deployar a função)

1. **Aplicar o lado do banco**: `supabase db push` (ou aplicar os 2 arquivos de
   `supabase/migrations/` manualmente) e `supabase functions deploy atendimento-zapi`.
   Confirmar que `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` (secrets da função,
   já devem estar configurados desde o commit `c069395`) continuam válidos — a mídia usa
   os mesmos.
2. **Texto continua funcionando**: abra uma conversa, mande uma mensagem de texto normal,
   confirme que aparece como "enviando" e depois sem esse rótulo (status `enviada`) e que
   chega de fato no WhatsApp do destinatário. Isso valida que a mudança no trigger/função
   não quebrou o caminho que já funcionava.
3. **Anexar imagem**: clique no clipe, escolha uma foto, confirme a prévia no composer,
   envie. Confira: (a) a bolha aparece com "enviando" e depois sem esse rótulo; (b) a
   thumbnail renderiza na tela; (c) **confirme com quem administra a Z-API** que a imagem
   chegou de fato no WhatsApp do destinatário (o lado do app só garante até a chamada
   pra Z-API — a entrega final depende da instância Z-API estar saudável).
4. **Gravar áudio**: clique no microfone, fale alguns segundos, clique em parar. Confira
   que o preview toca no composer antes de enviar, envie, e confirme no celular de teste
   que chegou como nota de voz tocável (não como arquivo pra baixar — se chegar como
   arquivo, o formato/extensão escolhido não é o que a Z-API espera e vale revisar
   `escolherFormatoAudio`/`converterParaWav` em `AtendimentoTab.tsx`).
5. **Anexar documento (PDF)**: igual ao passo 3, confirme que chega como documento
   anexado (não como link de texto) no WhatsApp.
6. **Arquivo grande demais**: tente anexar um arquivo acima de 15 MB — a UI deve recusar
   antes de subir, com toast de erro.
7. **Responsável**: abra uma conversa, clique "Assumir atendimento", confirme que o bloco
   "Este atendimento" passa a mostrar seu nome e que o filtro "Responsável" na lista
   passa a oferecer seu nome como opção. Clique "Liberar atendimento" e confirme que volta
   pra "Sem responsável".
8. **Filtro de status**: confirme que uma conversa cuja última mensagem foi do lead
   aparece em "Aguardando resposta", e que depois de responder ela migra pra "Respondido".
9. **Robô continua intacto**: confirme que o switch "Robô SDR nesta conversa" ainda liga/
   desliga normalmente e que responder manualmente ainda desativa o robô (comportamento
   que já existia, não deve ter mudado).
10. **Diagnóstico intacto**: confirme que a aba Diagnóstico ainda mostra potencial
    estimado e progress bars por tese pra um lead com relatório gerado.

## Rodado neste worktree

- `bun install` — ok.
- `bunx tsc --noEmit -p tsconfig.app.json` — mesmos 20 erros pré-existentes de antes
  desta mudança (nenhum arquivo tocado por esta tarefa aparece na lista).
- `bunx eslint <arquivos tocados>` — 0 erros (os mesmos *warnings* de `react-hooks/
  exhaustive-deps` em `Atendimento.tsx` já existiam antes, só mudaram de número de linha).
- `bun run build` — build de produção completo sem erros.

---

# Round 2 — bug do fromMe, resolução de @lid, apagar mensagem

Mesma branch/worktree, continuação do Round 1 acima (nada do Round 1 foi desfeito).
Supabase confirmado de novo: `qzkqrhamqtchboxtwpnz` ("focus-fintax-hub"), via
`list_projects` do MCP (bate com `VITE_SUPABASE_PROJECT_ID`).

## 1. BUG CRÍTICO corrigido: mensagem mandada direto do celular (fromMe) era descartada

**Antes desta mudança**, em `webhook()` (`supabase/functions/atendimento-zapi/index.ts`):
```ts
if (ev?.fromMe) {
  return json({ ok: true, ignorado: true, motivo: "from_me" });
}
```
Toda vez que alguém do time respondia um cliente **direto do WhatsApp do celular**
(fora da tela do painel), a Z-API manda o mesmo `ReceivedCallback` com `fromMe: true`
— e o webhook simplesmente descartava. A mensagem nunca era gravada em
`atendimento_mensagens`, nunca aparecia na conversa, e pior: se o cliente respondesse
em seguida, o robô SDR podia continuar respondendo como se ninguém do time tivesse
falado nada, porque a trava `trg_bot_desliga_humano` só dispara em **INSERT** — e não
havia insert nenhum. **Perda de mensagem real, não só um detalhe de UX.**

**Investigação do schema antes de corrigir** (via `execute_sql` do MCP Supabase, contra
`information_schema.columns`/`pg_proc` do projeto): confirmado que
`atendimento_registrar_entrada` (migration `20260826200000`) sempre grava
`direcao = 'entrada'` (hardcoded no `INSERT`) e está com `EXECUTE` revogado de
`authenticated`/`anon`, só `service_role` — e que a tabela já tem os CHECKs
`direcao IN ('entrada','saida')`, `origem IN ('humano','bot')`, `status IN ('recebida',
'pendente','enviada','falha')`. Ou seja: o modelo de dados já comporta "saída, feita por
humano, já enviada" — só faltava uma função que gravasse com esses valores.

**Decisão**: `atendimento_registrar_entrada` **não foi alterada** (seria arriscado mudar
o contrato de uma função que o webhook já chama toda hora pra mensagem normal de
cliente). Em vez disso, nova RPC aditiva `atendimento_registrar_mensagem` (migration
`20261009120000_atendimento_registrar_mensagem.sql`), que recebe `direcao`/`origem`/
`status` explícitos (com validação `IN (...)` igual aos CHECKs da tabela) e serve dois
casos (ver seção 2 também): o eco fromMe (`direcao='saida'`, `origem='humano'`,
`status='enviada'` — já veio confirmado pelo WhatsApp, não é `'pendente'` porque não deve
passar pelo outbox de novo) e a conversa provisória de `@lid`.

`webhook()` agora: em vez de descartar `fromMe`, chama
`atendimento_registrar_mensagem` com esses parâmetros. Como `origem='humano'` e
`direcao='saida'`, o trigger `trg_bot_desliga_humano` (já existente, migration
`20260826210000`) dispara normalmente e desliga o robô nessa conversa — mesmo
comportamento de quando a resposta vem pelo painel.

## 2. Resolução de `@lid` (evita duplicar conversa)

**Schema**: `atendimento_conversas.telefone` é **PRIMARY KEY** (texto) — decisão
deliberada do Round 1/Step 11 pra modelar "uma conversa por telefone". Isso tornava
arriscado adicionar uma coluna `lid` solta e reescrever as várias queries que já
comparam por `telefone` (risco de regressão no que já funciona).

**Estratégia escolhida** (a que o brief já apontava como preferida pra este schema):
1. Tabela nova `atendimento_lid_map (lid TEXT PRIMARY KEY, telefone TEXT, atualizado_em)`
   — cache aprendido, só lido/escrito pelo transporte (service_role).
2. `zapiTelefoneDoLid(lid)` em `whatsapp.ts`: tenta vários endpoints de metadados da
   Z-API (`chats/<lid>`, `chats/<dígitos>`, `contacts/<lid>`, `contacts/<dígitos>`,
   `phone-from-lid/<dígitos>`), procurando um campo `phone`/`number`/`wid`/`id`/
   `participantPhone`/`senderPhone`/`user` que pareça telefone (`pareceTelefone`,
   regex `^55\d{10,11}$` ou `^\d{10,11}$`) e não seja o próprio lid. Mesmo padrão já em
   produção no bz-advocacia (`_shared/zapi.ts: zapiTelefoneDoLid`), que inspecionei
   diretamente nesse outro worktree pra copiar o contrato exato.
3. **Se resolver**: grava no cache (`upsert` em `atendimento_lid_map`) e usa o telefone
   real normalmente — passa por `atendimento_registrar_entrada`/`atendimento_registrar_
   mensagem` com normalização ligada, igual a qualquer telefone.
4. **Se não resolver**: usa um telefone **sintético** `lid:<dígitos>` (função
   `telefoneSinteticoDoLid`). Como `telefone` é só `text` (não há constraint de formato
   em `atendimento_conversas`/`atendimento_mensagens` além dos CHECKs de
   `direcao`/`tipo`/`status`/`origem`), isso funciona sem tocar o schema de PK — a
   conversa provisória vive e aparece no painel igual a qualquer outra, só sem
   lead/cliente vinculado (não bate com `normalizar_whatsapp(l.whatsapp)` de ninguém).
   **Por isso o parâmetro `p_pular_normalizacao`** na nova RPC: `normalizar_whatsapp`
   rejeitaria `lid:xxxxx` (não é 10-13 dígitos), e esse telefone sintético não é texto
   digitado por humano — é montado pelo próprio transporte, já no formato final.
5. **Reconciliação**: nova RPC `atendimento_reconciliar_lid(p_telefone_provisorio,
   p_telefone_real)` (mesma migration `20261009120000`) — quando um lid que antes não
   resolveu é resolvido depois (cache aprendido ou lookup bem-sucedido numa mensagem
   seguinte do mesmo lid), move as mensagens da conversa provisória pro telefone real
   (`UPDATE ... SET telefone = v_real`) e apaga a linha provisória de
   `atendimento_conversas` — sem duplicar. Chamada automaticamente por
   `resolverTelefone()` sempre que um lookup à Z-API tem sucesso.

**Trade-off documentado**: se o mesmo lid nunca resolver, o código tenta a Z-API de novo
a cada mensagem nova dessa conversa (não existe uma marca de "já tentei e falhou" —
só existe cache de sucesso). Em baixo volume isso é aceitável; se o lid for
persistentemente não resolvível e o volume de mensagens for alto, vale adicionar um
"último tentado em" pra não bater na Z-API toda hora. Não implementado agora por ser
otimização, não correção de bug.

**Precisa de validação humana**: a lista de endpoints/campos de `zapiTelefoneDoLid` é
best-effort (copiada do bz-advocacia, outra conta Z-API, mesmo fornecedor) — não testada
contra a instância Z-API do focus-fintax-hub. Se nenhum desses endpoints existir nesta
conta/plano Z-API, o lookup sempre falha silenciosamente e todo contato que chegar como
`@lid` vira conversa provisória permanente (não é regressão — hoje, sem nenhuma desta
mudança, o telefone bruto `@lid` já ia para `atendimento_registrar_entrada`, que o
rejeitaria com `telefone_invalido`, perdendo a mensagem do mesmo jeito. Esta mudança só
piora se nenhum endpoint funcionar E ninguém notar as conversas provisórias acumulando.)

## 3. Apagar mensagem ("apagar para todos")

- `apagarMensagem(telefone, messageId)` em `whatsapp.ts`: `DELETE .../messages?phone=
  ...&messageId=...&owner=true`, mesmo contrato testado em produção no bz-advocacia
  (`_shared/zapi.ts: zapiDeleteMessage`). Sem janela de tempo (diferente de editar).
- Nova rota `POST /atendimento-zapi/apagar`, protegida por **sessão do usuário**
  (`Authorization: Bearer <token>` + `supabase.auth.getUser()`), não pelo token
  compartilhado de `/enviar` (que é chamado pelo trigger de banco, não pelo usuário).
  **Decisão de autorização**: em vez de duplicar a lista de papéis (`admin`,
  `gestor_tributario`, `pmo`, `comercial`, `gestor_comercial`, `sdr`) numa checagem nova,
  a rota lê a mensagem com o **client do próprio usuário** — a policy de SELECT já
  existente em `atendimento_mensagens` (migration `20260826170000`) decide quem pode ver;
  se o usuário não tiver um desses papéis, a RLS devolve zero linhas e a rota responde
  `nao_encontrada`. O UPDATE final (marcar `apagada_em`) usa o client de service_role,
  igual a todo o resto do arquivo (`atendimento_mensagens` não tem policy de UPDATE —
  nunca teve, nem pra `status`/`erro` do envio normal).
- Migration `20261009100000_atendimento_apagar_mensagem.sql`: colunas aditivas
  `apagada_em timestamptz` e `texto_anterior text` (confirmado via MCP que não
  existiam — `information_schema.columns` não trazia nenhuma das duas). A mesma
  migration also estende `atendimento_conversa` (`CREATE OR REPLACE`, mesmo padrão já
  usado no Round 1 pra acrescentar `origem`) pra devolver `zapi_message_id` e
  `apagada_em` por mensagem — sem isso a tela nunca saberia quais mensagens são
  elegíveis pro botão de apagar.
- UI (`AtendimentoTab.tsx`): botão de lixeira (ícone `Trash2`, aparece no hover da bolha)
  só quando `direcao='saida' && status='enviada' && zapi_message_id && !apagada_em`.
  Confirmação via `AlertDialog` (shadcn, já existia no projeto). Mensagem apagada mostra
  "Mensagem apagada" em itálico no lugar do conteúdo (texto/mídia continuam gravados no
  banco pra auditoria — `texto_anterior` —, só a UI esconde).
- Chamada do frontend: `supabase.functions.invoke("atendimento-zapi/apagar", { body })`
  — confirmado que o SDK monta a URL concatenando o nome da função direto no path
  (`${url}/${functionName}`), então um nome com `/` sub-roteia pra dentro da mesma Edge
  Function sem precisar de `fetch` manual com `getSession()`. `invoke()` já anexa o
  token de sessão do usuário logado automaticamente, igual a todo outro
  `supabase.functions.invoke` já usado no projeto (`analyze-lead`, `manage-users` etc.).

## Arquivos tocados (Round 2)

```
supabase/functions/atendimento-zapi/index.ts   fix fromMe, resolução de lid, rota /apagar, CORS
supabase/functions/atendimento-zapi/whatsapp.ts  ehSufixoLid/pareceTelefone/zapiTelefoneDoLid/
                                                  telefoneSinteticoDoLid/apagarMensagem (novos)
src/components/pipeline/AtendimentoTab.tsx     botão apagar + AlertDialog + placeholder "apagada"
supabase/migrations/20261009100000_atendimento_apagar_mensagem.sql   (novo)
supabase/migrations/20261009110000_atendimento_lid_map.sql           (novo)
supabase/migrations/20261009120000_atendimento_registrar_mensagem.sql (novo)
CRM_UPGRADE_NOTES.md                           esta seção
```

## SQL das migrations (resumo — arquivos completos em `supabase/migrations/`)

**`20261009100000_atendimento_apagar_mensagem.sql`** — `ALTER TABLE ... ADD COLUMN IF
NOT EXISTS apagada_em timestamptz, texto_anterior text` (aditivo) + `CREATE OR REPLACE
FUNCTION atendimento_conversa` acrescentando `zapi_message_id`/`apagada_em` ao
`jsonb_build_object` de cada mensagem (mesmo formato de mudança já usado no Round 1 pra
acrescentar `origem`).

**`20261009110000_atendimento_lid_map.sql`** — tabela nova `atendimento_lid_map`, RLS
ligada, sem policy nenhuma pra `anon`/`authenticated` (acesso só via service_role,
que bypassa RLS) — mesmo padrão de "fechado por padrão" das migrations de
hardening anteriores (`20260921141050_harden_internal_views_and_rpcs.sql`).

**`20261009120000_atendimento_registrar_mensagem.sql`** — duas funções novas,
`atendimento_registrar_mensagem` (direção/origem/status explícitos + flag de pular
normalização) e `atendimento_reconciliar_lid` (move mensagens de conversa provisória
pro telefone real). Nenhuma das duas substitui ou altera `atendimento_registrar_entrada`.

Nenhuma migration altera comportamento de função/trigger/policy já em uso pelo caminho
normal de mensagem de cliente — todas são estritamente aditivas (tabela nova, colunas
novas, funções novas; a única `CREATE OR REPLACE` em função pré-existente é
`atendimento_conversa`, que só ganha dois campos novos no JSON de saída).

## Decisões e trade-offs — precisam de validação humana

1. **Migrations preparadas, NÃO aplicadas; função NÃO deployada.** Mesma escolha do
   Round 1 e pelo mesmo motivo: a tarefa pediu só commit (sem merge/push), e aplicar
   mudança de infraestrutura que mexe com mensagens reais de WhatsApp de clientes antes
   de revisão humana é o lado errado pra errar — ainda mais aqui, que inclui uma rota
   nova de **apagar mensagem de verdade no WhatsApp do cliente** (ação irreversível).
   Falta rodar `supabase db push` (as 3 migrations, em ordem) e
   `supabase functions deploy atendimento-zapi`.

2. **Estratégia de lid**: ver seção 2 acima. Resumo da decisão: cache + lookup
   best-effort na Z-API, telefone sintético `lid:<dígitos>` como fallback, reconciliação
   automática quando resolver depois. **Validar**: (a) se os endpoints de
   `zapiTelefoneDoLid` existem de fato na conta Z-API deste projeto — só se descobre
   mandando uma mensagem de um contato novo de verdade e inspecionando o payload do
   webhook (`chatId`/`phone` terminando em `@lid`) e os logs da função; (b) se o volume
   de contatos `@lid` deste projeto justifica o retry-sem-marca-de-falha, ou se vale
   adicionar uma coluna de "última tentativa" antes de ir ao ar.

3. **Fix do fromMe**: a mensagem passa a aparecer como `direcao='saida'`, `origem=
   'humano'`, sem `autor_id` (não foi ninguém logado no painel que mandou — é `NULL`,
   coluna já era nullable). A UI de hoje não distingue visualmente "mandei pelo painel"
   de "mandei pelo celular" (ambos aparecem como bolha "minha", alinhada à direita) —
   isso é intencional (é a mesma pessoa/time falando), mas se o produto quiser marcar
   visualmente a diferença (ex: um selo "via celular"), é mudança de UI pequena, não
   teria exigido nenhuma migration adicional (o dado já diferencia: `autor_id IS NULL`
   em uma mensagem `origem='humano'` só acontece nesse caso).

4. **Botão de apagar e papéis**: segui a policy de SELECT já existente (6 papéis) como
   a régua de quem pode apagar — não adicionei uma trava mais restritiva (ex: só quem
   mandou a mensagem, ou só admin/gestor). Se o time quiser restringir mais, é ajustar
   a policy de SELECT ou adicionar uma checagem extra na rota `/apagar` — decisão de
   produto, não técnica.

## Roteiro de teste manual (depois de aplicar as 3 migrations, nesta ordem, e deployar a função)

1. **fromMe**: com o celular pareado à instância Z-API de teste, mande uma mensagem
   para um número de cliente/lead **direto do WhatsApp do celular** (não pelo painel).
   Confirme: (a) ela aparece na conversa do painel como mensagem "minha" (alinhada à
   direita); (b) se o robô estava ligado nessa conversa, confirme que ele desligou
   (mesmo efeito de responder pelo painel).
2. **Lid — contato novo**: se possível, provoque uma mensagem de um contato que a Z-API
   entregue como `@lid` (geralmente contato novo/primeira mensagem). Confira nos logs da
   função (`supabase functions logs atendimento-zapi`) se apareceu "conversa provisória"
   ou se resolveu direto. Se resolveu, confirme que a conversa aparece com o telefone
   real desde o início. Se ficou provisória, confirme que uma mensagem **seguinte** do
   mesmo contato (quando a Z-API já tiver resolvido do lado dela, ou quando o cache
   tiver sido preenchido manualmente em `atendimento_lid_map`) reconcilia as mensagens
   na conversa certa (não duplica).
3. **Apagar mensagem**: envie uma mensagem de texto pelo painel pra um número de teste,
   espere ficar `enviada`, clique no ícone de lixeira que aparece ao passar o mouse,
   confirme no diálogo. Confira: (a) ela some do WhatsApp do destinatário ("Esta
   mensagem foi apagada"); (b) no painel vira "Mensagem apagada" em itálico; (c) o botão
   de apagar não aparece mais nessa mensagem; (d) tentar apagar a mesma mensagem de novo
   (via chamada direta, se quiser testar o backend) retorna `ja_apagada`.
4. **Apagar — permissão**: confirme que um usuário sem nenhum dos 6 papéis do time de
   atendimento recebe `nao_encontrada` (não `zapi_falhou` nem um erro de servidor) ao
   tentar apagar.
5. **Regressão do Round 1**: repita os itens 2-10 do roteiro de teste do Round 1 acima
   (texto, mídia, áudio, responsável, filtros, robô, diagnóstico) — nada deveria ter
   mudado de comportamento.
