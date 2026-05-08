import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getDefaultPermissions, type ScreenPermission } from "@/lib/screen-permissions";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  profile: { full_name: string; email: string; cargo: string } | null;
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
  const [profile, setProfile] = useState<{ full_name: string; email: string; cargo: string } | null>(null);
  const [permissions, setPermissions] = useState<ScreenPermission[]>([]);

  const fetchUserMeta = async (userId: string) => {
    const [{ data: roles }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, email, cargo").eq("user_id", userId).single(),
    ]);
    const role = roles?.[0]?.role ?? null;
    setUserRole(role);
    setProfile(prof ?? null);

    // Load screen permissions and merge with role defaults for completeness
    const { data: perms } = await supabase
      .from("user_permissions")
      .select("screen_key, can_access, read_only")
      .eq("user_id", userId);

    const defaults = getDefaultPermissions(role ?? "cliente");

    if (perms && perms.length > 0) {
      // Merge: use DB values where they exist, fill missing screens from role defaults
      const dbMap = new Map(perms.map((p) => [p.screen_key, p as ScreenPermission]));
      const merged = defaults.map((d) => dbMap.get(d.screen_key) ?? d);
      setPermissions(merged);
    } else {
      setPermissions(defaults);
    }
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
