/**
 * Empresas do Grupo AGF para as quais um lead pode ser prospectado:
 * AGF Contábil, AGF Fintax (recuperação de crédito) e AGF Tax.
 *
 * A base histórica é toda AGF Fintax; Contábil e Tax entraram com o Lote 2.
 * O valor fica em `leads.produto` (CHECK no banco). Os códigos antigos
 * `agf_fintex` / `agf_atax` (grafia errada, Lote 2) foram migrados em
 * 20261016140000 e ainda são aceitos na leitura por segurança.
 */
export const PRODUTOS_LEAD = [
  { value: "agf_contabil", label: "AGF Contábil" },
  { value: "agf_fintax", label: "AGF Fintax" },
  { value: "agf_tax", label: "AGF Tax" },
] as const;

export type ProdutoLead = (typeof PRODUTOS_LEAD)[number]["value"];

export const PRODUTO_LEAD_PADRAO: ProdutoLead = "agf_fintax";

/** Códigos gravados pelo Lote 2 antes da correção de nomenclatura. */
const CODIGOS_LEGADOS: Record<string, ProdutoLead> = {
  agf_fintex: "agf_fintax",
  agf_atax: "agf_tax",
};

export const PRODUTO_LEAD_LABEL: Record<ProdutoLead, string> = Object.fromEntries(
  PRODUTOS_LEAD.map((p) => [p.value, p.label]),
) as Record<ProdutoLead, string>;

export const PRODUTO_LEAD_COLORS: Record<ProdutoLead, string> = {
  agf_contabil: "bg-violet-100 text-violet-800 border-violet-200",
  agf_fintax: "bg-emerald-100 text-emerald-800 border-emerald-200",
  agf_tax: "bg-sky-100 text-sky-800 border-sky-200",
};

/** Filtro de produto das telas comerciais (Pipeline e Fila): "todos" ou um produto. */
export type FiltroProduto = "todos" | ProdutoLead;

export const FILTRO_PRODUTO_STORAGE_KEY = "focus.pipeline.produto";

export function isProdutoLead(v: unknown): v is ProdutoLead {
  return typeof v === "string" && PRODUTOS_LEAD.some((p) => p.value === v);
}

/** Código oficial de um valor vindo do banco / storage (aceita o legado). */
export function produtoLeadCanonico(v: unknown): ProdutoLead | null {
  if (isProdutoLead(v)) return v;
  if (typeof v === "string" && v in CODIGOS_LEGADOS) return CODIGOS_LEGADOS[v];
  return null;
}

export function lerFiltroProduto(storage: Pick<Storage, "getItem"> | null | undefined): FiltroProduto {
  try {
    return produtoLeadCanonico(storage?.getItem(FILTRO_PRODUTO_STORAGE_KEY)) ?? "todos";
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
  // Lead antigo sem produto gravado é AGF Fintax (default da coluna).
  return leads.filter((l) => (produtoLeadCanonico(l.produto) ?? PRODUTO_LEAD_PADRAO) === filtro);
}

const semAcento = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/**
 * Texto livre da planilha ("Contábil", "contabilidade", "FINTAX", "tax") →
 * produto, ou null quando não dá para afirmar. "fintax" / "fintex" é AGF
 * Fintax; "tax" ou "atax" sozinho é AGF Tax — por isso a ordem dos testes.
 */
export function normalizarProdutoLead(texto: string | null | undefined): ProdutoLead | null {
  const s = semAcento(String(texto ?? ""));
  if (!s) return null;
  const canonico = produtoLeadCanonico(s);
  if (canonico) return canonico;
  if (/contab/.test(s)) return "agf_contabil";
  if (/fint[ea]x/.test(s) || /recupera/.test(s) || /credito/.test(s)) return "agf_fintax";
  if (/atax/.test(s) || /\btax\b/.test(s) || /software/.test(s)) return "agf_tax";
  return null;
}
