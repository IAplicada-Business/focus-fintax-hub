import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LogIn, Mail, Lock } from "lucide-react";
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
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* ─── BRAND PANEL ─── */}
      <aside
        className="relative hidden lg:flex items-center justify-center overflow-hidden"
        style={{ background: "#0a1564" }}
      >
        <img
          src={logoWhite}
          alt="Focus FinTax"
          className="relative z-10 w-[58%] max-w-[420px] h-auto select-none"
          draggable={false}
        />
        <div className="absolute bottom-8 left-0 right-0 text-center text-[11px] tracking-[0.14em] uppercase font-semibold text-white/40">
          Grupo Focus · {new Date().getFullYear()}
        </div>
      </aside>

      {/* ─── FORM PANEL ─── */}
      <main className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
        <div className="w-full max-w-sm space-y-10">
          {/* Mobile logo */}
          <div className="flex justify-center lg:hidden">
            <img
              src={logo}
              alt="Focus FinTax"
              className="h-28 w-auto select-none"
              draggable={false}
            />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-[1.375rem] font-semibold text-foreground tracking-[-0.018em] leading-tight">
              {mode === "login" ? "Entrar" : "Recuperar senha"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {mode === "login"
                ? "Acesse a plataforma com seu e-mail e senha."
                : "Enviaremos um link para redefinir sua senha."}
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
                  className="pl-11 h-12 rounded-xl border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 ease-out-modern focus:bg-background focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]"
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
                    className="pl-11 pr-11 h-12 rounded-xl border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 ease-out-modern focus:bg-background focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]"
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
                  {mode === "login" ? "Entrar" : "Enviar e-mail"}
                </>
              )}
            </Button>
          </form>

          <div className="text-sm">
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
