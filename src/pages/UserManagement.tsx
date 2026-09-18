import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Shield, Users as UsersIcon } from "lucide-react";
import { SCREENS, getDefaultPermissions, type ScreenPermission } from "@/lib/screen-permissions";

interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  cargo: string;
  is_active: boolean;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  pmo: "PMO",
  gestor_tributario: "Gestor Tributário",
  comercial: "Comercial",
  cliente: "Cliente",
};

/**
 * `supabase.functions.invoke` devolve `data = null` quando a função responde
 * com status != 2xx; a mensagem real ({ error }) fica no corpo em `error.context`.
 * Sem isto a tela mostrava só "Edge Function returned a non-2xx status code".
 */
async function mensagemDaFuncao(error: unknown, data: { error?: string } | null): Promise<string> {
  if (data?.error) return data.error;
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo não é JSON */
    }
  }
  return (error as { message?: string } | null)?.message ?? "Erro desconhecido";
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-secondary/10 text-secondary border-secondary/20",
  pmo: "bg-primary/10 text-primary border-primary/20",
  gestor_tributario: "bg-accent text-accent-foreground",
  comercial: "bg-muted text-muted-foreground border-muted-foreground/20",
  cliente: "bg-muted text-muted-foreground",
};

export default function UserManagement() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formCargo, setFormCargo] = useState("");
  const [formRole, setFormRole] = useState("cliente");
  const [formPassword, setFormPassword] = useState("");
  const [formPermissions, setFormPermissions] = useState<ScreenPermission[]>(getDefaultPermissions("cliente"));
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, cargo, is_active");

    if (pErr) {
      toast.error("Erro ao carregar usuários");
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    const roleMap = new Map<string, string>();
    roles?.forEach((r) => roleMap.set(r.user_id, r.role));

    const merged: UserRow[] = (profiles ?? []).map((p) => ({
      ...p,
      role: roleMap.get(p.user_id) ?? "visualizador",
    }));

    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const loadUserPermissions = async (userId: string, role: string) => {
    const { data } = await supabase
      .from("user_permissions")
      .select("screen_key, can_access, read_only")
      .eq("user_id", userId);

    if (data && data.length > 0) {
      setFormPermissions(data as ScreenPermission[]);
    } else {
      setFormPermissions(getDefaultPermissions(role));
    }
  };

  const openEdit = async (u: UserRow) => {
    setEditUser(u);
    setFormName(u.full_name);
    setFormEmail(u.email);
    setFormCargo(u.cargo);
    setFormRole(u.role);
    setFormPassword("");
    await loadUserPermissions(u.user_id, u.role);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditUser(null);
    setFormName("");
    setFormEmail("");
    setFormCargo("");
    setFormRole("cliente");
    setFormPassword("");
    setFormPermissions(getDefaultPermissions("cliente"));
    setDialogOpen(true);
  };

  const handleRoleChange = (newRole: string) => {
    setFormRole(newRole);
    // Auto-fill default permissions when role changes (only if not editing with custom perms)
    setFormPermissions(getDefaultPermissions(newRole));
  };

  const toggleAccess = (screenKey: string) => {
    setFormPermissions((prev) =>
      prev.map((p) =>
        p.screen_key === screenKey
          ? { ...p, can_access: !p.can_access, read_only: !p.can_access ? p.read_only : false }
          : p
      )
    );
  };

  const toggleReadOnly = (screenKey: string) => {
    setFormPermissions((prev) =>
      prev.map((p) =>
        p.screen_key === screenKey ? { ...p, read_only: !p.read_only } : p
      )
    );
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);

    if (editUser) {
      if (formPassword && formPassword.length < 6) {
        toast.error("A nova senha precisa ter pelo menos 6 caracteres");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "update",
          user_id: editUser.user_id,
          full_name: formName,
          cargo: formCargo,
          role: formRole,
          current_role: editUser.role,
          permissions: formPermissions,
          // Só vai quando o admin digitou uma senha nova.
          ...(formPassword ? { password: formPassword } : {}),
        },
      });

      if (error || data?.error) {
        toast.error("Erro ao atualizar usuário", { description: await mensagemDaFuncao(error, data) });
        setSaving(false);
        return;
      }

      toast.success(formPassword ? "Usuário atualizado e senha redefinida!" : "Usuário atualizado!");
    } else {
      if (!formEmail || !formPassword || formPassword.length < 6) {
        toast.error("E-mail e senha (mín. 6 caracteres) são obrigatórios");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create",
          email: formEmail,
          password: formPassword,
          full_name: formName,
          cargo: formCargo,
          role: formRole,
          permissions: formPermissions,
        },
      });

      if (error || data?.error) {
        const msg = await mensagemDaFuncao(error, data);
        const jaExiste = /já existe/i.test(msg);
        toast.error(jaExiste ? "Este e-mail já tem usuário" : "Erro ao criar usuário", {
          description: jaExiste ? "Ele já está na lista. Use o lápis para editar ou redefinir a senha." : msg,
        });
        if (jaExiste) {
          // Leva o admin direto pro usuário existente em vez de deixar o modal preso.
          setSearch(formEmail.trim());
          setDialogOpen(false);
        }
        setSaving(false);
        return;
      }

      toast.success("Usuário criado com sucesso!");
    }

    setSaving(false);
    setDialogOpen(false);
    fetchUsers();
  };

  const handleToggleActive = async (u: UserRow) => {
    if (!isAdmin) return;
    await supabase.from("profiles").update({ is_active: !u.is_active }).eq("user_id", u.user_id);
    toast.success(u.is_active ? "Usuário desativado" : "Usuário ativado");
    fetchUsers();
  };

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.cargo.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-xl font-bold text-navy">Gestão de Usuários</h1>
        <Card className="border-card-border">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-body-text font-medium">Você não tem permissão para acessar esta página.</p>
            <p className="text-muted-foreground text-sm mt-1">Apenas administradores podem gerenciar usuários.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-navy">Gestão de Usuários</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">permissões e acessos do sistema</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="font-semibold">
              <Plus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                {editUser ? "Editar Usuário" : "Novo Usuário"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="font-semibold">Nome completo</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome do usuário" />
              </div>
              {!editUser ? (
                <>
                  <div className="space-y-2">
                    <Label className="font-semibold">E-mail</Label>
                    <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@empresa.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Senha inicial</Label>
                    <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} required />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label className="font-semibold">Redefinir senha <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input type="password" autoComplete="new-password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Deixe em branco para manter a atual" minLength={6} />
                  <p className="text-xs text-muted-foreground">Use quando o usuário não consegue entrar: a senha nova vale na hora, sem e-mail de confirmação.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="font-semibold">Cargo</Label>
                <Input value={formCargo} onChange={(e) => setFormCargo(e.target.value)} placeholder="Ex: Analista Fiscal" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Perfil de acesso</Label>
                <Select value={formRole} onValueChange={handleRoleChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="pmo">PMO</SelectItem>
                    <SelectItem value="gestor_tributario">Gestor Tributário</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Screen Permissions */}
              <div className="space-y-3 pt-2 border-t">
                <Label className="font-semibold text-sm">Permissões de Tela</Label>
                <p className="text-xs text-muted-foreground">Marque as telas que este usuário pode acessar. "Somente leitura" impede edições.</p>
              <div className="space-y-2">
                  {SCREENS.map((screen) => {
                    const perm = formPermissions.find((p) => p.screen_key === screen.key);
                    const hasAccess = perm?.can_access ?? false;
                    const readOnly = perm?.read_only ?? false;
                    return (
                      <div key={screen.key}>
                        <div className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={hasAccess}
                              onCheckedChange={() => toggleAccess(screen.key)}
                              id={`access-${screen.key}`}
                            />
                            <label
                              htmlFor={`access-${screen.key}`}
                              className={`text-sm cursor-pointer ${hasAccess ? "text-foreground font-medium" : "text-muted-foreground line-through"}`}
                            >
                              {screen.label}
                            </label>
                          </div>
                          {hasAccess && (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={readOnly}
                                onCheckedChange={() => toggleReadOnly(screen.key)}
                                id={`ro-${screen.key}`}
                              />
                              <label htmlFor={`ro-${screen.key}`} className="text-xs text-muted-foreground cursor-pointer">
                                Somente leitura
                              </label>
                            </div>
                          )}
                        </div>
                        {hasAccess && screen.children && screen.children.length > 0 && (
                          <div className="ml-6 mt-1 space-y-1">
                            {screen.children.map((child) => {
                              const cPerm = formPermissions.find((p) => p.screen_key === child.key);
                              const cAccess = cPerm?.can_access ?? false;
                              const cReadOnly = cPerm?.read_only ?? false;
                              return (
                                <div key={child.key} className="flex items-center justify-between py-1 px-3 rounded-md bg-muted/20">
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      checked={cAccess}
                                      onCheckedChange={() => toggleAccess(child.key)}
                                      id={`access-${child.key}`}
                                    />
                                    <label
                                      htmlFor={`access-${child.key}`}
                                      className={`text-xs cursor-pointer ${cAccess ? "text-foreground font-medium" : "text-muted-foreground line-through"}`}
                                    >
                                      ↳ {child.label}
                                    </label>
                                  </div>
                                  {cAccess && (
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        checked={cReadOnly}
                                        onCheckedChange={() => toggleReadOnly(child.key)}
                                        id={`ro-${child.key}`}
                                      />
                                      <label htmlFor={`ro-${child.key}`} className="text-xs text-muted-foreground cursor-pointer">
                                        Somente leitura
                                      </label>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button onClick={handleSave} className="w-full font-bold" disabled={saving}>
                {saving ? "Salvando..." : editUser ? "Salvar alterações" : "Criar usuário"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: users.length, icon: UsersIcon },
          { label: "Ativos", value: users.filter((u) => u.is_active).length, icon: UsersIcon },
          { label: "Admins", value: users.filter((u) => u.role === "admin").length, icon: Shield },
          { label: "Inativos", value: users.filter((u) => !u.is_active).length, icon: UsersIcon },
        ].map((s) => (
          <Card key={s.label} className="card-base">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground">{s.value}</p>
                <p className="text-xs text-body-text font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="card-base">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg font-bold">Usuários Cadastrados</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Nome</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">E-mail</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Cargo</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Perfil</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs">Status</TableHead>
                  <TableHead className="font-semibold uppercase tracking-wider text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-body-text py-8">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-semibold text-foreground">{u.full_name || "—"}</TableCell>
                      <TableCell className="text-body-text">{u.email}</TableCell>
                      <TableCell className="text-body-text">{u.cargo || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ROLE_COLORS[u.role]}>
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? "default" : "secondary"} className="text-xs">
                          {u.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggleActive(u)}>
                          <Trash2 className="h-4 w-4 text-secondary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
