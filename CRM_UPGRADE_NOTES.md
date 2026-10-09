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
