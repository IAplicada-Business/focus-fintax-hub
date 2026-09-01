import { supabase } from "@/integrations/supabase/client";
import { isTeseNoCalculoDefault, normalizeTeseCatalogCodigo } from "@/lib/clientes-constants";

export async function resolveCatalogTeseId(slug: string, nome = ""): Promise<string | null> {
  const codigo = normalizeTeseCatalogCodigo(slug, nome);
  if (!codigo) return null;
  const { data } = await (supabase as any)
    .from("teses_tributarias")
    .select("id")
    .eq("codigo", codigo)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function deleteCreditoApuradoByTeseId(clienteId: string, teseId: string): Promise<void> {
  await (supabase as any)
    .from("creditos_apurados")
    .delete()
    .eq("cliente_id", clienteId)
    .eq("tese_id", teseId);
}

export async function deleteCreditoApuradoForProcesso(opts: {
  clienteId: string;
  tese: string;
  nomeExibicao?: string | null;
}): Promise<void> {
  const teseId = await resolveCatalogTeseId(opts.tese, opts.nomeExibicao || "");
  if (!teseId) return;
  await deleteCreditoApuradoByTeseId(opts.clienteId, teseId);
}

/**
 * Espelha processos_teses.valor_credito em creditos_apurados (fonte dos cards do cabeçalho).
 * Create: incluir_no_calculo só para INSUMOS/SUBVENCAO.
 * Update: só o valor — não mexe no checkbox do Mapa.
 * Troca de tese: remove o crédito antigo e upserta o novo.
 */
export async function syncCreditoApuradoFromProcesso(opts: {
  clienteId: string;
  tese: string;
  nomeExibicao?: string | null;
  valorCredito: number;
  previousTese?: string | null;
  previousNomeExibicao?: string | null;
}): Promise<void> {
  const codigo = normalizeTeseCatalogCodigo(opts.tese, opts.nomeExibicao || "");
  const teseId = await resolveCatalogTeseId(opts.tese, opts.nomeExibicao || "");

  const prevCodigo = opts.previousTese
    ? normalizeTeseCatalogCodigo(opts.previousTese, opts.previousNomeExibicao || "")
    : null;
  if (prevCodigo && prevCodigo !== codigo) {
    const oldId = await resolveCatalogTeseId(opts.previousTese!, opts.previousNomeExibicao || "");
    if (oldId && oldId !== teseId) {
      await deleteCreditoApuradoByTeseId(opts.clienteId, oldId);
    }
  }

  if (!teseId) return;

  const { data: existing } = await (supabase as any)
    .from("creditos_apurados")
    .select("id")
    .eq("cliente_id", opts.clienteId)
    .eq("tese_id", teseId)
    .maybeSingle();

  const valor = Number(opts.valorCredito) || 0;
  const now = new Date().toISOString();

  if ((existing as { id?: string } | null)?.id) {
    await (supabase as any)
      .from("creditos_apurados")
      .update({ valor_apurado_inicial: valor, atualizado_em: now })
      .eq("id", (existing as { id: string }).id);
    return;
  }

  await (supabase as any).from("creditos_apurados").insert({
    cliente_id: opts.clienteId,
    tese_id: teseId,
    valor_apurado_inicial: valor,
    incluir_no_calculo: isTeseNoCalculoDefault(codigo),
  });
}
