import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, AuthLabel, AuthSubmitButton, authInputClass } from "@/components/auth/AuthShell";

function safeNext(raw: string | null): string {
  if (!raw) return "/ambientes";
  // Only allow same-origin relative paths.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/ambientes";
  return raw;
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
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
      navigate(nextPath);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
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
    <AuthShell
      title={isForgot ? "Recuperar acesso" : "Entrar na Focus"}
      subtitle={
        isForgot
          ? "Enviaremos um link para redefinir sua senha."
          : "Acesse a plataforma de inteligência tributária."
      }
      footer={
        isForgot ? (
          <button
            type="button"
            onClick={() => setMode("login")}
            className="text-sm text-white/65 hover:text-white transition-colors font-medium"
          >
            ← Voltar ao login
          </button>
        ) : undefined
      }
    >
      <form onSubmit={isForgot ? handleForgot : handleLogin} className="space-y-5">
        <div className="space-y-2">
          <AuthLabel htmlFor="email">E-mail</AuthLabel>
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
              className={authInputClass()}
            />
          </div>
        </div>

        {!isForgot && (
          <div className="space-y-2">
            <AuthLabel htmlFor="password">Senha</AuthLabel>
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
                className={authInputClass(true)}
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

        <AuthSubmitButton loading={loading}>
          {isForgot ? "Enviar e-mail" : "Entrar na plataforma"}
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
