// supabase/functions/_shared/meta-fetch.ts
//
// Utilitário compartilhado entre meta-sync-structure e meta-sync-insights.
//
// fetchWithRetry: retry com backoff exponencial em rate limits da Graph API.
// Se der outro erro (permissão, campo inválido, etc), THROW imediato — não
// faz sentido re-tentar.
//
// Rate-limit codes conhecidos da Meta Graph API:
//   code 4      — Application request limit reached
//   code 17     — App-level rate limit
//   code 613    — Custom-level rate limit
//   subcode 2446079 — Business Use Case Usage limit
//
// Backoff: 2s, 4s, 8s (default maxRetries=3). Ajustável pelo caller.
//
// Retorna o JSON já parseado (`data`, `paging.next`, etc). Se depois de todos
// os retries ainda estiver rate-limited, throw com contexto completo.

const RATE_LIMIT_CODES = new Set([4, 17, 613]);
const RATE_LIMIT_SUBCODES = new Set([2446079]);

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  if (typeof err.code === "number" && RATE_LIMIT_CODES.has(err.code)) return true;
  if (typeof err.error_subcode === "number" && RATE_LIMIT_SUBCODES.has(err.error_subcode)) return true;
  return false;
}

export interface FetchWithRetryOptions {
  maxRetries?: number;
  /** Injeção pra testes — permite substituir fetch e sleep sem tocar em globals */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Callback opcional a cada retry — útil pra observabilidade/telemetria */
  onRetry?: (attempt: number, waitMs: number, err: any) => void;
}

export async function fetchWithRetry(
  url: string,
  opts: FetchWithRetryOptions = {},
): Promise<any> {
  const maxRetries = opts.maxRetries ?? 3;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const r = await fetchImpl(url);
    const j = await r.json();
    if (!j.error) return j;

    if (!isRateLimitError(j.error)) {
      // Erro que não é rate limit — não faz sentido re-tentar
      throw new Error(JSON.stringify(j.error));
    }

    lastError = j.error;
    const waitMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
    opts.onRetry?.(attempt + 1, waitMs, j.error);
    console.warn(
      `Meta rate limit hit (code ${j.error.code}, subcode ${j.error.error_subcode ?? "-"}), ` +
      `retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`,
    );
    if (attempt < maxRetries - 1) {
      await sleep(waitMs);
    }
  }

  throw new Error(
    `Meta rate limit exhausted after ${maxRetries} retries. Last error: ${JSON.stringify(lastError)}`,
  );
}

/**
 * pagedFetchWithRetry: percorre paginação da Graph API acumulando `data`.
 * Cada chamada individual usa fetchWithRetry (rate-limit safe).
 */
export async function pagedFetchWithRetry(
  url: string,
  opts: FetchWithRetryOptions = {},
): Promise<any[]> {
  const all: any[] = [];
  let next: string | null = url;
  while (next) {
    const j = await fetchWithRetry(next, opts);
    all.push(...(j.data ?? []));
    next = j.paging?.next ?? null;
  }
  return all;
}

export { isRateLimitError };
