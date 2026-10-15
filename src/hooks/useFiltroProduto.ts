import { useCallback, useState } from "react";
import { lerFiltroProduto, salvarFiltroProduto, type FiltroProduto } from "@/lib/produto-lead";

/** Filtro de produto compartilhado por Pipeline e Fila, persistido no navegador. */
export function useFiltroProduto() {
  const [filtro, setFiltro] = useState<FiltroProduto>(() => lerFiltroProduto(typeof window !== "undefined" ? window.localStorage : null));
  const trocar = useCallback((v: FiltroProduto) => {
    setFiltro(v);
    salvarFiltroProduto(v, typeof window !== "undefined" ? window.localStorage : null);
  }, []);
  return [filtro, trocar] as const;
}
