/**
 * Geração de senha inicial/temporária para a Gestão de Usuários.
 *
 * Sem caracteres ambíguos (I, l, 1, O, 0) porque a senha é ditada ou colada
 * num WhatsApp antes do usuário trocar.
 */

export const SENHA_MIN = 6;

const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const DIGITOS = "23456789";
const SIMBOLOS = "!@#$%&*?";

const TODOS = MAIUSCULAS + MINUSCULAS + DIGITOS + SIMBOLOS;

/** Inteiros aleatórios com `crypto` quando existe; `Math.random` é só o fallback. */
function aleatorios(quantidade: number): number[] {
  const cripto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cripto?.getRandomValues) {
    const buf = new Uint32Array(quantidade);
    cripto.getRandomValues(buf);
    return Array.from(buf);
  }
  return Array.from({ length: quantidade }, () => Math.floor(Math.random() * 0xffffffff));
}

function embaralhar<T>(itens: T[]): T[] {
  const saida = [...itens];
  const r = aleatorios(saida.length);
  for (let i = saida.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

/**
 * Senha com pelo menos uma maiúscula, uma minúscula, um dígito e um símbolo.
 * Tamanho mínimo de 8 (acima do mínimo do Supabase) para não gerar senha fraca.
 */
export function gerarSenha(tamanho = 14): string {
  const total = Math.max(8, Math.floor(tamanho));
  const obrigatorios = [MAIUSCULAS, MINUSCULAS, DIGITOS, SIMBOLOS];
  const r = aleatorios(total);

  const chars = obrigatorios.map((grupo, i) => grupo[r[i] % grupo.length]);
  for (let i = obrigatorios.length; i < total; i++) {
    chars.push(TODOS[r[i] % TODOS.length]);
  }

  return embaralhar(chars).join("");
}

/** Mensagem de recusa, ou null quando a senha serve. */
export function validarSenha(senha: string): string | null {
  if (!senha) return "Informe uma senha";
  if (senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres`;
  return null;
}
