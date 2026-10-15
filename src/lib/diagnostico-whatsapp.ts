/**
 * Diagnóstico do lead enviado pelo WhatsApp.
 *
 * A mensagem REAL é montada no banco (diagnostico_mensagem_whatsapp, migration
 * 20261016160000_diagnostico_unico_whatsapp.sql), porque o envio automático
 * acontece no submit da LP/calculadora, sem front. Esta cópia existe só para
 * pré-visualizar na tela e para o teste travar o texto: as duas precisam ficar
 * idênticas — mudou uma, mude a outra.
 */

/** Número do WhatsApp comercial usado se app_config não responder (o mesmo do public/lp.html). */
export const WHATSAPP_COMERCIAL_PADRAO = "5521988946055";

/** Espelho do initcap do Postgres: maiúscula no início de cada "palavra" alfanumérica. */
function initcap(s: string): string {
  return s.toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());
}

export function montarMensagemDiagnostico(nome: string | null | undefined, empresa: string | null | undefined, link: string): string {
  const nomeLimpo = (nome ?? "").trim();
  const primeiro = initcap(nomeLimpo.split(/\s+/)[0] ?? "");
  let emp = (empresa ?? "").trim();
  // A calculadora grava o nome da pessoa como empresa; "da Maria Silva" soaria errado.
  if (emp.toLowerCase() === nomeLimpo.toLowerCase()) emp = "";

  const saudacao = primeiro ? `Olá, ${primeiro} ✱` : "Olá ✱";
  const pronto = emp
    ? `Aqui é do Grupo AGF. Seu diagnóstico tributário da ${emp} está pronto:`
    : "Aqui é do Grupo AGF. Seu diagnóstico tributário está pronto:";

  return (
    `${saudacao}\n\n` +
    `${pronto}\n` +
    `${link}\n\n` +
    "Nele você vê as teses identificadas e a estimativa de crédito a recuperar.\n\n" +
    "Quer entender os próximos passos? É só responder esta mensagem 🤓"
  );
}

/** Resposta de enviar_diagnostico_whatsapp. */
export interface EnvioDiagnosticoResultado {
  ok?: boolean;
  erro?: string;
  mensagem_id?: string | null;
  telefone?: string;
  link?: string;
}

const ERROS_ENVIO: Record<string, string> = {
  sem_whatsapp: "O lead não tem WhatsApp cadastrado.",
  telefone_invalido: "O WhatsApp do lead não parece um número válido. Corrija na aba Dados.",
  sem_diagnostico: "Gere o diagnóstico antes de enviar.",
  app_public_url_nao_configurado:
    "Falta configurar o endereço público do sistema (app_config.app_public_url) para montar o link. Fale com o admin.",
  ja_enviado_24h: "Este link já foi enviado para este WhatsApp nas últimas 24 horas.",
  registro_falhou: "Não foi possível colocar a mensagem na fila do Atendimento.",
  lead_nao_encontrado: "Lead não encontrado.",
};

export function mensagemErroEnvio(codigo: string | undefined | null): string {
  if (!codigo) return "Não foi possível enviar o diagnóstico.";
  return ERROS_ENVIO[codigo] ?? `Não foi possível enviar o diagnóstico (${codigo}).`;
}

/** Link wa.me com texto opcional. Só dígitos no número. */
export function linkWhatsapp(numero: string, texto?: string): string {
  const n = numero.replace(/\D/g, "") || WHATSAPP_COMERCIAL_PADRAO;
  return texto ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/${n}`;
}
