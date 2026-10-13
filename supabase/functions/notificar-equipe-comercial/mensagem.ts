// Regras puras do aviso "Enviar para equipe comercial" (sem Deno/Supabase),
// para poderem ser testadas no vitest do front.

export interface ClienteAviso {
  id: string;
  empresa: string;
  cnpj?: string | null;
  nome_contato?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

/** Número em formato Z-API (55 + DDD + número) ou null se inválido. */
export function normalizarTelefoneBR(raw: string | null | undefined): string | null {
  const digitos = String(raw ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

export function montarTextoAviso(params: {
  cliente: ClienteAviso;
  remetente: string;
  observacao?: string | null;
  link?: string | null;
}): string {
  const { cliente, remetente, observacao, link } = params;
  const linhas = [
    `*Cliente enviado para a equipe comercial*`,
    `${cliente.empresa}${cliente.cnpj ? ` · CNPJ ${cliente.cnpj}` : ""}`,
    `Etapa: Triagem · enviado por ${remetente}`,
  ];
  const contato = [cliente.nome_contato, cliente.whatsapp, cliente.email].filter(Boolean).join(" · ");
  if (contato) linhas.push(`Contato: ${contato}`);
  if (observacao?.trim()) linhas.push("", `Observação: ${observacao.trim()}`);
  if (link) linhas.push("", link);
  return linhas.join("\n");
}

export function montarAssuntoAviso(cliente: ClienteAviso): string {
  return `Cliente da Triagem para a equipe comercial · ${cliente.empresa}`;
}

const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Corpo HTML simples do e-mail (mesmo conteúdo do WhatsApp). */
export function montarHtmlAviso(texto: string): string {
  const corpo = escaparHtml(texto.replace(/\*/g, ""))
    .split("\n")
    .map((linha) => (linha ? `<p style="margin:0 0 6px">${linha}</p>` : "<br/>"))
    .join("");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">${corpo}</div>`;
}
