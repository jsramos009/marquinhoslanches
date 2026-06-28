import { createFileRoute } from "@tanstack/react-router";

const ADMIN_EMAIL = "josegabrielramos2004@gmail.com";

export const Route = createFileRoute("/api/public/set-admin-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as
          | { email?: string; password?: string }
          | null;
        const email = (body?.email ?? "").trim().toLowerCase();
        const password = body?.password ?? "";

        if (email !== ADMIN_EMAIL.toLowerCase()) {
          return Response.json(
            { ok: false, error: "Cadastro liberado apenas para o e-mail do administrador principal." },
            { status: 403 },
          );
        }
        if (password.length < 6) {
          return Response.json(
            { ok: false, error: "Senha precisa ter ao menos 6 caracteres." },
            { status: 400 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find or create the auth user
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) {
          return Response.json({ ok: false, error: listErr.message }, { status: 500 });
        }
        let userId =
          list.users.find((u) => (u.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase())?.id;

        if (userId) {
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
          });
          if (updErr) {
            return Response.json({ ok: false, error: updErr.message }, { status: 500 });
          }
        } else {
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password,
            email_confirm: true,
          });
          if (createErr || !created.user) {
            return Response.json(
              { ok: false, error: createErr?.message ?? "create user failed" },
              { status: 500 },
            );
          }
          userId = created.user.id;
        }

        // Ensure admin role
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: userId, role: "admin", status: "approved" },
            { onConflict: "user_id,role" },
          );
        if (roleErr) {
          return Response.json({ ok: false, error: roleErr.message }, { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});