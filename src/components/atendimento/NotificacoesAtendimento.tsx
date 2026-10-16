import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEnvironment } from "@/hooks/useEnvironment";
import { usePodeVerAtendimento } from "@/hooks/data/useConversasNaoLidas";
import { pathToAmbiente } from "@/lib/environments";
import { chaveTelefone } from "@/lib/atendimento-leitura";
import { phoneDigits, phonesMatch } from "@/lib/phone-match";

const DURACAO_MS = 6_000;
/** Mesma conversa não gera outro aviso dentro desta janela (lead mandando várias seguidas). */
const JANELA_AGRUPAR_MS = 60_000;

type MensagemNova = { telefone: string; texto: string | null; tipo: string | null; direcao: string; lead_id: string | null };

async function nomeDoContato(m: MensagemNova): Promise<string> {
  if (m.lead_id) {
    const { data } = await supabase.from("leads").select("empresa, nome").eq("id", m.lead_id).maybeSingle();
    if (data) return data.empresa || data.nome || m.telefone;
  }
  const d = phoneDigits(m.telefone);
  if (d.length >= 8) {
    const { data } = await supabase.from("leads").select("empresa, nome, whatsapp").ilike("whatsapp", `%${d.slice(-8)}%`).limit(5);
    const lead = (data ?? []).find((l) => phonesMatch(l.whatsapp, m.telefone));
    if (lead) return lead.empresa || lead.nome || m.telefone;
  }
  return m.telefone;
}

function previa(m: MensagemNova): string {
  const t = (m.texto ?? "").trim();
  if (t) return t.length > 90 ? `${t.slice(0, 90)}…` : t;
  return m.tipo && m.tipo !== "texto" ? `Enviou ${m.tipo}` : "Nova mensagem";
}

/**
 * Montado uma vez no layout. Escuta mensagens de entrada do WhatsApp em tempo
 * real, mantém a caixa do atendimento atualizada (badges do menu e do
 * pipeline) e, no ambiente comercial, mostra um aviso no canto superior
 * direito que some sozinho.
 */
export function NotificacoesAtendimento(): null {
  const pode = usePodeVerAtendimento();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { ambiente } = useEnvironment();
  const ultimoAviso = useRef(new Map<string, number>());
  // Ref para o handler do canal ler a rota atual sem recriar a inscrição.
  const rota = useRef({ pathname: location.pathname, search: location.search, ambiente });
  rota.current = { pathname: location.pathname, search: location.search, ambiente };

  useEffect(() => {
    if (!pode) return;
    const canal = supabase
      .channel("atendimento-notificacoes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "atendimento_mensagens" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["atendimento", "inbox"] });
          const m = payload.new as MensagemNova;
          if (!m || m.direcao !== "entrada") return;

          const { pathname, search, ambiente: amb } = rota.current;
          if ((pathToAmbiente(pathname) ?? amb) !== "comercial") return;
          // Já está com essa conversa aberta na tela: nada a avisar.
          const telAberto = pathname.startsWith("/atendimento") ? new URLSearchParams(search).get("tel") : null;
          if (telAberto && phonesMatch(telAberto, m.telefone) && document.visibilityState === "visible") return;

          const chave = chaveTelefone(m.telefone);
          const agora = Date.now();
          if (agora - (ultimoAviso.current.get(chave) ?? 0) < JANELA_AGRUPAR_MS) return;
          ultimoAviso.current.set(chave, agora);

          void nomeDoContato(m).then((nome) => {
            toast(`Nova mensagem de ${nome}`, {
              id: `atendimento-${chave}`,
              description: previa(m),
              position: "top-right",
              duration: DURACAO_MS,
              action: { label: "Abrir", onClick: () => navigate(`/atendimento?tel=${encodeURIComponent(m.telefone)}`) },
            });
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [pode, qc, navigate]);

  return null;
}
