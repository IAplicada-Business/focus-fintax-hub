import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Se o Supabase entregar o token de recuperação em qualquer rota que não seja
 * /reset-password, manda o usuário para o formulário de nova senha.
 *
 * Isso cobre o caso em que a URL do `redirectTo` não está na allowlist do
 * projeto: o Supabase ignora o parâmetro e cai no Site URL (a landing page),
 * onde não existe formulário para trocar a senha.
 */
export function PasswordRecoveryRedirect(): null {
  const navigate = useNavigate();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") return;
      if (window.location.pathname === "/reset-password") return;
      navigate("/reset-password", { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
}
