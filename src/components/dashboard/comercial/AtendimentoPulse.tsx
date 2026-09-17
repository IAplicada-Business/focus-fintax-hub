import { useNavigate } from "react-router-dom";
import { Bot, MessageCircle, Clock, Users } from "lucide-react";
import { Panel, LinkMore, CountChip } from "../ui/primitives";
import type { ResumoAtendimento } from "@/lib/comercial-analytics";
import type { LeadDashboard } from "@/services/comercialDashboardService";
import { conversaDoLead, indexarConversas } from "@/lib/pipeline-board";
import type { InboxConversa } from "@/services/atendimentoService";
import { cn } from "@/lib/utils";

interface Props {
  resumo: ResumoAtendimento;
  conversas: InboxConversa[];
  leads: LeadDashboard[];
}

/**
 * Pulso do atendimento (inbox WhatsApp) dentro do Dashboard comercial: quem
 * está com o robô, quem está com humano e quem está esperando resposta.
 */
export function AtendimentoPulse({ resumo, conversas, leads }: Props) {
  const navigate = useNavigate();
  const indice = indexarConversas(conversas);
  const nomePorTelefone = new Map<string, LeadDashboard>();
  for (const l of leads) {
    const c = conversaDoLead(l.whatsapp, indice);
    if (c && !nomePorTelefone.has(c.telefone)) nomePorTelefone.set(c.telefone, l);
  }
  const fila = resumo.filaResposta.slice(0, 5);

  return (
    <Panel
      eyebrow="Atendimento"
      title="Conversas de WhatsApp"
      subtitle={`${resumo.total} conversa${resumo.total !== 1 ? "s" : ""} · ${resumo.ativas24h} com mensagem nas últimas 24h`}
      action={<LinkMore onClick={() => navigate("/atendimento")}>Abrir inbox</LinkMore>}
      flush
      className="h-full"
    >
      <div className="grid grid-cols-3 divide-x divide-ink-06 border-b border-ink-06">
        <Stat icon={<Bot className="w-3.5 h-3.5" />} label="Com o robô" value={resumo.comRobo} />
        <Stat icon={<Users className="w-3.5 h-3.5" />} label="Com humano" value={resumo.humanas} />
        <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Aguardando nós" value={resumo.aguardandoResposta} tom={resumo.aguardandoResposta > 0 ? "red" : "muted"} />
      </div>
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[1.4px] text-ink-35">Sem resposta há mais de 4h</p>
          {fila.length > 0 && <CountChip tom="red">{resumo.aguardandoResposta}</CountChip>}
        </div>
        {fila.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-35 italic flex items-center justify-center gap-2">
            <MessageCircle className="w-4 h-4" /> Nenhuma conversa esperando resposta.
          </p>
        ) : (
          <ul className="divide-y divide-ink-06">
            {fila.map((f) => {
              const lead = nomePorTelefone.get(f.telefone);
              return (
                <li key={f.telefone}>
                  <button
                    type="button"
                    onClick={() => navigate(`/atendimento?tel=${encodeURIComponent(f.telefone)}`)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-ink-03 rounded-md px-1 -mx-1 transition-colors group"
                  >
                    <span className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", f.bot_ativo ? "bg-navy/10 text-navy" : "bg-gold/15 text-gold-deep")}>
                      {f.bot_ativo ? <Bot className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink truncate group-hover:underline">{lead?.empresa ?? f.telefone}</p>
                      <p className="text-[10px] text-ink-35 truncate">{lead ? `${lead.nome ?? ""} · ${f.telefone}` : "sem lead vinculado"}</p>
                    </div>
                    <span className="text-[11px] font-bold font-mono-dm tabular-nums text-dash-red shrink-0">{f.horas}h</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function Stat({ icon, label, value, tom = "navy" }: { icon: React.ReactNode; label: string; value: number; tom?: "navy" | "red" | "muted" }) {
  const cls = { navy: "text-navy", red: "text-dash-red", muted: "text-ink-35" }[tom];
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-ink-35 mb-1">
        <span className="text-gold-deep">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-[1.2px] truncate">{label}</span>
      </div>
      <p className={cn("font-display text-2xl font-extrabold leading-none tabular-nums", cls)}>{value}</p>
    </div>
  );
}
