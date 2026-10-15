// Brief de boas-vindas pós-fechamento (Lote 3C) — textos puros.
//
// CÓPIA LITERAL de src/lib/brief-cliente.ts (a fonte testada pelo vitest).
// Deno não importa de `src/` e o vitest não importa este arquivo, então a
// lógica vive lá e é replicada aqui. Mudou lá? Copie pra cá de novo.

export interface ClienteBrief {
  id?: string;
  empresa: string;
  nome_contato?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export type CanalBrief = "whatsapp" | "email";

export interface ResultadoBrief {
  /** "enviado", "sem_numero", "sem_email", "email_nao_configurado", "nao_selecionado" ou erro da API. */
  whatsapp: string;
  email: string;
}

export function primeiroNomeContato(nome: string | null | undefined, fallback = "tudo bem"): string {
  const limpo = String(nome ?? "").trim();
  if (!limpo) return fallback;
  return limpo.split(/\s+/)[0];
}

/** Número em formato Z-API (55 + DDD + número) ou null se inválido. */
export function normalizarTelefoneBR(raw: string | null | undefined): string | null {
  const digitos = String(raw ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

export function emailValido(email: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? "").trim());
}

/** Canais que fazem sentido pré-marcar no diálogo: só quem tem contato. */
export function canaisDisponiveis(cliente: ClienteBrief): CanalBrief[] {
  const canais: CanalBrief[] = [];
  if (normalizarTelefoneBR(cliente.whatsapp)) canais.push("whatsapp");
  if (emailValido(cliente.email)) canais.push("email");
  return canais;
}

export const PROXIMOS_PASSOS_BRIEF = [
  "Em até 5 dias úteis você recebe o acesso ao seu Mapa Tributário com o saldo apurado",
  "Todo mês enviamos o resumo do que foi compensado e do saldo que ainda falta",
  "Qualquer dúvida é só responder esta mensagem",
] as const;

export function montarTextoBriefWhatsapp(cliente: ClienteBrief): string {
  const nome = primeiroNomeContato(cliente.nome_contato);
  return [
    `Olá, ${nome} ✱`,
    `Seja bem-vindo ao Grupo AGF! A partir de agora a ${cliente.empresa} conta com a nossa equipe para a recuperação de créditos tributários.`,
    `Próximos passos:\n${PROXIMOS_PASSOS_BRIEF.map((p) => `• ${p}`).join("\n")}`,
    "Conte com a gente 🤓",
  ].join("\n\n");
}

export function montarAssuntoBrief(cliente: ClienteBrief): string {
  return `Bem-vindo ao Grupo AGF · ${cliente.empresa}`;
}

const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Paleta do Mapa Tributário executivo (MapaTributarioExecutivo.tsx). */
const COR = {
  preto: "#0b0b0c",
  grafite: "#161617",
  dourado: "#c9964a",
  douradoClaro: "#e2bd7c",
  creme: "#f4efe6",
  tinta: "#1b1b1c",
  tinta60: "#5f5a52",
  linhaClara: "#e4dccd",
};

/**
 * E-mail de boas-vindas com o mesmo conteúdo do WhatsApp. Tabelas e estilos
 * inline porque cliente de e-mail não respeita CSS externo nem flex.
 */
export function montarHtmlBrief(cliente: ClienteBrief): string {
  const nome = escaparHtml(primeiroNomeContato(cliente.nome_contato));
  const empresa = escaparHtml(cliente.empresa);
  const passos = PROXIMOS_PASSOS_BRIEF.map(
    (p) =>
      `<tr><td style="width:18px;vertical-align:top;color:${COR.dourado};font-weight:700;padding:4px 0">•</td><td style="padding:4px 0;color:${COR.tinta};font-size:14px;line-height:1.55">${escaparHtml(p)}</td></tr>`,
  ).join("");

  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${COR.creme}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.creme};padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${COR.linhaClara};border-radius:12px;overflow:hidden;font-family:Montserrat,'Helvetica Neue',Arial,sans-serif">
  <tr>
    <td style="background:${COR.preto};padding:28px 32px;border-bottom:3px solid ${COR.dourado}">
      <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:2px;color:${COR.douradoClaro};text-transform:uppercase">Grupo AGF</p>
      <p style="margin:6px 0 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#9a9388">Recuperação de créditos tributários</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:${COR.grafite}">Olá, ${nome} ✱</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${COR.tinta}">Seja bem-vindo ao Grupo AGF! A partir de agora a <strong>${empresa}</strong> conta com a nossa equipe para a recuperação de créditos tributários.</p>
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COR.dourado};font-weight:700">Próximos passos</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">${passos}</table>
      <p style="margin:0;font-size:14px;color:${COR.tinta}">Conte com a gente 🤓</p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px;border-top:1px solid ${COR.linhaClara};background:${COR.creme}">
      <p style="margin:0;font-size:11px;color:${COR.tinta60}">Grupo AGF · este e-mail foi enviado porque a ${empresa} formalizou contrato com a nossa equipe.</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Versão texto do e-mail (fallback pra cliente sem HTML). */
export function montarTextoEmailBrief(cliente: ClienteBrief): string {
  return montarTextoBriefWhatsapp(cliente);
}

/** Resumo legível do resultado pro toast / diálogo. */
export function resumirEnvioBrief(r: ResultadoBrief, canais: CanalBrief[]): { titulo: string; detalhe: string; algumEnviado: boolean } {
  const itens: string[] = [];
  if (canais.includes("whatsapp")) {
    if (r.whatsapp === "enviado") itens.push("WhatsApp enviado");
    else if (r.whatsapp === "sem_numero") itens.push("cliente sem WhatsApp cadastrado");
    else itens.push(`WhatsApp falhou (${r.whatsapp})`);
  }
  if (canais.includes("email")) {
    if (r.email === "enviado") itens.push("e-mail enviado");
    else if (r.email === "sem_email") itens.push("cliente sem e-mail cadastrado");
    else if (r.email === "email_nao_configurado") itens.push("e-mail ainda não configurado no servidor");
    else itens.push(`e-mail falhou (${r.email})`);
  }
  const algumEnviado = r.whatsapp === "enviado" || r.email === "enviado";
  return {
    titulo: algumEnviado ? "Boas-vindas enviadas ao cliente" : "Nenhum canal conseguiu enviar",
    detalhe: itens.join(" · "),
    algumEnviado,
  };
}
