import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEnvironment } from "@/hooks/useEnvironment";
import { AMBIENTE_HOME, AMBIENTE_LABEL, type Ambiente } from "@/lib/environments";
import { cn } from "@/lib/utils";

const CARDS: { ambiente: Ambiente; icon: typeof Briefcase; description: string }[] = [
  {
    ambiente: "comercial",
    icon: Briefcase,
    description: "Leads, marketing e atendimento.",
  },
  {
    ambiente: "operacional",
    icon: LayoutDashboard,
    description: "Dashboard, esteira e clientes.",
  },
];

export default function AmbienteSelect() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { disponiveis, setAmbiente, permissionsReady } = useEnvironment();

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

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden p-4"
      style={{ background: "#06081f" }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(1,15,105,0.55) 0%, transparent 70%), radial-gradient(ellipse 100% 60% at 50% 0%, rgba(14,18,53,1) 0%, transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full max-w-2xl text-center">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-3">
          Focus FinTax · Grupo Focus
        </p>
        <h1 className="text-2xl sm:text-[1.7rem] font-bold tracking-[-0.022em] text-white mb-2">
          Escolha o ambiente
        </h1>
        <p className="text-sm text-white/65 leading-relaxed mb-8">
          Cada ambiente mostra só as telas daquele contexto.
        </p>

        {!permissionsReady ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : disponiveis.length === 0 ? (
          <div className="rounded-2xl border border-white/12 bg-[rgba(6,8,31,0.62)] px-6 py-10 backdrop-blur-md">
            <p className="text-sm text-white/70">
              Sua conta não tem permissão para nenhum ambiente. Fale com um administrador.
            </p>
          </div>
        ) : disponiveis.length === 1 ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CARDS.filter((card) => disponiveis.includes(card.ambiente)).map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.ambiente}
                  type="button"
                  onClick={() => choose(card.ambiente)}
                  className={cn(
                    "group text-left rounded-2xl border border-white/12 p-6 backdrop-blur-md transition-all duration-200",
                    "hover:-translate-y-0.5 hover:border-[#d04545]/45 focus:outline-none focus:ring-2 focus:ring-[#d04545]/55",
                  )}
                  style={{
                    background: "linear-gradient(180deg, rgba(6,8,31,0.55) 0%, rgba(6,8,31,0.72) 100%)",
                  }}
                >
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      background: "rgba(208,69,69,0.16)",
                      border: "1px solid rgba(208,69,69,0.32)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-lg font-semibold text-white tracking-[-0.01em]">
                    {AMBIENTE_LABEL[card.ambiente]}
                  </p>
                  <p className="text-sm text-white/60 mt-1.5 mb-5">{card.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#e06b6b] group-hover:text-[#f08a8a]">
                    Entrar
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="mt-8 text-sm text-white/55 hover:text-white transition-colors font-medium"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
