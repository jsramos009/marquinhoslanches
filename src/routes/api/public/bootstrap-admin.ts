import { createFileRoute } from "@tanstack/react-router";

const ADMIN_EMAIL = "josegabrielramos2004@gmail.com";

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency guard: if any admin already exists, refuse silently.
        const { data: existingAdmins, error: rolesErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        if (rolesErr) {
          return Response.json({ ok: false, error: rolesErr.message }, { status: 500 });
        }

        // Try to find the user by listing (Supabase admin API has no getByEmail in older versions).
        // Use the modern getUserByEmail-style listing via listUsers fallback.
        let userId: string | undefined;
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) {
          return Response.json({ ok: false, error: listErr.message }, { status: 500 });
        }
        const found = list.users.find(
          (u) => (u.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase(),
        );
        userId = found?.id;

        if (!userId) {
          // Create the auth user (no password — they'll set one via the reset link).
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: ADMIN_EMAIL,
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

        // Grant admin role (idempotent).
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
        if (roleErr) {
          return Response.json({ ok: false, error: roleErr.message }, { status: 500 });
        }

        // Send password reset email so the admin defines their own password.
        const origin = new URL(request.url).origin;
        const { error: linkErr } = await supabaseAdmin.auth.resetPasswordForEmail(ADMIN_EMAIL, {
          redirectTo: `${origin}/reset-password`,
        });
        if (linkErr) {
          return Response.json(
            { ok: true, warning: `role granted, email failed: ${linkErr.message}`, userId },
            { status: 200 },
          );
        }

        return Response.json({
          ok: true,
          userId,
          message:
            existingAdmins && existingAdmins.length > 0
              ? "admin already existed; reset link re-sent"
              : "admin created and reset link sent",
        });
      },
    },
  },
});