import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AccessUser = {
  user_id: string;
  email: string | null;
  role: "admin" | "staff";
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listAccessUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessUser[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, status, created_at")
      .order("created_at", { ascending: false });
    if (rolesErr) throw new Error(rolesErr.message);

    const { data: usersList, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersErr) throw new Error(usersErr.message);
    const emailById = new Map(usersList.users.map((u) => [u.id, u.email ?? null]));

    return (roles ?? []).map((r) => ({
      user_id: r.user_id as string,
      email: emailById.get(r.user_id as string) ?? null,
      role: r.role as "admin" | "staff",
      status: r.status as "pending" | "approved" | "rejected",
      created_at: r.created_at as string,
    }));
  });

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ status: "approved" })
      .eq("user_id", data.userId)
      .eq("role", "staff");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ status: "rejected" })
      .eq("user_id", data.userId)
      .eq("role", "staff");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode revogar o próprio acesso de administrador.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only revoke staff rows; never strip admin
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ status: "rejected" })
      .eq("user_id", data.userId)
      .eq("role", "staff");
    if (error) throw new Error(error.message);
    return { ok: true };
  });