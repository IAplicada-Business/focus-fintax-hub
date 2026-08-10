import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, AuthLabel, AuthSubmitButton, authInputClass } from "@/components/auth/AuthShell";

const MIN_LEN = 6;

/** Se o link expirou ou já foi usado, o Supabase devolve o erro na query ou no hash. */
function readLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return (
    hash.get("error_description") ??
    query.get("error_description") ??
    hash.get("error") ??
    query.get("error")
  );
}

/** URL ainda carrega um token de recuperação que o client pode estar processando. */
function hasRecoveryParams(): boolean {
  return (
    window.location.hash.includes("access_token") ||
    window.location.hash.includes("type=recovery") ||
    new URLSearchParams(window.location.search).has("code")
  );
}

type Status = "verifying" | "ready" | "saving" | "invalid";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;

    // O client pode emitir PASSWORD_RECOVERY (fluxo implícito) depois deste
    // efeito rodar — por isso o listener é registrado antes da checagem.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setStatus((prev) => (prev === "verifying" ? "ready" : prev));
      }
    });

    // Rede de segurança: sem isso um token que nunca é processado deixaria a
    // tela presa no spinner para sempre.
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setStatus((prev) => (prev === "verifying" ? "invalid" : prev));
    }, 8000);

    (async () => {
      const err = readLinkError();
      if (err) {
        if (!active) return;
        setLinkError(err);
        setStatus("invalid");
        return;
      }

      // Fluxo PKCE: o ?code= precisa ser trocado por sessão explicitamente.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setLinkError(error.message);
          setStatus("invalid");
        } else {
          setStatus("ready");
        }
        return;
      }

      // Fluxo implícito: getSession aguarda a leitura do hash pelo client.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session) {
        setStatus("ready");
      } else if (!hasRecoveryParams()) {
        setStatus("invalid");
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não coincidem", { description: "Digite a mesma senha nos dois campos." });
      return;
    }
    setStatus("saving");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error("Não foi possível redefinir", { description: error.message });
      setStatus("ready");
      return;
    }
    // Remove o token da URL para o link não ser reaproveitado ao recarregar.
    window.history.replaceState({}, "", "/reset-password");
    toast.success("Senha redefinida!", { description: "Você já está conectado." });
    navigate("/dashboard", { replace: true });
  };

  if (status === "verifying") {
    return (
      <AuthShell title="Redefinir senha" subtitle="Validando seu link de recuperação...">
        <div className="flex justify-center py-4">
          <div className="h-8 w-8 border-4 border-white/70 border-t-transparent rounded-full animate-spin" />
        </div>
      </AuthShell>
    );
  }

  if (status === "invalid") {
    return (
      <AuthShell
        title="Link inválido ou expirado"
        subtitle="Este link de recuperação não é mais válido. Solicite um novo para continuar."
        footer={
          <button
            type="button"
            onClick={() => navigate("/auth", { replace: true })}
            className="text-sm text-white/65 hover:text-white transition-colors font-medium"
          >
            ← Voltar ao login
          </button>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-[#d04545]/35 bg-[rgba(208,69,69,0.10)] p-4">
          <AlertTriangle size={18} className="text-[#e06b6b] shrink-0 mt-0.5" />
          <p className="text-sm text-white/75 leading-relaxed">
            {linkError ?? "O link pode ter expirado, já ter sido usado ou estar incompleto."}
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Redefinir senha" subtitle="Escolha uma nova senha para acessar a plataforma.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <AuthLabel htmlFor="new-password">Nova senha</AuthLabel>
          <div className="relative group">
            <Lock
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/55 transition-colors group-focus-within:text-[#e06b6b]"
            />
            <input
              id="new-password"
              type={show ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_LEN}
              autoComplete="new-password"
              className={authInputClass(true)}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/55 hover:text-white transition-colors focus:outline-none"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="text-[11px] text-white/40">Mínimo de {MIN_LEN} caracteres.</p>
        </div>

        <div className="space-y-2">
          <AuthLabel htmlFor="confirm-password">Confirmar nova senha</AuthLabel>
          <div className="relative group">
            <Lock
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/55 transition-colors group-focus-within:text-[#e06b6b]"
            />
            <input
              id="confirm-password"
              type={show ? "text" : "password"}
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={MIN_LEN}
              autoComplete="new-password"
              className={authInputClass()}
            />
          </div>
        </div>

        <AuthSubmitButton loading={status === "saving"}>Salvar nova senha</AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
