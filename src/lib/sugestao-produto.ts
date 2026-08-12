/**
 * Re-export do motor de sugestão pra UI (LeadSidePanel etc.).
 * Fonte de verdade: supabase/functions/_shared/sugestao-produto.ts
 */
export {
  PRODUTO_LABEL,
  type ProdutoSugerido,
  type SugestaoProdutoRacional,
} from "../../supabase/functions/_shared/sugestao-produto";
