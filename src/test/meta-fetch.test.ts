import { describe, it, expect, vi } from "vitest";
import {
  fetchWithRetry,
  pagedFetchWithRetry,
  isRateLimitError,
} from "../../supabase/functions/_shared/meta-fetch";

// -----------------------------------------------------------------------------
// isRateLimitError
// -----------------------------------------------------------------------------

describe("isRateLimitError", () => {
  it("codes 4/17/613 → true", () => {
    expect(isRateLimitError({ code: 4 })).toBe(true);
    expect(isRateLimitError({ code: 17 })).toBe(true);
    expect(isRateLimitError({ code: 613 })).toBe(true);
  });
  it("subcode 2446079 (Business Use Case) → true", () => {
    expect(isRateLimitError({ code: 100, error_subcode: 2446079 })).toBe(true);
  });
  it("code 100 (permission) → false", () => {
    expect(isRateLimitError({ code: 100 })).toBe(false);
  });
  it("null/undefined → false", () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// fetchWithRetry
// -----------------------------------------------------------------------------

function mockFetch(sequence: any[]): typeof fetch {
  let i = 0;
  return async (_url) => {
    const payload = sequence[Math.min(i, sequence.length - 1)];
    i++;
    return { json: async () => payload } as any as Response;
  };
}

describe("fetchWithRetry", () => {
  it("payload OK na 1ª tentativa → sem retry, retorna direto", async () => {
    const spy = vi.fn();
    const j = await fetchWithRetry("https://x", {
      fetchImpl: mockFetch([{ data: [1, 2, 3] }]),
      sleep: async () => spy(),
    });
    expect(j.data).toEqual([1, 2, 3]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rate limit code 17 → retry 3× e falha após esgotar", async () => {
    const sleeps: number[] = [];
    await expect(
      fetchWithRetry("https://x", {
        maxRetries: 3,
        fetchImpl: mockFetch([
          { error: { code: 17, message: "rate limit" } },
          { error: { code: 17, message: "rate limit" } },
          { error: { code: 17, message: "rate limit" } },
        ]),
        sleep: async (ms) => { sleeps.push(ms); },
      })
    ).rejects.toThrow(/rate limit exhausted/i);
    // Backoff 2s, 4s (não dorme depois da última tentativa)
    expect(sleeps).toEqual([2000, 4000]);
  });

  it("rate limit → recupera na 2ª tentativa", async () => {
    const sleeps: number[] = [];
    const j = await fetchWithRetry("https://x", {
      fetchImpl: mockFetch([
        { error: { code: 613, message: "custom rate limit" } },
        { data: ["ok"] },
      ]),
      sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(j.data).toEqual(["ok"]);
    expect(sleeps).toEqual([2000]);
  });

  it("erro não-rate-limit (code 100 permissão) → throw imediato SEM retry", async () => {
    const sleeps: number[] = [];
    await expect(
      fetchWithRetry("https://x", {
        fetchImpl: mockFetch([
          { error: { code: 100, message: "permission denied" } },
        ]),
        sleep: async (ms) => { sleeps.push(ms); },
      })
    ).rejects.toThrow(/permission denied/);
    expect(sleeps).toEqual([]);
  });

  it("subcode 2446079 (Business Use Case) trata como rate limit", async () => {
    const sleeps: number[] = [];
    const j = await fetchWithRetry("https://x", {
      fetchImpl: mockFetch([
        { error: { code: 100, error_subcode: 2446079 } },
        { data: [1] },
      ]),
      sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(j.data).toEqual([1]);
    expect(sleeps).toEqual([2000]);
  });

  it("onRetry é chamado com (attempt, waitMs, err)", async () => {
    const events: any[] = [];
    await fetchWithRetry("https://x", {
      fetchImpl: mockFetch([
        { error: { code: 17 } },
        { data: [] },
      ]),
      sleep: async () => {},
      onRetry: (a, ms, err) => events.push({ a, ms, code: err.code }),
    });
    expect(events).toEqual([{ a: 1, ms: 2000, code: 17 }]);
  });
});

// -----------------------------------------------------------------------------
// pagedFetchWithRetry — paginação
// -----------------------------------------------------------------------------

describe("pagedFetchWithRetry", () => {
  it("paginação de 2 páginas — segunda é processada", async () => {
    let i = 0;
    const results = await pagedFetchWithRetry("https://x", {
      fetchImpl: (async (url: string) => {
        i++;
        if (i === 1) {
          return { json: async () => ({ data: ["a", "b"], paging: { next: "https://y" } }) } as any;
        }
        return { json: async () => ({ data: ["c"] }) } as any;
      }) as any,
      sleep: async () => {},
    });
    expect(results).toEqual(["a", "b", "c"]);
    expect(i).toBe(2);
  });

  it("rate limit numa página no meio → retry só nessa página, mantém progresso", async () => {
    let i = 0;
    const sleeps: number[] = [];
    const results = await pagedFetchWithRetry("https://x", {
      fetchImpl: (async (_url: string) => {
        i++;
        if (i === 1) return { json: async () => ({ data: ["a"], paging: { next: "https://y" } }) } as any;
        if (i === 2) return { json: async () => ({ error: { code: 17 } }) } as any;
        return { json: async () => ({ data: ["b"] }) } as any;
      }) as any,
      sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(results).toEqual(["a", "b"]);
    expect(sleeps).toEqual([2000]); // retry na segunda página
  });

  it("página inicial sem `data` (respost vazia) → array vazio", async () => {
    const r = await pagedFetchWithRetry("https://x", {
      fetchImpl: mockFetch([{}]),
      sleep: async () => {},
    });
    expect(r).toEqual([]);
  });
});
