import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const INPUT_BASE =
  "w-full pl-11 py-3 h-12 bg-[rgba(6,8,31,0.6)] border border-white/15 rounded-xl text-white text-[15px] placeholder-white/45 transition-all duration-200 focus:outline-none focus:border-[#d04545]/55 focus:bg-[rgba(6,8,31,0.75)] focus:shadow-[0_0_0_3px_rgba(208,69,69,0.18)]";

/** `withToggle` reserva espaço à direita para o botão de mostrar/ocultar senha. */
export function authInputClass(withToggle = false) {
  return cn(INPUT_BASE, withToggle ? "pr-11" : "pr-3");
}

export function AuthLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
      {children}
    </label>
  );
}

export function AuthSubmitButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-12 rounded-full text-white text-sm font-semibold tracking-[-0.005em] transition-all duration-200 ease-out hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#d04545]/55 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none shadow-[0_8px_24px_-8px_rgba(208,69,69,0.55)] hover:shadow-[0_14px_36px_-10px_rgba(208,69,69,0.65)] flex items-center justify-center gap-2"
      style={{ background: "linear-gradient(180deg, #d04545 0%, #b53939 100%)" }}
    >
      {loading ? (
        <div className="h-4 w-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
      ) : (
        <>
          {children}
          <ArrowRight size={16} />
        </>
      )}
    </button>
  );
}

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden p-4"
      style={{ background: "#06081f" }}
    >
      <style>{`
        @keyframes halo-orbit {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes fade-up-soft {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ─── Background layer: bottom radial navy depth ─── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(1,15,105,0.55) 0%, transparent 70%), radial-gradient(ellipse 100% 60% at 50% 0%, rgba(14,18,53,1) 0%, transparent 60%)",
        }}
      />

      {/* ─── Background layer: animated red orbit halo ─── */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          width: "min(1200px, 130vw)",
          aspectRatio: "1",
          background:
            "radial-gradient(circle at 38% 42%, rgba(208,69,69,0.22) 0%, rgba(208,69,69,0.06) 30%, transparent 55%)",
          filter: "blur(40px)",
          animation: "halo-orbit 32s linear infinite",
          willChange: "transform",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* ─── Background layer: grain noise overlay ─── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' stitchTiles='stitch' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "240px 240px",
        }}
      />

      {/* ─── Center card ─── */}
      <div
        className="relative z-10 w-full max-w-md p-7 sm:p-9 rounded-2xl border border-white/12 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65),0_1px_0_0_rgba(255,255,255,0.06)_inset] backdrop-blur-md"
        style={{
          background: "linear-gradient(180deg, rgba(6,8,31,0.55) 0%, rgba(6,8,31,0.72) 100%)",
          animation: "fade-up-soft .6s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* Subtle inner red accent stripe (mesmo do form da LP) */}
        <div
          aria-hidden
          className="absolute left-0 top-5 bottom-5 w-[2px] rounded-r"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, #d04545 22%, #e06b6b 78%, transparent 100%)",
            opacity: 0.7,
          }}
        />

        <div className="mb-7 text-center">
          <h1 className="text-2xl sm:text-[1.7rem] font-bold mb-2 relative group inline-block">
            <span
              aria-hidden
              className="absolute -inset-2 blur-xl opacity-60 transition-opacity duration-500 group-hover:opacity-90"
              style={{
                background:
                  "linear-gradient(90deg, rgba(208,69,69,0.45) 0%, rgba(224,107,107,0.35) 50%, rgba(1,15,105,0.45) 100%)",
              }}
            />
            <span className="relative inline-block tracking-[-0.022em] text-white">{title}</span>
          </h1>
          <p className="text-sm text-white/65 leading-relaxed mt-2">{subtitle}</p>
          <div className="mt-3 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d04545]" />
            Focus FinTax · Grupo Focus
          </div>
        </div>

        {children}

        {footer && <div className="mt-6 text-center">{footer}</div>}

        <p className="mt-7 text-center text-[11px] text-white/35 tracking-[0.08em] uppercase">
          © {new Date().getFullYear()} · Grupo Focus
        </p>
      </div>
    </div>
  );
}
