import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
  last_address: string | null;
  last_neighborhood: string | null;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
};

function normalizePhone(p: string) {
  return (p || "").replace(/\D+/g, "");
}

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<Customer[]> => {
    const limit = Math.min(200, Math.max(1, data.limit ?? 100));
    const q = (data.search ?? "").trim();
    let query = context.supabase
      .from("customers")
      .select("id, phone, name, last_address, last_neighborhood, orders_count, total_spent, last_order_at")
      .order("last_order_at", { ascending: false })
      .limit(limit);
    if (q) {
      const digits = normalizePhone(q);
      if (digits.length >= 3) {
        query = query.or(`phone.ilike.%${digits}%,name.ilike.%${q}%`);
      } else {
        query = query.ilike("name", `%${q}%`);
      }
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      ...r,
      total_spent: Number(r.total_spent ?? 0),
      orders_count: Number(r.orders_count ?? 0),
    }));
  });

export const findCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone?: string; name?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<Customer | null> => {
    const digits = normalizePhone(data.phone ?? "");
    let query = context.supabase
      .from("customers")
      .select("id, phone, name, last_address, last_neighborhood, orders_count, total_spent, last_order_at")
      .order("last_order_at", { ascending: false })
      .limit(1);
    if (digits.length >= 8) {
      query = query.ilike("phone", `%${digits.slice(-8)}%`);
    } else if ((data.name ?? "").trim().length >= 2) {
      query = query.ilike("name", `%${data.name!.trim()}%`);
    } else {
      return null;
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const r = (rows ?? [])[0] as any;
    if (!r) return null;
    return { ...r, total_spent: Number(r.total_spent ?? 0), orders_count: Number(r.orders_count ?? 0) };
  });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string | null; last_address?: string | null; last_neighborhood?: string | null }) => {
    if (!d?.id) throw new Error("Cliente inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("customers")
      .update({
        name: data.name?.trim() || null,
        last_address: data.last_address?.trim() || null,
        last_neighborhood: data.last_neighborhood?.trim() || null,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });