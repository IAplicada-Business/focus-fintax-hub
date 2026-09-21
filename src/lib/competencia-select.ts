/**
 * Regras do seletor de competência em dois campos (mês e ano separados).
 * Mantidas fora do componente porque são puras e testáveis sem DOM.
 */

export const MESES_CURTOS = [
  { v: "01", label: "Jan" },
  { v: "02", label: "Fev" },
  { v: "03", label: "Mar" },
  { v: "04", label: "Abr" },
  { v: "05", label: "Mai" },
  { v: "06", label: "Jun" },
  { v: "07", label: "Jul" },
  { v: "08", label: "Ago" },
  { v: "09", label: "Set" },
  { v: "10", label: "Out" },
  { v: "11", label: "Nov" },
  { v: "12", label: "Dez" },
] as const;

/** Radix não aceita `value=""` em item; sentinela para a opção de limpar. */
export const LIMPAR = "__limpar__";

const ANOS_PARA_TRAS = 5;
const ANOS_PARA_FRENTE = 1;

/** Competência emitida, ou `null` quando ainda não há par mês+ano. */
export type Emissao = string | null;

/** Anos ofertados, do mais recente para o mais antigo, incluindo o selecionado. */
export function listarAnos(selecionado: number | undefined, anoCorrente: number): number[] {
  const anos = new Set<number>();
  for (let ano = anoCorrente + ANOS_PARA_FRENTE; ano >= anoCorrente - ANOS_PARA_TRAS; ano -= 1) anos.add(ano);
  if (selecionado) anos.add(selecionado);
  return [...anos].sort((a, b) => b - a);
}

/** Mês escolhido: completa com o ano à vista ou, na falta dele, com o ano corrente. */
export function aoEscolherMes(mes: string, anoVisivel: number | undefined, anoCorrente: number): Emissao {
  if (mes === LIMPAR) return "";
  return `${anoVisivel ?? anoCorrente}-${mes}`;
}

/** Ano escolhido: só vira competência quando já existe mês; senão fica pendente. */
export function aoEscolherAno(ano: string, mes: string): Emissao {
  if (ano === LIMPAR) return "";
  return mes ? `${ano}-${mes}` : null;
}
