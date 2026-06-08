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

      const callerId = claimsData.claims.sub as string;

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

    const upsertPermissions = async (userId: string, perms: { screen_key: string; can_access: boolean; read_only: boolean }[]) => {
      if (!perms || !Array.isArray(perms)) return;
      // Delete existing then insert new
      await serviceClient.from("user_permissions").delete().eq("user_id", userId);
      const rows = perms.map((p) => ({
        user_id: userId,
        screen_key: p.screen_key,
        can_access: p.can_access,
        read_only: p.read_only,
      }));
      if (rows.length > 0) {
        await serviceClient.from("user_permissions").insert(rows);
      }
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
        await serviceClient
          .from("user_roles")
          .insert({ user_id: userId, role });
      }

      // Upsert permissions
      await upsertPermissions(userId, permissions);

      return new Response(
        JSON.stringify({ success: true, user_id: userId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update") {
      const { user_id, full_name, cargo, role, current_role } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        await serviceClient
          .from("user_roles")
          .insert({ user_id, role });
      }

      // Upsert permissions
      await upsertPermissions(user_id, permissions);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use 'create' ou 'update'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
