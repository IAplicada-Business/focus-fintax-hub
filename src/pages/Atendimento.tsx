import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, MessageCircle, Search, Users, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAtendimentoInbox } from "@/hooks/data/useAtendimentoInbox";
import { useLeadsPipeline } from "@/hooks/data/useLeads";
import { phonesMatch, phoneDigits } from "@/lib/phone-match";
import AtendimentoTab from "@/components/pipeline/AtendimentoTab";
import { AtendimentoLeadPanel } from "@/components/atendimento/AtendimentoLeadPanel";
import type { PipelineLead } from "@/pages/Pipeline";
import type { InboxConversa } from "@/services/atendimentoService";

type FiltroClasse = "todas" | "bot" | "humano";

/** Lead só para validar o painel lateral. Some quando já existe conversa real. */
const LEAD_DEMO: PipelineLead = {
  id: "demo-atendimento",
  nome: "Maria Silva",
  empresa: "Silva Comércio LTDA",
  cnpj: "12.345.678/0001-90",
  email: "maria.silva@teste.com",
  whatsapp: "21981143032",
  segmento: "supermercado",
  regime_tributario: "Lucro Presumido",
  faturamento_faixa: "500k_2m",
  score_lead: 78,
  status: "relatorio_gerado",
  status_funil: "qualificado",
  status_funil_atualizado_em: new Date().toISOString(),
  origem: "manual",
  criado_em: new Date().toISOString(),
  observacoes: "",
  token: "",
  relatorios_leads: [
    {
      estimativa_total_minima: 120000,
      estimativa_total_maxima: 340000,
      teses_identificadas: [
        { tese_nome: "Exclusão do ICMS da base de PIS/COFINS", estimativa_minima: 80000, estimativa_maxima: 210000 },
        { tese_nome: "INSS sobre verbas indenizatórias", estimativa_minima: 40000, estimativa_maxima: 130000 },
      ],
    },
  ],
};

const CONVERSA_DEMO: InboxConversa = {
  telefone: "21981143032",
  bot_ativo: false,
  atualizado_em: new Date().toISOString(),
  ultima_texto: "Lead de teste — dados no painel à direita",
  ultima_em: new Date().toISOString(),
  ultima_origem: "humano",
  ultima_direcao: "entrada",
};

function horaLista(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function leadsDoTelefone(leads: PipelineLead[], telefone: string) {
  return leads.filter((l) => phonesMatch(l.whatsapp, telefone));
}

export default function Atendimento() {
  const [searchParams, setSearchParams] = useSearchParams();
  const telParam = searchParams.get("tel") || "";
  const [filtro, setFiltro] = useState<FiltroClasse>("todas");
  const [busca, setBusca] = useState("");

  const inboxQ = useAtendimentoInbox();
  const leadsQ = useLeadsPipeline();
  const conversasReais = inboxQ.data ?? [];
  const leadsReais = (leadsQ.data ?? []) as PipelineLead[];
  const usarDemo = !inboxQ.isLoading && conversasReais.length === 0;
  const conversas = usarDemo ? [CONVERSA_DEMO] : conversasReais;
  const leads = usarDemo
    ? [LEAD_DEMO, ...leadsReais]
    : leadsReais;

  const selectedTel = useMemo(() => {
    if (!telParam) return "";
    const exact = conversas.find((c) => c.telefone === telParam || phonesMatch(c.telefone, telParam));
    if (exact) return exact.telefone;
    return phoneDigits(telParam) || telParam;
  }, [telParam, conversas]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (filtro === "bot" && !c.bot_ativo) return false;
      if (filtro === "humano" && c.bot_ativo) return false;

      if (!q) return true;
      const vinculos = leadsDoTelefone(leads, c.telefone);
      const hay = [
        c.telefone,
        c.ultima_texto,
        ...vinculos.flatMap((l) => [l.nome, l.empresa, l.whatsapp]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [conversas, filtro, busca, leads]);

  const selecionada = conversas.find((c) => c.telefone === selectedTel) ?? null;
  const leadsSel = selectedTel ? leadsDoTelefone(leads, selectedTel) : [];
  const leadAtivo = leadsSel[0] ?? null;

  const abrir = (c: InboxConversa) => {
    setSearchParams({ tel: c.telefone });
  };

  const fecharMobile = () => {
    setSearchParams({});
  };

  const chatAberto = Boolean(selectedTel);

  useEffect(() => {
    if (telParam || lista.length === 0) return;
    setSearchParams({ tel: lista[0].telefone }, { replace: true });
  }, [telParam, lista, setSearchParams]);

  return (
    <div className="h-[calc(100vh-4rem)] max-md:h-[calc(100vh-3.5rem)] flex overflow-hidden bg-background">
      {/* Lista — estilo inbox */}
      <aside
        className={cn(
          "w-full md:w-80 lg:w-[22rem] border-r flex flex-col min-h-0 bg-card",
          chatAberto && "hidden md:flex",
        )}
      >
        <div className="p-3 border-b space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-bold">Atendimento</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, empresa ou número"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {(
              [
                ["todas", "Todas"],
                ["bot", "Robô"],
                ["humano", "Humano"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={cn(
                  "flex-1 h-7 rounded-full text-[11px] font-semibold border transition-colors",
                  filtro === id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {inboxQ.isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : lista.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma conversa {filtro === "todas" ? "ainda" : "neste filtro"}.
            </p>
          ) : (
            lista.map((c) => {
              const vinculos = leadsDoTelefone(leads, c.telefone);
              const titulo = vinculos[0]?.empresa || vinculos[0]?.nome || c.telefone;
              const sub = vinculos[0]?.nome && vinculos[0]?.empresa ? vinculos[0].nome : c.telefone;
              const ativo = c.telefone === selectedTel;
              return (
                <button
                  key={c.telefone}
                  type="button"
                  onClick={() => abrir(c)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b flex gap-3 hover:bg-muted/60 transition-colors",
                    ativo && "bg-primary/8 border-l-2 border-l-primary",
                  )}
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {c.bot_ativo ? (
                      <Bot className="h-4 w-4 text-primary" />
                    ) : (
                      <Users className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{titulo}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{horaLista(c.ultima_em)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1.5 py-0",
                          c.bot_ativo
                            ? "border-primary/30 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {c.bot_ativo ? "Robô" : "Humano"}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground truncate flex-1">
                        {c.ultima_texto || "Sem mensagens"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Chat */}
      <section
        className={cn(
          "flex-1 flex flex-col min-w-0 min-h-0 bg-background",
          !chatAberto && "hidden md:flex",
        )}
      >
        {selecionada || selectedTel ? (
          <>
            <header className="h-14 border-b px-3 flex items-center gap-2 shrink-0 bg-card">
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={fecharMobile}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {leadAtivo?.empresa || leadAtivo?.nome || selectedTel}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {selectedTel}
                  {leadAtivo ? ` · ${leadAtivo.nome}` : ""}
                </p>
              </div>
            </header>
            <div className="flex-1 min-h-0">
              <AtendimentoTab whatsapp={selectedTel} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <MessageCircle className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground">Selecione uma conversa</p>
            <p className="text-xs mt-1 max-w-xs">
              Inbox único de WhatsApp. Pipeline e fila de leads continuam nas telas originais.
            </p>
          </div>
        )}
      </section>

      {/* Painel do lead */}
      <aside
        className={cn(
          "hidden lg:flex w-[22rem] border-l flex-col min-h-0 bg-card",
          !chatAberto && "lg:hidden",
        )}
      >
        <AtendimentoLeadPanel lead={leadAtivo} leadsCount={leadsSel.length} />
      </aside>
    </div>
  );
}
