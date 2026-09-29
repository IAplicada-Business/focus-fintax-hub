import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { mergePermissions, type ScreenPermission } from "@/lib/screen-permissions";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  profile: { full_name: string; email: string; cargo: string; is_active?: boolean } | null;
  permissions: ScreenPermission[];
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  userRole: null,
  profile: null,
  permissions: [],
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; email: string; cargo: string; is_active?: boolean } | null>(null);
  const [permissions, setPermissions] = useState<ScreenPermission[]>([]);
  // Usuário cujo papel/perfil/permissões já foram (ou estão sendo) carregados.
  // `getSession` + INITIAL_SESSION + TOKEN_REFRESHED disparavam a mesma carga
  // várias vezes por sessão; cada carga trocava o array de permissões e
  // re-renderizava sidebar, ambiente e rotas protegidas à toa.
  const metaLoadedFor = useRef<string | null>(null);

  const fetchUserMeta = async (userId: string) => {
    if (metaLoadedFor.current === userId) return;
    metaLoadedFor.current = userId;
    const [{ data: roles }, { data: prof }, { data: perms }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      // is_active decide se a conta ainda entra (ver ProtectedRoute).
      supabase.from("profiles").select("full_name, email, cargo, is_active").eq("user_id", userId).single(),
      supabase.from("user_permissions").select("screen_key, can_access, read_only").eq("user_id", userId),
    ]);
    // Trocou de usuário enquanto carregava: descarta o resultado antigo.
    if (metaLoadedFor.current !== userId) return;
    const role = roles?.[0]?.role ?? null;
    setUserRole(role);
    setProfile(prof ?? null);
    // Telas gravadas mandam; o resto vem do padrão do papel.
    setPermissions(mergePermissions(role, (perms ?? []) as ScreenPermission[]));
  };

  const clearUserMeta = () => {
    metaLoadedFor.current = null;
    setUserRole(null);
    setProfile(null);
    setPermissions([]);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) void fetchUserMeta(s.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) void fetchUserMeta(s.user.id);
      else clearUserMeta();
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthContextType>(
    () => ({ user, session, loading, userRole, profile, permissions, signOut }),
    [user, session, loading, userRole, profile, permissions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
