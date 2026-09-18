import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, LayoutDashboard, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEnvironment } from "@/hooks/useEnvironment";
import { AMBIENTE_HOME, AMBIENTE_LABEL, type Ambiente } from "@/lib/environments";
import logoWhite from "@/assets/logo-agf-fintax-white.svg";
import { cn } from "@/lib/utils";

const ORDEM: Ambiente[] = ["comercial", "operacional"];

const META: Record<Ambiente, { icon: LucideIcon; description: string }> = {
  comercial: { icon: Briefcase, description: "Leads, atendimento e marketing" },
  operacional: { icon: LayoutDashboard, description: "Esteira, clientes e compensações" },
};

/**
 * Escolha de ambiente após o login: logo, seletor e dois cards compactos.
 * Setas navegam entre os ambientes e Enter entra no selecionado.
 */
export default function AmbienteSelect() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
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
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden p-6" style={{ background: "#08111d" }}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(28,49,80,0.55) 0%, transparent 70%), radial-gradient(ellipse 100% 60% at 50% 0%, rgba(16,28,46,1) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <img src={logoWhite} alt="AGF FinTax" className="h-16 w-auto object-contain select-none mb-8" draggable={false} />

        {carregando ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : opcoes.length === 0 ? (
          <div className="w-full rounded-2xl border border-white/12 bg-[rgba(8,17,29,0.62)] px-6 py-8 text-center">
            <p className="text-sm text-white/70">Sua conta não tem permissão para nenhum ambiente. Fale com um administrador.</p>
          </div>
        ) : (
          <>
            {/* Seletor dos ambientes */}
            <div role="tablist" aria-label="Ambientes" className="inline-flex rounded-full bg-white/[0.05] ring-1 ring-inset ring-white/[0.1] p-1 mb-5">
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
                      "px-4 h-8 rounded-full text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors",
                      ativo ? "bg-[rgba(198,150,79,0.18)] text-white ring-1 ring-inset ring-[rgba(198,150,79,0.45)]" : "text-white/50 hover:text-white",
                    )}
                  >
                    {AMBIENTE_LABEL[a]}
                  </button>
                );
              })}
            </div>

            {/* Cards compactos */}
            <div
              role="listbox"
              aria-label="Ambientes disponíveis"
              aria-activedescendant={selecionado ? `ambiente-${selecionado}` : undefined}
              tabIndex={0}
              onKeyDown={onKeyDown}
              className="w-full flex flex-col gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#c6964f]/50 rounded-2xl"
            >
              {opcoes.map((a) => {
                const meta = META[a];
                const Icon = meta.icon;
                const ativo = selecionado === a;
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
                      "group relative w-full text-left rounded-2xl border flex items-center gap-4 px-4 py-3.5 transition-all duration-200 overflow-hidden focus:outline-none",
                      ativo ? "border-[#c6964f]/55 bg-[rgba(198,150,79,0.07)]" : "border-white/10 bg-[rgba(8,17,29,0.55)] hover:border-white/20",
                    )}
                  >
                    <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px] transition-colors", ativo ? "bg-[#c6964f]" : "bg-transparent")} />
                    <div
                      className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", ativo ? "bg-[rgba(198,150,79,0.2)]" : "bg-[rgba(198,150,79,0.1)]")}
                      style={{ border: "1px solid rgba(198,150,79,0.32)" }}
                    >
                      <Icon className={cn("h-[18px] w-[18px]", ativo ? "text-[#e6c48a]" : "text-white")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-white tracking-[-0.01em] leading-tight">{AMBIENTE_LABEL[a]}</p>
                      <p className="text-xs text-white/50 mt-0.5 truncate">{meta.description}</p>
                    </div>
                    <ArrowRight className={cn("h-4 w-4 shrink-0 transition-all", ativo ? "text-[#e6c48a] translate-x-0.5" : "text-white/35 group-hover:text-white/70 group-hover:translate-x-0.5")} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button type="button" onClick={handleLogout} className="mt-8 text-xs text-white/40 hover:text-white transition-colors font-medium">
          Sair
        </button>
      </div>
    </div>
  );
}
