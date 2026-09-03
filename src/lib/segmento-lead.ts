import { SEGMENTO_LABELS } from "@/lib/pipeline-constants";

/**
 * O campo `segmento` do lead é texto livre: a mesma coisa chega como
 * "Supermercado", "supermercado" e "SUPERMERCADO", e o dashboard mostrava uma
 * linha para cada. Normaliza para uma chave canônica antes de agregar.
 */
export function normalizarSegmento(raw: string | null | undefined): string {
  const base = (raw ?? "").trim();
  if (!base) return "nao_informado";
  const chave = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!chave) return "nao_informado";
  return ALIASES[chave] ?? chave;
}

/** Variações que significam a mesma coisa e precisam somar na mesma linha. */
const ALIASES: Record<string, string> = {
  outro: "outros",
  outra: "outros",
  supermercados: "supermercado",
  farmacias: "farmacia",
  material_construcao: "materiais_construcao",
  materiais_de_construcao: "materiais_construcao",
};

const ROTULOS_EXTRA: Record<string, string> = {
  nao_informado: "Não informado",
};

/** Rótulo de exibição: usa o mapa do pipeline e, fora dele, reconstrói o texto. */
export function rotuloSegmento(chave: string): string {
  const conhecido = SEGMENTO_LABELS[chave] ?? ROTULOS_EXTRA[chave];
  if (conhecido) return conhecido;
  const palavras = chave.split("_").filter(Boolean);
  if (palavras.length === 0) return chave;
  return palavras.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" ");
}

/** Agrega leads por segmento canônico, do maior para o menor. */
export function agruparPorSegmento(
  segmentosBrutos: (string | null | undefined)[],
): { segmento: string; label: string; count: number }[] {
  const mapa = new Map<string, number>();
  segmentosBrutos.forEach((s) => {
    const chave = normalizarSegmento(s);
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  });
  return [...mapa.entries()]
    .map(([segmento, count]) => ({ segmento, label: rotuloSegmento(segmento), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}
