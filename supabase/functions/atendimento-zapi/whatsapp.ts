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

// O `id` da mensagem varia de campo conforme o tipo de evento.
export function idExternoDoEvento(ev: EventoZapi): string | null {
  return ev?.messageId ?? ev?.id ?? ev?.zaapId ?? null;
}

export function telefoneDoEvento(ev: EventoZapi): string | null {
  return ev?.phone ?? ev?.chatId ?? null;
}
