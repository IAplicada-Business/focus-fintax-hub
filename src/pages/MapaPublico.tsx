import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import MapaCreditosView from "@/components/mapa/MapaCreditosView";
import {
  buildLinhasMapa,
  type ClienteMapa,
  type LinhaMapa,
} from "@/lib/mapa-creditos";
import { type CompensacaoSumRow } from "@/lib/clientes-constants";

/**
 * Mapa Tributário visto pelo cliente, via link permanente enviado no WhatsApp.
 *
 * Rota PÚBLICA (fora do ProtectedRoute). O token é a única credencial, e a RPC
 * get_mapa_by_token é quem decide o que devolver — este componente não consulta
 * tabela nenhuma direto.
 */
export default function MapaPublico() {
  const { token } = useParams<{ token: string }>();
  const [cliente, setCliente] = useState<ClienteMapa | null>(null);
  const [linhas, setLinhas] = useState<LinhaMapa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let ativo = true;
    (supabase as unknown as {
      rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown }>;
    })
      .rpc("get_mapa_by_token", { _token: token })
      .then(({ data }) => {
        if (!ativo) return;
        const payload = data as {
          cliente?: ClienteMapa;
          mapa?: LinhaMapa[];
          compensacoes?: CompensacaoSumRow[];
          processos?: { id: string; tese: string | null }[];
          creditos?: { tese_id: string; valor_compensado_manual: number | null }[];
        } | null;

        if (payload?.cliente) {
          setCliente(payload.cliente);
          // Mesmo cálculo da página do time (buildLinhasMapa), mas mostrando só
          // as teses marcadas como visíveis para o cliente.
          setLinhas(
            buildLinhasMapa({
              mapa: payload.mapa ?? [],
              compensacoes: payload.compensacoes ?? [],
              processos: payload.processos ?? [],
              creditos: payload.creditos ?? [],
            }).filter((l) => l.visivel_cliente),
          );
        }
        setLoading(false);
      })
      .catch(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Token inexistente e token revogado dão a MESMA resposta de propósito: não
  // confirmar para quem tentou adivinhar que aquele token existiu algum dia.
  if (!cliente) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-2">
        <h1 className="font-display text-lg font-bold text-navy">Link indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Este link não está mais válido. Fale com a equipe Focus FinTax para receber um novo.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 overflow-x-auto">
      <MapaCreditosView cliente={cliente} linhas={linhas} />
    </div>
  );
}
