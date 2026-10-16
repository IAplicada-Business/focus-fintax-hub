/**
 * "Mensagem nova" no atendimento: a última mensagem da conversa veio do lead
 * e chegou depois da última vez que este usuário abriu a conversa (neste
 * navegador). Sem coluna no banco — a marca de leitura fica no localStorage,
 * com um `baseline` gravado na primeira visita para o histórico antigo não
 * aparecer inteiro como novo.
 */
import { phoneDigits } from "@/lib/phone-match";

export const LEITURA_STORAGE_KEY = "focus.atendimento.leitura.v1";
const EVENTO = "focus:atendimento-leitura";

export interface EstadoLeitura {
  /** ISO: mensagens anteriores a isto contam como lidas. */
  baseline: string;
  /** chave do telefone → ISO da última leitura. */
  lidas: Record<string, string>;
}

export interface ConversaLeitura {
  telefone: string;
  ultima_em: string | null;
  ultima_direcao: "entrada" | "saida" | null;
}

/** Mesma chave do índice do pipeline: últimos 11 dígitos. */
export function chaveTelefone(telefone: string | null | undefined): string {
  const d = phoneDigits(telefone);
  return d.length > 11 ? d.slice(-11) : d;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storagePadrao(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

let cache: EstadoLeitura | null = null;

export function lerEstadoLeitura(storage: StorageLike | null = storagePadrao(), agora: number = Date.now()): EstadoLeitura {
  if (cache && storage === storagePadrao()) return cache;
  let estado: EstadoLeitura | null = null;
  try {
    const raw = storage?.getItem(LEITURA_STORAGE_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<EstadoLeitura>) : null;
    if (p && typeof p.baseline === "string") {
      estado = { baseline: p.baseline, lidas: p.lidas && typeof p.lidas === "object" ? p.lidas : {} };
    }
  } catch {
    /* JSON inválido: recomeça */
  }
  if (!estado) {
    estado = { baseline: new Date(agora).toISOString(), lidas: {} };
    try {
      storage?.setItem(LEITURA_STORAGE_KEY, JSON.stringify(estado));
    } catch {
      /* storage indisponível: vale só nesta sessão */
    }
  }
  if (storage === storagePadrao()) cache = estado;
  return estado;
}

export function conversaNaoLida(c: ConversaLeitura, estado: EstadoLeitura): boolean {
  if (c.ultima_direcao !== "entrada" || !c.ultima_em) return false;
  const lida = estado.lidas[chaveTelefone(c.telefone)];
  const corte = lida && lida > estado.baseline ? lida : estado.baseline;
  return new Date(c.ultima_em).getTime() > new Date(corte).getTime();
}

/** Marca a conversa como lida agora (ou até `ate`, se for mais recente). */
export function marcarConversaLida(telefone: string, ate?: string | null, storage: StorageLike | null = storagePadrao()): void {
  const chave = chaveTelefone(telefone);
  if (!chave) return;
  const atual = lerEstadoLeitura(storage);
  const agoraIso = new Date().toISOString();
  const marca = ate && ate > agoraIso ? ate : agoraIso;
  if (atual.lidas[chave] && atual.lidas[chave] >= marca) return;
  const proximo: EstadoLeitura = { ...atual, lidas: { ...atual.lidas, [chave]: marca } };
  if (storage === storagePadrao()) cache = proximo;
  try {
    storage?.setItem(LEITURA_STORAGE_KEY, JSON.stringify(proximo));
  } catch {
    /* segue só em memória */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Para `useSyncExternalStore`: muda quando alguém marca leitura (esta aba ou outra). */
export function assinarLeitura(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LEITURA_STORAGE_KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Só para testes. */
export function _resetCacheLeitura() {
  cache = null;
}
