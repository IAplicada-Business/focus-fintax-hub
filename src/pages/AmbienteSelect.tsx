import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, LayoutDashboard, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEnvironment } from "@/hooks/useEnvironment";
import { AMBIENTE_HOME, AMBIENTE_LABEL, menuDoAmbiente, type Ambiente } from "@/lib/environments";
import type { ScreenPermission } from "@/lib/screen-permissions";
import logoWhite from "@/assets/logo-agf-fintax-white.svg";
import { cn } from "@/lib/utils";

const ORDEM: Ambiente[] = ["comercial", "operacional"];

const META: Record<Ambiente, { icon: LucideIcon; eyebrow: string; description: string }> = {
  comercial: {
    icon: Briefcase,
    eyebrow: "Captação e relacionamento",
    description: "Funil de leads, atendimento no WhatsApp, marketing e a visão comercial do dashboard.",
  },
  operacional: {
    icon: LayoutDashboard,
    eyebrow: "Execução da carteira",
    description: "Esteira administrativa, clientes, compensações, teses e as visões operacional e executiva.",
  },
};

/** Telas do ambiente que o usuário realmente acessa (para os chips do card). */
function telasDoAmbiente(ambiente: Ambiente, permissions: ScreenPermission[]): string[] {
  const pode = (key?: string) => {
    if (!key) return true;
    const perm = permissions.find((p) => p.screen_key === key);
    return perm ? perm.can_access : true;
  };
  const titulos: string[] = [];
  for (const item of menuDoAmbiente(ambiente)) {
    const filhos = (item.children ?? []).filter((c) => pode(c.screenKey)).map((c) => c.title);
    if (item.url && pode(item.screenKey)) titulos.push(item.title);
    titulos.push(...filhos);
  }
  return Array.from(new Set(titulos));
}

/**
 * Escolha de ambiente após o login. Cards horizontais empilhados — um por
 * ambiente — com o que cada um abre; setas ↑/↓ navegam e Enter entra.
 */
