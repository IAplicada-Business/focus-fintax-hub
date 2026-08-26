# Tela de atendimento + bot SDR (Step 11)

**Data:** 2026-08-26
**Blueprint:** Step 11
**Depende de:** infra n8n + Z-API (Step 10), `normalizar_whatsapp` (Step 15)

## Problema

Hoje o time responde lead pelo celular. Não há histórico no sistema, e o bot SDR
do Step 11 não teria onde ler nem escrever.

## Escopo desta fatia

Atendimento humano completo (receber, ver, responder pelo sistema) **mais o ponto
de ramificação do bot, desligado**. O prompt do robô é configurado depois.

O bot entra inerte de propósito, mesmo princípio do trigger do Step 12a, que não
faz nada enquanto o vault está vazio.

## A identidade da conversa é o telefone

Decisão central, e os dados a confirmaram. Três telefones são compartilhados por
27 leads:

| Telefone | Leads |
|---|---|
| 5531990643023 | 15 (Cimed ×6, Your Solutions ×6, PSA ×2, LSX) |
| 5511950566101 | 8 |
| 5522981143032 | 4 (Alves e bernaca — 4 registros da mesma empresa) |

Não são empresas diferentes com o mesmo número: são **registros duplicados de
lead**. Chavear a conversa por `lead_id` fragmentaria em quatro a conversa de uma
única pessoa. Chaveando por telefone, abrir qualquer um dos quatro registros
mostra a mesma conversa — que é o comportamento correto.

O mesmo vale na conversão: o lead vira cliente e a conversa continua, porque o
número não muda.

`lead_id` e `cliente_id` ficam como vínculos resolvidos no momento da mensagem,
não como chave.

## Banco

### `atendimento_mensagens`

```sql
id uuid pk,
telefone text not null,                    -- normalizar_whatsapp, é a chave da conversa
lead_id uuid references leads(id) on delete set null,
cliente_id uuid references clientes(id) on delete set null,
direcao text not null check (direcao in ('entrada','saida')),
texto text,
tipo text not null default 'texto'
  check (tipo in ('texto','imagem','audio','documento','outro')),
midia_url text,
zapi_message_id text,
status text not null default 'recebida'
  check (status in ('recebida','pendente','enviada','falha')),
autor_id uuid references auth.users(id) on delete set null,
erro text,
criado_em timestamptz not null default now()
```

Índice único parcial em `zapi_message_id` (onde não nulo): **o webhook da Z-API
repete**, e sem isso a conversa duplica.

Índice em `(telefone, criado_em)` — é como a UI lê.

### `atendimento_conversas`

```sql
telefone text primary key,
bot_ativo boolean not null default false,
assumido_por uuid references auth.users(id),
assumido_em timestamptz,
atualizado_em timestamptz not null default now()
```

Uma linha por telefone. `bot_ativo` default **false**: o robô não fala com
ninguém até alguém ligar explicitamente.

### Envio: outbox, não chamada direta

O token da Z-API não pode ir ao browser. Em vez de edge function nova, reusa o
padrão do Step 12a:

```
UI insere mensagem status='pendente'
  → trigger AFTER INSERT (statement) → net.http_post → n8n
  → n8n envia pela Z-API
  → PATCH status 'enviada' + zapi_message_id, ou 'falha' + erro
```

Ganha outbox de graça: mensagem que falhou fica `falha` na tela em vez de sumir.
O trigger dispara só em `direcao='saida' AND status='pendente'`, e — como no Step
12a — **nunca pode derrubar o INSERT**: corpo inteiro sob `EXCEPTION WHEN OTHERS`.

### RPC de resolução

`atendimento_resolver_contato(p_telefone text)` → devolve `lead_id` e
`cliente_id` para o telefone. Com telefone duplicado escolhe o lead **mais
avançado no funil**, e em empate o mais recente — é o registro que o time está
trabalhando de fato.

## Fluxos n8n

**`atendimento-receber`** — gatilho é a Z-API:

```
Webhook (on-message-received) → valida token
  → normaliza telefone; extrai texto, tipo, mídia, zapi_message_id
  → resolve lead/cliente (RPC)
  → INSERT direcao='entrada'   (idempotente por zapi_message_id)
  → bot_ativo E não assumido? ──► [seam do bot — vazio nesta fatia]
                            └──► fim (a UI atualiza por realtime)
```

**`atendimento-enviar`** — gatilho é o nosso banco:

```
Webhook (trigger pg_net) → valida token
  → Z-API send-text
  → PATCH status 'enviada' | 'falha'
```

Dois fluxos, e não um, porque têm gatilhos e direções diferentes. O bot não vira
um terceiro fluxo agora: construir o robô antes do prompt existir seria trabalho
especulativo. Fica só a ramificação.

## UI

Quarta aba em `LeadSidePanel` (hoje: Dados, Diagnóstico, Histórico). O `Sheet` é
`w-[480px]` fixo; com Atendimento ativo vai para ~880px e volta ao sair.

Realtime em `atendimento_mensagens` filtrado por telefone, mesmo padrão do canal
`esteira-realtime` de `Esteira.tsx`.

Quando o telefone tem mais de um lead, a aba diz de quantos registros aquela
conversa é compartilhada — senão o time acha que está vendo conversa errada.

## Áudio e imagem

Conversa de WhatsApp tem áudio e foto. A tabela guarda `tipo` e `midia_url`; a UI
renderiza `🎤 Áudio` / `🖼️ Imagem` com link. Player embutido fica para depois —
mas mensagem que **some** da conversa seria pior que mensagem feia.

## Segurança

- Segredos (`atendimento_receber_url`, `atendimento_enviar_url` e tokens) no
  `supabase_vault`, como no Step 12a. Nada em migration.
- Ambos os webhooks validam `x-webhook-token`.
- RLS: leitura e escrita para admin/gestor/pmo/comercial — é o time comercial que
  atende. `anon` não toca.
- `autor_id` grava quem mandou cada mensagem de saída.

## Testes

- **SQL em Postgres efêmero**: idempotência do `zapi_message_id`; trigger dispara
  só em saída pendente; falha de rede não derruba o INSERT; resolução com
  telefone duplicado escolhe o lead mais avançado; conversa criada
  automaticamente na primeira mensagem.
- **Expressões n8n** validadas em Node.
- **Vitest** para a normalização/agrupamento que a UI fizer.

## Fora de escopo

- O prompt e o loop do bot (fica a ramificação).
- Atribuição de atendente, marcação de lida, busca no histórico.
- Importação de conversas anteriores.
- Player de mídia embutido.
- **Deduplicação dos leads.** 27 leads compartilham 3 telefones, e "Alves e
  bernaca" tem 4 registros da mesma empresa. É problema de dado, anterior a esta
  feature, e merece tratamento próprio.
