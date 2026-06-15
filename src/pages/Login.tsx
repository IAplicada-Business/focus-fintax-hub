import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import logoWhite from "@/assets/logo-focus-fintax-white.png";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Erro ao entrar", { description: error.message });
    } else {
      navigate("/dashboard");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro", { description: error.message });
    } else {
      toast.success("E-mail enviado!", { description: "Verifique sua caixa de entrada." });
      setMode("login");
    }
  };

  const isForgot = mode === "forgot";

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden p-4"
      style={{ background: "#06081f" }}
    >
      {/* Component-scoped keyframes — sem pulsações */}
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

      {/* ─── Background layer: Focus logo as huge watermark (visible through card) ─── */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      >
        <img
          src={logoWhite}
          alt=""
          className="w-[78vmin] max-w-[820px] h-auto opacity-[0.22]"
          draggable={false}
        />
      </div>

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

      {/* ─── Center card (semi-transparente — logo aparece atrás mas inputs ficam legíveis) ─── */}
      <div
        className="relative z-10 w-full max-w-md p-7 sm:p-9 rounded-2xl border border-white/12 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65),0_1px_0_0_rgba(255,255,255,0.06)_inset] backdrop-blur-md"
        style={{
          background:
            "linear-gradient(180deg, rgba(6,8,31,0.55) 0%, rgba(6,8,31,0.72) 100%)",
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

        {/* Headline com glow gradient (red/red-soft/navy) — substitui o purple/pink/blue do NexusGate */}
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
            <span className="relative inline-block tracking-[-0.022em] text-white">
              {isForgot ? "Recuperar acesso" : "Entrar na Focus"}
            </span>
          </h1>
          <p className="text-sm text-white/65 leading-relaxed mt-2">
            {isForgot
              ? "Enviaremos um link para redefinir sua senha."
              : "Acesse a plataforma de inteligência tributária."}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d04545]" />
            Focus FinTax · Grupo Focus
          </div>
        </div>

        <form
          onSubmit={isForgot ? handleForgot : handleLogin}
          className="space-y-5"
        >
          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
              E-mail
            </label>
            <div className="relative group">
              <Mail
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/55 transition-colors group-focus-within:text-[#e06b6b]"
              />
              <input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-11 pr-3 py-3 h-12 bg-[rgba(6,8,31,0.6)] border border-white/15 rounded-xl text-white text-[15px] placeholder-white/45 transition-all duration-200 focus:outline-none focus:border-[#d04545]/55 focus:bg-[rgba(6,8,31,0.75)] focus:shadow-[0_0_0_3px_rgba(208,69,69,0.18)]"
              />
            </div>
          </div>

          {/* Password */}
          {!isForgot && (
            <div className="space-y-2">
              <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
                Senha
              </label>
              <div className="relative group">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/55 transition-colors group-focus-within:text-[#e06b6b]"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="current-password"
                  className="w-full pl-11 pr-11 py-3 h-12 bg-[rgba(6,8,31,0.6)] border border-white/15 rounded-xl text-white text-[15px] placeholder-white/45 transition-all duration-200 focus:outline-none focus:border-[#d04545]/55 focus:bg-[rgba(6,8,31,0.75)] focus:shadow-[0_0_0_3px_rgba(208,69,69,0.18)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/55 hover:text-white transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Forgot link inline */}
          {!isForgot && (
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-xs text-white/70 hover:text-white transition-colors font-medium"
              >
                Esqueceu a senha?
              </button>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-full text-white text-sm font-semibold tracking-[-0.005em] transition-all duration-200 ease-out hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#d04545]/55 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none shadow-[0_8px_24px_-8px_rgba(208,69,69,0.55)] hover:shadow-[0_14px_36px_-10px_rgba(208,69,69,0.65)] flex items-center justify-center gap-2"
            style={{
              background:
                "linear-gradient(180deg, #d04545 0%, #b53939 100%)",
            }}
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {isForgot ? "Enviar e-mail" : "Entrar na plataforma"}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Back to login (forgot mode) */}
        {isForgot && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-sm text-white/65 hover:text-white transition-colors font-medium"
            >
              ← Voltar ao login
            </button>
          </div>
        )}

        {/* Footer of card */}
        <p className="mt-7 text-center text-[11px] text-white/35 tracking-[0.08em] uppercase">
          © {new Date().getFullYear()} · Grupo Focus
        </p>
      </div>
    </div>
  );
}
