import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { precisaEscolherAmbiente } from "@/lib/environments";
import { routeToScreenKey } from "@/lib/screen-permissions";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function AuthSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function ContaDesativada({ onSair }: { onSair: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full rounded-2xl border border-card-border bg-card p-8 text-center shadow-sm">
        <h2 className="text-lg font-bold text-foreground mb-2">Conta desativada</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Seu acesso ao sistema está desativado. Fale com um administrador para reativar a conta.
        </p>
        <button
          type="button"
          onClick={onSair}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, permissions, profile, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthSpinner />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (permissions.length === 0) {
    return <AuthSpinner />;
  }

  // Status da Gestão de Usuários: "Inativo" tira o acesso de verdade.
  // Só bloqueia com o perfil carregado e o campo explicitamente false.
  if (profile?.is_active === false) {
    return <ContaDesativada onSair={() => { void signOut(); }} />;
  }

  const onPicker = location.pathname === "/ambientes";
  if (!onPicker && precisaEscolherAmbiente(permissions)) {
    return <Navigate to="/ambientes" replace />;
  }

  // Check screen-level access
  const screenKey = routeToScreenKey(location.pathname);
  if (screenKey) {
    const perm = permissions.find((p) => p.screen_key === screenKey);
    if (perm && !perm.can_access) {
      // Redirecting to /dashboard would loop back here if the user also
      // lacks access to /dashboard, so render inline instead of navigating.
      if (screenKey === "dashboard") {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background p-8">
            <div className="max-w-md w-full rounded-2xl border border-card-border bg-card p-8 text-center shadow-sm">
              <h2 className="text-lg font-bold text-foreground mb-2">Sem acesso</h2>
              <p className="text-sm text-muted-foreground">
                Sua conta não tem permissão para acessar esta área. Fale com um administrador.
              </p>
            </div>
          </div>
        );
      }
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <ErrorBoundary>{children}</ErrorBoundary>;
}
