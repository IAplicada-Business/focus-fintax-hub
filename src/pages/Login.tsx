import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LogIn, Mail, Lock, ShieldCheck, Sparkles, Lock as LockKey } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo-focus-fintax.png";
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

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* ─── BRAND PANEL (left on desktop, top on mobile) ─── */}
      <aside
        className="relative overflow-hidden flex flex-col justify-between p-8 sm:p-12 lg:p-16 text-white"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(200,0,30,0.18) 0%, transparent 55%), radial-gradient(ellipse at 80% 90%, rgba(26,45,138,0.45) 0%, transparent 60%), linear-gradient(180deg, #0a1564 0%, #071040 100%)",
        }}
      >
        {/* subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <img
            src={logoWhite}
            alt="Focus FinTax"
            className="h-12 sm:h-14 w-auto select-none"
            draggable={false}
          />
        </div>

        <div className="relative z-10 max-w-xl py-12 lg:py-0">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 border border-white/12 backdrop-blur-sm text-[11px] font-bold uppercase tracking-[0.14em] text-white/85 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-dash-red" />
            Inteligência Tributária
          </div>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.05] tracking-[-0.028em] mb-5">
            Bem-vindo ao{" "}
            <span className="bg-gradient-to-r from-dash-red to-[#e06b6b] bg-clip-text text-transparent">
              Focus FinTax
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/72 leading-relaxed max-w-md">
            A plataforma de inteligência tributária e financeira para o varejo
            brasileiro. Diagnóstico, gestão de teses e operação em um único lugar.
          </p>

          <ul className="mt-10 space-y-3.5 text-sm text-white/75">
            <li className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-dash-red shrink-0 mt-0.5" />
              <span>Segurança e conformidade em primeiro lugar</span>
            </li>
            <li className="flex items-start gap-3">
              <LockKey className="h-5 w-5 text-dash-red shrink-0 mt-0.5" />
              <span>Acesso baseado em papéis com auditoria completa</span>
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/45">
          © {new Date().getFullYear()} Focus FinTax · Grupo Focus
        </div>
      </aside>

      {/* ─── FORM PANEL (right on desktop) ─── */}
      <main className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile / fallback logo — appears only when brand panel is not visible */}
          <div className="flex justify-center lg:hidden -mt-2">
            <img
              src={logo}
              alt="Focus FinTax"
              className="h-24 w-auto select-none"
              draggable={false}
            />
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h1 className="font-display text-3xl sm:text-[2.25rem] font-extrabold text-foreground tracking-[-0.028em] leading-tight">
              {mode === "login" && "Entrar na sua conta"}
              {mode === "forgot" && "Recuperar senha"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {mode === "login" && "Informe seu e-mail e senha para acessar a plataforma."}
              {mode === "forgot" && "Enviaremos um link para redefinir a sua senha."}
            </p>
          </div>

          <form
            onSubmit={mode === "login" ? handleLogin : handleForgot}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                E-mail
              </Label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 h-12 rounded-xl border-border bg-muted/40 text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 ease-out-modern focus:bg-background focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Senha
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 pr-11 h-12 rounded-xl border-border bg-muted/40 text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 ease-out-modern focus:bg-background focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]"
                    required
                    minLength={6}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-full font-semibold text-sm bg-primary hover:bg-primary/90 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)] transition-all duration-150 ease-out-modern hover:shadow-[0_14px_36px_-10px_hsl(var(--primary)/0.55)] hover:-translate-y-0.5"
              disabled={loading}
            >
              {loading ? (
                <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  {mode === "login" && "Entrar"}
                  {mode === "forgot" && "Enviar e-mail"}
                </>
              )}
            </Button>
          </form>

          <div className="text-center lg:text-left text-sm">
            {mode === "login" ? (
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Esqueceu a senha?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode("login")}
                className="font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                ← Voltar ao login
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
