import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { routeToScreenKey } from "@/lib/screen-permissions";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, permissions } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check screen-level access
  const screenKey = routeToScreenKey(location.pathname);
  if (screenKey) {
    const perm = permissions.find((p) => p.screen_key === screenKey);
    if (perm && !perm.can_access) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <ErrorBoundary>{children}</ErrorBoundary>;
}
