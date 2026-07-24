import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { brStartOfDay } from "@/lib/br-time";

export type Courier = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
};

export type CourierDeliveryRow = {
  order_id: string;
  order_number: number;
  order_total: number;
  payment_method: string;
  delivery_fee: number;
  neighborhood: string | null;
  courier_id: string | null;
  courier_name: string | null;
  created_at: string;
};

export type CourierReport = {
  start: string;
  end: string;
  total_freight: number;
  avg_freight: number;
  total_deliveries: number;
  active_couriers: number;
  rows: CourierDeliveryRow[];
  by_courier: { courier_id: string | null; courier_name: string; deliveries: number; total_freight: number }[];
};

export const listCouriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { includeInactive?: boolean } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<Courier[]> => {
    let q = context.supabase.from("couriers").select("id, name, phone, active").order("name");
    if (!data.includeInactive) q = q.eq("active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Courier[];
  });

export const upsertCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; phone?: string | null; active?: boolean }) => {
    if (!d?.name?.trim()) throw new Error("Nome obrigatório.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const payload: any = {
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      active: data.active ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("couriers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("couriers")
      .insert(payload)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao salvar.");
    return { id: row.id };
  });

export const deleteCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("couriers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; courierId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("orders")
      .update({ courier_id: data.courierId } as any)
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Ordem numérica simples baseada em created_at para exibição no relatório.
function orderNumberFromCreated(createdAt: string, index: number, total: number) {
  // Simplesmente numera do mais antigo (1) ao mais recente (total) para o período.
  return total - index;
}

export const getCourierReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { startDay: string; endDay: string; courierId?: string | null }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDay ?? "")) throw new Error("Data inicial inválida.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.endDay ?? "")) throw new Error("Data final inválida.");
    return d;
  })
  .handler(async ({ data, context }): Promise<CourierReport> => {
    const start = brStartOfDay(data.startDay);
    const endExclusive = new Date(brStartOfDay(data.endDay).getTime() + 86_400_000);

    let q = context.supabase
      .from("orders")
      .select("id, total, delivery_fee, delivery_neighborhood, payment_method, courier_id, created_at, status, delivery_mode")
      .gte("created_at", start.toISOString())
      .lt("created_at", endExclusive.toISOString())
      .eq("delivery_mode", "delivery")
      .neq("status", "cancelado")
      .order("created_at", { ascending: true });
    if (data.courierId) q = q.eq("courier_id", data.courierId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const courierIds = [...new Set((rows ?? []).map((r: any) => r.courier_id).filter(Boolean))] as string[];
    const nameMap = new Map<string, string>();
    if (courierIds.length) {
      const { data: cs } = await context.supabase
        .from("couriers")
        .select("id, name")
        .in("id", courierIds);
      for (const c of cs ?? []) nameMap.set((c as any).id, (c as any).name);
    }

    const total = (rows ?? []).length;
    const reportRows: CourierDeliveryRow[] = (rows ?? []).map((r: any, i: number) => ({
      order_id: r.id,
      order_number: i + 1,
      order_total: Number(r.total ?? 0),
      payment_method: r.payment_method ?? "nao_informado",
      delivery_fee: Number(r.delivery_fee ?? 0),
      neighborhood: r.delivery_neighborhood ?? null,
      courier_id: r.courier_id ?? null,
      courier_name: r.courier_id ? nameMap.get(r.courier_id) ?? null : null,
      created_at: r.created_at,
    }));
    // ordem mais recente primeiro para exibição
    reportRows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const total_freight = reportRows.reduce((s, r) => s + r.delivery_fee, 0);
    const avg_freight = reportRows.length ? total_freight / reportRows.length : 0;
    const byMap = new Map<string, { courier_id: string | null; courier_name: string; deliveries: number; total_freight: number }>();
    for (const r of reportRows) {
      const key = r.courier_id ?? "__none__";
      const cur = byMap.get(key) ?? {
        courier_id: r.courier_id,
        courier_name: r.courier_name ?? "Sem entregador",
        deliveries: 0,
        total_freight: 0,
      };
      cur.deliveries += 1;
      cur.total_freight += r.delivery_fee;
      byMap.set(key, cur);
    }
    const active_couriers = [...byMap.keys()].filter((k) => k !== "__none__").length;

    // Numera 1..N por ordem crescente do created_at (padrão do PDF de referência).
    void orderNumberFromCreated;
    return {
      start: start.toISOString(),
      end: endExclusive.toISOString(),
      total_freight,
      avg_freight,
      total_deliveries: reportRows.length,
      active_couriers,
      rows: reportRows,
      by_courier: [...byMap.values()].sort((a, b) => b.deliveries - a.deliveries),
    };
  });