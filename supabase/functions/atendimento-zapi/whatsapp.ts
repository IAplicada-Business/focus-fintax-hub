// Cliente Z-API: só a chamada HTTP de envio e o parsing do payload do webhook.
// Nenhuma regra de negócio mora aqui — isso fica nas RPCs do Postgres.

function baseUrl(caminho: string) {
  const instancia = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  if (!instancia || !token) return null;
  return `https://api.z-api.io/instances/${instancia}/token/${token}/${caminho}`;
}

function headers() {
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  return {
    "Content-Type": "application/json",
    ...(clientToken ? { "Client-Token": clientToken } : {}),
  };
}

export async function enviarTexto(
  telefone: string,
  texto: string,
): Promise<{ ok: true; idExterno: string | null } | { ok: false; erro: string }> {
  const url = baseUrl("send-text");
  if (!url) return { ok: false, erro: "zapi_nao_configurado" };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ phone: telefone, message: texto }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, erro: corpo?.error ?? corpo?.message ?? `zapi_status_${r.status}` };
    }
    const idExterno = corpo?.messageId ?? corpo?.id ?? corpo?.zaapId ?? null;
    return { ok: true, idExterno };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// Z-API manda tudo no mesmo webhook: mensagem recebida, confirmação de
// entrega, status de leitura, grupo, etc. `type` é o que distingue.
export type EventoZapi = Record<string, any>;

export function tipoDoEvento(ev: EventoZapi): string {
  return String(ev?.type ?? "");
}

// Extrai texto/mídia de uma ReceivedCallback. Cobre os formatos mais comuns;
// tipos não mapeados caem em null (mensagem ignorada, não quebra o webhook).
export function conteudoDoEvento(ev: EventoZapi): {
  texto: string | null;
  tipo: "texto" | "imagem" | "audio" | "documento" | "outro";
  midiaUrl: string | null;
} | null {
  if (ev?.text?.message) {
    return { texto: ev.text.message, tipo: "texto", midiaUrl: null };
  }
  if (ev?.extendedText?.message ?? ev?.extendedText?.text) {
    return { texto: ev.extendedText.message ?? ev.extendedText.text, tipo: "texto", midiaUrl: null };
  }
  if (ev?.image?.imageUrl) {
    return { texto: ev.image.caption ?? null, tipo: "imagem", midiaUrl: ev.image.imageUrl };
  }
  if (ev?.document?.documentUrl) {
    return { texto: ev.document.caption ?? ev.document.fileName ?? null, tipo: "documento", midiaUrl: ev.document.documentUrl };
  }
  if (ev?.audio?.audioUrl) {
    return { texto: null, tipo: "audio", midiaUrl: ev.audio.audioUrl };
  }
  if (ev?.ptt?.pttUrl ?? ev?.ptt?.audioUrl) {
    return { texto: null, tipo: "audio", midiaUrl: ev.ptt.pttUrl ?? ev.ptt.audioUrl };
  }
  return null;
}

async function zapiPost(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; idExterno: string | null } | { ok: false; erro: string }> {
  const url = baseUrl(path);
  if (!url) return { ok: false, erro: "zapi_nao_configurado" };

  try {
    const r = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, erro: corpo?.error ?? corpo?.message ?? `zapi_status_${r.status}` };
    }
    const idExterno = corpo?.messageId ?? corpo?.id ?? corpo?.zaapId ?? null;
    return { ok: true, idExterno };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Extensão (sem ponto) a partir da URL; 'bin' se não der pra inferir. */
function extensaoDaUrl(url: string): string {
  try {
    const caminho = new URL(url).pathname;
    const nome = caminho.split("/").pop() || "";
    const ext = nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "";
    return ext && ext.length <= 5 ? ext : "bin";
  } catch {
    return "bin";
  }
}

/**
 * Envia mídia (imagem/áudio/documento/outro) via Z-API. Mesmos endpoints
 * usados em produção no projeto bz-advocacia (supabase/functions/_shared/zapi.ts):
 *   - send-image      para tipo 'imagem'
 *   - send-audio      para tipo 'audio' (waveform:true — vira nota de voz)
 *   - send-document/<ext> para 'documento'/'outro'
 *
 * `midiaUrl` é a signed URL já gravada em atendimento_mensagens.midia_url —
 * a Z-API busca o arquivo nessa URL, não recebemos o binário aqui.
 */
export async function enviarMidia(
  telefone: string,
  tipo: string,
  midiaUrl: string,
  legenda?: string | null,
): Promise<{ ok: true; idExterno: string | null } | { ok: false; erro: string }> {
  const caption = legenda?.trim() ? legenda.trim() : undefined;

  if (tipo === "imagem") {
    return zapiPost("send-image", { phone: telefone, image: midiaUrl, ...(caption ? { caption } : {}) });
  }
  if (tipo === "audio") {
    return zapiPost("send-audio", { phone: telefone, audio: midiaUrl, waveform: true });
  }
  // 'documento' e 'outro' (qualquer anexo não mapeado) saem como documento.
  const ext = extensaoDaUrl(midiaUrl);
  return zapiPost(`send-document/${ext}`, { phone: telefone, document: midiaUrl, ...(caption ? { fileName: caption } : {}) });
}

