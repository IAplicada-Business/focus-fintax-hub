import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  const fetchUserMeta = async (userId: string) => {
    const [{ data: roles }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      // is_active decide se a conta ainda entra (ver ProtectedRoute).
      supabase.from("profiles").select("full_name, email, cargo, is_active").eq("user_id", userId).single(),
    ]);
    const role = roles?.[0]?.role ?? null;
    setUserRole(role);
    setProfile(prof ?? null);

    // Load screen permissions and merge with role defaults for completeness
    const { data: perms } = await supabase
      .from("user_permissions")
      .select("screen_key, can_access, read_only")
      .eq("user_id", userId);

    // Telas gravadas mandam; o resto vem do padrão do papel.
    setPermissions(mergePermissions(role, (perms ?? []) as ScreenPermission[]));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchUserMeta(s.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchUserMeta(s.user.id);
      else {
        setUserRole(null);
        setProfile(null);
        setPermissions([]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, profile, permissions, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
