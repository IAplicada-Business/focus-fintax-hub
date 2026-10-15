import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WHATSAPP_COMERCIAL_PADRAO } from "@/lib/diagnostico-whatsapp";

/** Lê app_config.whatsapp_comercial (RPC pública). Nulo/erro → número padrão. */
export async function fetchWhatsappComercial(): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("get_whatsapp_comercial");
    if (error) return WHATSAPP_COMERCIAL_PADRAO;
    const n = String(data ?? "").replace(/\D/g, "");
    return n || WHATSAPP_COMERCIAL_PADRAO;
  } catch {
    return WHATSAPP_COMERCIAL_PADRAO;
  }
}

/**
 * Número do WhatsApp comercial para os botões das páginas públicas
 * (/diagnostico, /calculadora). Começa com o padrão para o botão funcionar
 * já no primeiro render, mesmo antes (ou sem) a resposta do banco.
 */
export function useWhatsappComercial(): string {
  const { data } = useQuery({
    queryKey: ["app_config", "whatsapp_comercial"],
    queryFn: fetchWhatsappComercial,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  return data ?? WHATSAPP_COMERCIAL_PADRAO;
}
