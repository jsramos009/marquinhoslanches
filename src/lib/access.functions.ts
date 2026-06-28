import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccessRole = "admin" | "staff" | "balcao";

type AccessUser = {
  user_id: string;
  email: string | null;
  role: AccessRole;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type PanelAccess = {
  roles: string[];
  accessStatus: "approved" | "pending" | "rejected" | "none";
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

export const getMyPanelAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PanelAccess> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("user_roles")
      .select("role, status")
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    const all = rows ?? [];
    const approved = all.filter((r) => r.status === "approved");
    const roles = approved.map((r) => r.role as string);
    let accessStatus: PanelAccess["accessStatus"] = "none";
    if (approved.length > 0) accessStatus = "approved";
    else if (all.some((r) => r.status === "pending")) accessStatus = "pending";
    else if (all.some((r) => r.status === "rejected")) accessStatus = "rejected";

    return { roles, accessStatus };
  });

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
      role: r.role as AccessRole,
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
    // Only revoke staff/balcao rows; never strip admin
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ status: "rejected" })
      .eq("user_id", data.userId)
      .in("role", ["staff", "balcao"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: AccessRole }) => {
    if (!d?.userId) throw new Error("userId é obrigatório.");
    if (!["admin", "staff", "balcao"].includes(d.role)) {
      throw new Error("Cargo inválido.");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("Você não pode rebaixar o próprio acesso de administrador.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Mark all existing roles for this user as rejected, then upsert the chosen role as approved.
    const { error: e1 } = await supabaseAdmin
      .from("user_roles")
      .update({ status: "rejected" })
      .eq("user_id", data.userId);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: data.userId, role: data.role, status: "approved" },
        { onConflict: "user_id,role" },
      );
    if (e2) throw new Error(e2.message);

    return { ok: true };
  });