// O `id` da mensagem varia de campo conforme o tipo de evento.
export function idExternoDoEvento(ev: EventoZapi): string | null {
  return ev?.messageId ?? ev?.id ?? ev?.zaapId ?? null;
}

export function telefoneDoEvento(ev: EventoZapi): string | null {
  return ev?.phone ?? ev?.chatId ?? null;
}

// --- lid: a Z-API às vezes entrega o telefone como um identificador interno
// (`<dígitos>@lid`) em vez do número de verdade — tipicamente na primeira
// mensagem de um contato novo, antes do "match" ficar pronto do lado deles.
// Sem resolver isso a conversa duplica (uma linha pelo telefone real quando
// aparecer depois, outra presa no lid). Mesmo padrão em produção no projeto
// bz-advocacia (`_shared/zapi.ts`).

export function ehSufixoLid(v: unknown): boolean {
  return /@lid$/i.test(String(v ?? "").trim());
}

export function pareceTelefone(d: string): boolean {
  return /^55\d{10,11}$/.test(d) || /^\d{10,11}$/.test(d);
}

function digitosDoLid(lid: string): string {
  return lid.replace(/\D/g, "");
}

/**
 * "Telefone" sintético usado só quando o lid não resolve pra nenhum telefone
 * real. `atendimento_conversas.telefone` é PRIMARY KEY (texto) — isso permite
 * manter a conversa (sem ela, a mensagem simplesmente não teria onde morar)
 * sem inventar um número de WhatsApp que não existe. Reconciliada depois por
 * atendimento_reconciliar_lid quando o telefone real aparecer.
 */
export function telefoneSinteticoDoLid(lid: string): string {
  return `lid:${digitosDoLid(lid)}`;
}

/**
 * Pergunta à Z-API o telefone por trás de um lid. Best-effort: tenta vários
 * endpoints de metadados (nem toda conta/versão da Z-API responde todos) e
 * devolve o primeiro telefone plausível. Nunca lança — null se não achar.
 */
export async function zapiTelefoneDoLid(lid: string): Promise<string | null> {
  const lidDigits = digitosDoLid(lid);
  const chave = encodeURIComponent(lid);
  const chaveDigits = encodeURIComponent(lidDigits);
  const caminhos = [
    `chats/${chave}`,
    `chats/${chaveDigits}`,
    `contacts/${chave}`,
    `contacts/${chaveDigits}`,
    `phone-from-lid/${chaveDigits}`,
  ];
  const campos = ["phone", "number", "wid", "id", "participantPhone", "senderPhone", "user"];

  for (const caminho of caminhos) {
    const url = baseUrl(caminho);
    if (!url) return null; // Z-API não configurada; não adianta tentar os outros caminhos

    try {
      const r = await fetch(url, { headers: headers() });
      if (!r.ok) continue;
      const raw = await r.json().catch(() => null);
      const alvos = Array.isArray(raw) ? raw : [raw];
      for (const alvo of alvos) {
        if (!alvo || typeof alvo !== "object") continue;
        for (const campo of campos) {
          const bruto = (alvo as Record<string, unknown>)[campo];
          if (typeof bruto !== "string") continue;
          const digits = bruto.replace(/\D/g, "");
          if (!pareceTelefone(digits)) continue;
          if (digits === lidDigits) continue; // é o próprio lid, não resolveu nada
          return digits;
        }
      }
    } catch (e) {
      console.error(`zapiTelefoneDoLid falhou em ${caminho}:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/**
 * Apaga para todos uma mensagem enviada por nós. Sem janela de tempo (ao
 * contrário de editar) — a Z-API aceita apagar mensagens mais antigas.
 * Mesmo contrato já testado em produção no bz-advocacia (`_shared/zapi.ts`).
 */
export async function apagarMensagem(
  telefone: string,
  messageId: string,
): Promise<{ ok: boolean; status: number; raw: unknown }> {
  const params = new URLSearchParams({ phone: telefone, messageId, owner: "true" });
  const url = baseUrl(`messages?${params.toString()}`);
  if (!url) return { ok: false, status: 0, raw: { error: "zapi_nao_configurado" } };

  try {
    const resp = await fetch(url, { method: "DELETE", headers: headers() });
    const raw = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, raw };
  } catch (e) {
    return { ok: false, status: 0, raw: { error: e instanceof Error ? e.message : String(e) } };
  }
}