export default function AmbienteSelect() {
  const navigate = useNavigate();
  const { signOut, permissions } = useAuth();
  const { disponiveis, setAmbiente, permissionsReady } = useEnvironment();

  const opcoes = useMemo(() => ORDEM.filter((a) => disponiveis.includes(a)), [disponiveis]);
  const [foco, setFoco] = useState<Ambiente | null>(null);
  const selecionado = foco && opcoes.includes(foco) ? foco : opcoes[0] ?? null;

  useEffect(() => {
    if (!permissionsReady) return;
    if (disponiveis.length === 1) {
      setAmbiente(disponiveis[0]);
      navigate(AMBIENTE_HOME[disponiveis[0]], { replace: true });
    }
  }, [disponiveis, navigate, permissionsReady, setAmbiente]);

  const choose = (ambiente: Ambiente) => {
    setAmbiente(ambiente);
    navigate(AMBIENTE_HOME[ambiente]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selecionado || opcoes.length === 0) return;
    const i = opcoes.indexOf(selecionado);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setFoco(opcoes[(i + 1) % opcoes.length]);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setFoco(opcoes[(i - 1 + opcoes.length) % opcoes.length]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(selecionado);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const carregando = !permissionsReady || disponiveis.length === 1;

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden p-4 sm:p-8" style={{ background: "#08111d" }}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(28,49,80,0.55) 0%, transparent 70%), radial-gradient(ellipse 100% 60% at 50% 0%, rgba(16,28,46,1) 0%, transparent 60%)",
        }}
      />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c6964f]/60 to-transparent" />

      <div className="relative z-10 w-full max-w-3xl">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
          <div>
            <img src={logoWhite} alt="AGF FinTax" className="h-12 w-auto object-contain select-none mb-4" draggable={false} />
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#d9b06e] font-bold mb-2">AGF FinTax · Grupo AGF</p>
            <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-[-0.022em] text-white">Escolha o ambiente</h1>
            <p className="text-sm text-white/60 leading-relaxed mt-1.5 max-w-md">
              Cada ambiente mostra só as telas daquele contexto. Dá pra trocar depois pelo menu lateral.
            </p>
          </div>
          {!carregando && opcoes.length > 1 && (
            <div role="tablist" aria-label="Ambientes" className="inline-flex self-start sm:self-auto rounded-full bg-white/[0.05] ring-1 ring-inset ring-white/[0.1] p-1">
              {opcoes.map((a) => {
                const ativo = selecionado === a;
                return (
                  <button
                    key={a}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    onClick={() => setFoco(a)}
                    className={cn(
                      "px-3.5 h-8 rounded-full text-[11px] font-semibold tracking-[0.04em] uppercase transition-colors",
                      ativo ? "bg-[rgba(198,150,79,0.18)] text-white ring-1 ring-inset ring-[rgba(198,150,79,0.45)]" : "text-white/55 hover:text-white",
                    )}
                  >
                    {AMBIENTE_LABEL[a]}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {carregando ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : opcoes.length === 0 ? (
          <div className="rounded-2xl border border-white/12 bg-[rgba(8,17,29,0.62)] px-6 py-10 backdrop-blur-md text-center">
            <p className="text-sm text-white/70">Sua conta não tem permissão para nenhum ambiente. Fale com um administrador.</p>
          </div>
        ) : (
          <div role="listbox" aria-label="Ambientes disponíveis" aria-activedescendant={selecionado ? `ambiente-${selecionado}` : undefined} tabIndex={0} onKeyDown={onKeyDown} className="flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-[#c6964f]/50 rounded-2xl">
            {opcoes.map((a, idx) => {
              const meta = META[a];
              const Icon = meta.icon;
              const ativo = selecionado === a;
              const telas = telasDoAmbiente(a, permissions);
              return (
                <button
                  key={a}
                  id={`ambiente-${a}`}
                  type="button"
                  role="option"
                  aria-selected={ativo}
                  onMouseEnter={() => setFoco(a)}
                  onFocus={() => setFoco(a)}
                  onClick={() => choose(a)}
                  className={cn(
                    "group relative w-full text-left rounded-2xl border backdrop-blur-md transition-all duration-200 overflow-hidden",
                    "flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 px-5 sm:px-6 py-5",
                    "focus:outline-none",
                    ativo ? "border-[#c6964f]/55 shadow-[0_18px_50px_-24px_rgba(198,150,79,0.45)] sm:translate-x-1" : "border-white/10 hover:border-white/20",
                  )}
                  style={{ background: ativo ? "linear-gradient(90deg, rgba(198,150,79,0.10) 0%, rgba(8,17,29,0.70) 55%)" : "linear-gradient(180deg, rgba(8,17,29,0.55) 0%, rgba(8,17,29,0.72) 100%)" }}
                >
                  <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1 transition-colors", ativo ? "bg-[#c6964f]" : "bg-transparent group-hover:bg-white/15")} />

                  <div className="flex items-center gap-4 sm:w-[228px] shrink-0">
                    <div
                      className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-colors", ativo ? "bg-[rgba(198,150,79,0.22)]" : "bg-[rgba(198,150,79,0.12)]")}
                      style={{ border: "1px solid rgba(198,150,79,0.34)" }}
                    >
                      <Icon className={cn("h-5 w-5", ativo ? "text-[#e6c48a]" : "text-white")} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold">{String(idx + 1).padStart(2, "0")} · {meta.eyebrow}</p>
                      <p className="text-lg font-semibold text-white tracking-[-0.01em] leading-tight mt-0.5">{AMBIENTE_LABEL[a]}</p>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/65 leading-relaxed">{meta.description}</p>
                    {telas.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {telas.map((t) => (
                          <span key={t} className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/[0.08] text-white/70">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold shrink-0 self-start sm:self-center transition-colors", ativo ? "text-[#e6c48a]" : "text-[#d9b06e] group-hover:text-[#e6c48a]")}>
                    Entrar
                    <ArrowRight className={cn("h-4 w-4 transition-transform", ativo ? "translate-x-0.5" : "group-hover:translate-x-0.5")} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-7 flex items-center justify-between text-sm">
          <span className="text-white/35 text-xs hidden sm:inline">↑ ↓ para navegar · Enter para entrar</span>
          <button type="button" onClick={handleLogout} className="text-white/55 hover:text-white transition-colors font-medium">
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
