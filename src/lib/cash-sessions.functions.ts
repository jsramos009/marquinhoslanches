import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CashSession = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
  closed_by: string | null;
  opening_note: string | null;
  closing_note: string | null;
};

export type CashSessionSummary = {
  session: CashSession;
  orders: number;
  revenue: number;
  delivery_fees: number;
  deliveries: number;
  pickups: number;
  cancelled: number;
};

export const getCurrentCashSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CashSession | null> => {
    const { data, error } = await context.supabase
      .from("cash_sessions")
      .select("id, opened_at, closed_at, opened_by, closed_by, opening_note, closing_note")
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CashSession) ?? null;
  });

export const openCashSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { note?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("cash_sessions")
      .select("id")
      .is("closed_at", null)
      .maybeSingle();
    if (existing) throw new Error("Já existe um caixa aberto.");
    const { data: row, error } = await context.supabase
      .from("cash_sessions")
      .insert({
        opened_by: context.userId,
        opening_note: data.note?.trim() || null,
      } as any)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao abrir caixa");
    return { id: row.id };
  });

export const closeCashSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note?: string | null }) => {
    if (!d?.id) throw new Error("Sessão inválida.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cash_sessions")
      .update({
        closed_at: new Date().toISOString(),
        closed_by: context.userId,
        closing_note: data.note?.trim() || null,
      } as any)
      .eq("id", data.id)
      .is("closed_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCashSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<CashSessionSummary[]> => {
    const limit = Math.min(60, Math.max(1, data.limit ?? 30));
    const { data: sessions, error } = await context.supabase
      .from("cash_sessions")
      .select("id, opened_at, closed_at, opened_by, closed_by, opening_note, closing_note")
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const ids = (sessions ?? []).map((s) => s.id);
    if (ids.length === 0) return [];
    const { data: orders, error: oErr } = await context.supabase
      .from("orders")
      .select("cash_session_id, total, delivery_fee, delivery_mode, status")
      .in("cash_session_id", ids);
    if (oErr) throw new Error(oErr.message);
    const agg = new Map<string, Omit<CashSessionSummary, "session">>();
    for (const s of sessions ?? []) {
      agg.set(s.id, {
        orders: 0,
        revenue: 0,
        delivery_fees: 0,
        deliveries: 0,
        pickups: 0,
        cancelled: 0,
      });
    }
    for (const o of orders ?? []) {
      const a = agg.get(o.cash_session_id as string);
      if (!a) continue;
      if (o.status === "cancelado") {
        a.cancelled += 1;
        continue;
      }
      a.orders += 1;
      a.revenue += Number(o.total || 0);
      a.delivery_fees += Number(o.delivery_fee || 0);
      if (o.delivery_mode === "delivery") a.deliveries += 1;
      else a.pickups += 1;
    }
    return (sessions ?? []).map((s) => ({
      session: s as CashSession,
      ...(agg.get(s.id) ?? {
        orders: 0,
        revenue: 0,
        delivery_fees: 0,
        deliveries: 0,
        pickups: 0,
        cancelled: 0,
      }),
    }));
  });

export const listOrdersByCashSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) => {
    if (!d?.sessionId) throw new Error("Sessão inválida.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone, channel, status, subtotal, discount, total, notes, cancel_reason, payment_method, change_for, cash_amount, secondary_payment_method, delivery_mode, delivery_fee, delivery_extra_fee, delivery_address, delivery_neighborhood, courier_id, created_at, ready_at, delivered_at, order_items(id, product_id, product_name_snapshot, quantity, unit_price_snapshot, line_total, order_item_addons(id, addon_id, addon_name_snapshot, quantity, unit_price_snapshot))",
      )
      .eq("cash_session_id", data.sessionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      channel: r.channel,
      status: r.status,
      subtotal: Number(r.subtotal),
      discount: Number(r.discount),
      total: Number(r.total),
      notes: r.notes,
      cancel_reason: r.cancel_reason,
      payment_method: r.payment_method ?? "nao_informado",
      change_for: r.change_for != null ? Number(r.change_for) : null,
      cash_amount: r.cash_amount != null ? Number(r.cash_amount) : null,
      secondary_payment_method: r.secondary_payment_method ?? null,
      delivery_mode: (r.delivery_mode === "delivery" ? "delivery" : "pickup") as "delivery" | "pickup",
      delivery_fee: Number(r.delivery_fee ?? 0),
      delivery_extra_fee: Number(r.delivery_extra_fee ?? 0),
      delivery_address: r.delivery_address ?? null,
      delivery_neighborhood: r.delivery_neighborhood ?? null,
      courier_id: r.courier_id ?? null,
      created_at: r.created_at,
      ready_at: r.ready_at,
      delivered_at: r.delivered_at,
      items: (r.order_items ?? []).map((i: any) => ({
        id: i.id,
        product_id: i.product_id ?? null,
        product_name_snapshot: i.product_name_snapshot,
        quantity: i.quantity,
        unit_price_snapshot: Number(i.unit_price_snapshot),
        line_total: Number(i.line_total),
        addons: (i.order_item_addons ?? []).map((a: any) => ({
          id: a.id,
          addon_id: a.addon_id ?? null,
          addon_name_snapshot: a.addon_name_snapshot,
          quantity: a.quantity,
          unit_price_snapshot: Number(a.unit_price_snapshot),
        })),
      })),
    }));
  });