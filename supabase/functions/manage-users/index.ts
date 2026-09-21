import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let callerId: string | null = null;
    const bearerToken = authHeader.replace("Bearer ", "");
    const seedKey = req.headers.get("x-seed-key");
    const isServiceRole = bearerToken === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || 
                          seedKey === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!isServiceRole) {
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(bearerToken);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      callerId = claimsData.claims.sub as string;

      const { data: roleCheck } = await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { action, permissions } = body;

    /**
     * Grava as permissões. Devolve a mensagem de erro, ou null quando deu certo:
     * antes o insert era disparado sem conferir, e uma falha depois do delete
     * deixava o usuário sem nenhuma permissão, sem ninguém saber.
     */
    const upsertPermissions = async (
      userId: string,
      perms: { screen_key: string; can_access: boolean; read_only: boolean }[],
    ): Promise<string | null> => {
      if (!perms || !Array.isArray(perms) || perms.length === 0) return null;

      const rows = perms.map((p) => ({
        user_id: userId,
        screen_key: p.screen_key,
        can_access: p.can_access,
        read_only: p.read_only,
      }));

      // Upsert na chave única (user_id, screen_key): nunca existe um instante
      // com o usuário sem permissão alguma.
      const { error: upErr } = await serviceClient
        .from("user_permissions")
        .upsert(rows, { onConflict: "user_id,screen_key" });
      if (upErr) return upErr.message;

      // Tira só o que saiu da lista (telas removidas do sistema), nomeando
      // cada chave: um filtro negativo malformado apagaria tudo.
      const { data: atuais } = await serviceClient
        .from("user_permissions")
        .select("screen_key")
        .eq("user_id", userId);

      const novas = new Set(rows.map((r) => r.screen_key));
      const sobrando = (atuais ?? []).map((r) => r.screen_key).filter((k: string) => !novas.has(k));

      if (sobrando.length > 0) {
        const { error: delErr } = await serviceClient
          .from("user_permissions")
          .delete()
          .eq("user_id", userId)
          .in("screen_key", sobrando);
        if (delErr) return delErr.message;
      }

      return null;
    };

    if (action === "create") {
      const { email, password, full_name, cargo, role } = body;

      if (!email || !password || password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Email e senha (mín. 6 caracteres) são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: newUser, error: createErr } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || "" },
      });

      if (createErr) {
        const msg = createErr.message || "";
        const alreadyExists = /already.*registered|already exists|duplicate/i.test(msg);
        if (alreadyExists) {
          return new Response(
            JSON.stringify({ error: "Já existe um usuário cadastrado com este e-mail." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = newUser.user.id;

      if (cargo) {
        await serviceClient
          .from("profiles")
          .update({ cargo })
          .eq("user_id", userId);
      }

      if (role && role !== "cliente") {
        await serviceClient
          .from("user_roles")
          .delete()
          .eq("user_id", userId);
        const { error: roleErr } = await serviceClient
          .from("user_roles")
          .insert({ user_id: userId, role });
        if (roleErr) {
          return new Response(
            JSON.stringify({ error: `Usuário criado, mas falhou ao gravar o perfil de acesso: ${roleErr.message}`, user_id: userId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const permErr = await upsertPermissions(userId, permissions);
      if (permErr) {
        return new Response(
          JSON.stringify({ error: `Usuário criado, mas as permissões não foram salvas: ${permErr}`, user_id: userId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, user_id: userId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update") {
      const { user_id, full_name, cargo, role, current_role, password } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Redefinição de senha pelo admin (quem foi criado e "não entra").
      if (password !== undefined && password !== "") {
        if (typeof password !== "string" || password.length < 6) {
          return new Response(
            JSON.stringify({ error: "A nova senha precisa ter pelo menos 6 caracteres" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { error: pwErr } = await serviceClient.auth.admin.updateUserById(user_id, {
          password,
          email_confirm: true,
        });
        if (pwErr) {
          return new Response(
            JSON.stringify({ error: `Falha ao redefinir a senha: ${pwErr.message}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      await serviceClient
        .from("profiles")
        .update({ full_name, cargo })
        .eq("user_id", user_id);

      if (role && role !== current_role) {
        await serviceClient
          .from("user_roles")
          .delete()
          .eq("user_id", user_id);
        const { error: roleErr } = await serviceClient
          .from("user_roles")
          .insert({ user_id, role });
        if (roleErr) {
          return new Response(
            JSON.stringify({ error: `Falha ao gravar o perfil de acesso: ${roleErr.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const permErr = await upsertPermissions(user_id, permissions);
      if (permErr) {
        return new Response(
          JSON.stringify({ error: `As permissões não foram salvas: ${permErr}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (callerId && callerId === user_id) {
        return new Response(
          JSON.stringify({ error: "Você não pode excluir a própria conta." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sobra um admin? Excluir o último tranca a gestão de usuários pra todo mundo.
      const { data: alvoRoles } = await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id);

      if ((alvoRoles ?? []).some((r) => r.role === "admin")) {
        const { count } = await serviceClient
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) {
          return new Response(
            JSON.stringify({ error: "Este é o último administrador. Promova outra pessoa antes de excluir." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // profiles, user_roles e user_permissions saem em cascata; o que aponta
      // pra este usuário em clientes/histórico vira NULL (ON DELETE SET NULL).
      const { error: delErr } = await serviceClient.auth.admin.deleteUser(user_id);
      if (delErr) {
        return new Response(
          JSON.stringify({ error: delErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use 'create', 'update' ou 'delete'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
