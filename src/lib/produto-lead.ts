/**
 * Produtos do Grupo AGF para os quais um lead pode ser prospectado.
 *
 * A base histórica é toda Fintex (recuperação de crédito); Contábil e ATAX
 * entraram com o Lote 2. O valor fica em `leads.produto` (CHECK no banco).
 */
export const PRODUTOS_LEAD = [
  { value: "agf_contabil", label: "AGF Contábil" },
  { value: "agf_fintex", label: "AGF Fintex" },
  { value: "agf_atax", label: "ATAX" },
] as const;

export type ProdutoLead = (typeof PRODUTOS_LEAD)[number]["value"];

export const PRODUTO_LEAD_PADRAO: ProdutoLead = "agf_fintex";

export const PRODUTO_LEAD_LABEL: Record<ProdutoLead, string> = Object.fromEntries(
  PRODUTOS_LEAD.map((p) => [p.value, p.label]),
) as Record<ProdutoLead, string>;

export const PRODUTO_LEAD_COLORS: Record<ProdutoLead, string> = {
  agf_contabil: "bg-violet-100 text-violet-800 border-violet-200",
  agf_fintex: "bg-emerald-100 text-emerald-800 border-emerald-200",
  agf_atax: "bg-sky-100 text-sky-800 border-sky-200",
};

/** Filtro de produto das telas comerciais (Pipeline e Fila): "todos" ou um produto. */
export type FiltroProduto = "todos" | ProdutoLead;

export const FILTRO_PRODUTO_STORAGE_KEY = "focus.pipeline.produto";

export function isProdutoLead(v: unknown): v is ProdutoLead {
  return typeof v === "string" && PRODUTOS_LEAD.some((p) => p.value === v);
}

export function lerFiltroProduto(storage: Pick<Storage, "getItem"> | null | undefined): FiltroProduto {
  try {
    const raw = storage?.getItem(FILTRO_PRODUTO_STORAGE_KEY);
    return isProdutoLead(raw) ? raw : "todos";
  } catch {
    return "todos";
  }
}

export function salvarFiltroProduto(filtro: FiltroProduto, storage: Pick<Storage, "setItem"> | null | undefined): void {
  try {
    storage?.setItem(FILTRO_PRODUTO_STORAGE_KEY, filtro);
  } catch {
    /* storage indisponível */
  }
}

export function filtrarPorProduto<T extends { produto?: string | null }>(leads: T[], filtro: FiltroProduto): T[] {
  if (filtro === "todos") return leads;
  // Lead antigo sem produto gravado é Fintex (default da coluna).
  return leads.filter((l) => (l.produto || PRODUTO_LEAD_PADRAO) === filtro);
}

const semAcento = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/**
 * Texto livre da planilha ("Contábil", "contabilidade", "FINTAX", "tax") →
 * produto, ou null quando não dá para afirmar. "tax" sozinho vira ATAX, mas
 * "fintax" (grafia antiga da Fintex) é Fintex — por isso a ordem dos testes.
 */
export function normalizarProdutoLead(texto: string | null | undefined): ProdutoLead | null {
  const s = semAcento(String(texto ?? ""));
  if (!s) return null;
  if (s === "agf_contabil" || s === "agf_fintex" || s === "agf_atax") return s;
  if (/contab/.test(s)) return "agf_contabil";
  if (/fint[ea]x/.test(s) || /recupera/.test(s) || /credito/.test(s)) return "agf_fintex";
  if (/atax/.test(s) || /\btax\b/.test(s) || /software/.test(s)) return "agf_atax";
  return null;
}
