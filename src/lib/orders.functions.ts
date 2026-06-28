import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrderStatus =
  | "recebido"
  | "em_producao"
  | "pronto"
  | "entregue"
  | "cancelado";

export type OrderChannel = "whatsapp" | "balcao" | "telefone" | "outro";

export type OrderPaymentMethod =
  | "pix"
  | "cartao_credito"
  | "cartao_debito"
  | "dinheiro"
  | "nao_informado";

export type OrderRow = {
  id: string;
  customer_name: string | null;
  channel: OrderChannel;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  cancel_reason: string | null;
  payment_method: OrderPaymentMethod;
  change_for: number | null;
  created_at: string;
  ready_at: string | null;
  delivered_at: string | null;
  items: {
    id: string;
    product_name_snapshot: string;
    quantity: number;
    unit_price_snapshot: number;
    line_total: number;
    addons: {
      id: string;
      addon_name_snapshot: string;
      quantity: number;
      unit_price_snapshot: number;
    }[];
  }[];
};

export type DashboardMetrics = {
  range: string;
  start: string;
  end: string;
  revenue: number;
  orders: number;
  avg_ticket: number;
  prev_revenue: number;
  prev_orders: number;
  series: { day: string; revenue: number; orders: number }[];
  status_counts: { status: OrderStatus; n: number }[];
  top_products: { product_id: string | null; name: string; revenue: number; qty: number }[];
  idle_products: { id: string; name: string; price: number }[];
  avg_prep_seconds: number | null;
  avg_deliver_seconds: number | null;
};

type CreateOrderInput = {
  customer_name?: string | null;
  channel?: OrderChannel;
  notes?: string | null;
  discount?: number;
  payment_method?: OrderPaymentMethod;
  change_for?: number | null;
  items: {
    product_id: string;
    quantity: number;
    addons?: { addon_id: string; quantity?: number }[];
  }[];
};

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreateOrderInput) => {
    if (!d || !Array.isArray(d.items) || d.items.length === 0) {
      throw new Error("Pedido precisa de pelo menos 1 item.");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const productIds = [...new Set(data.items.map((i) => i.product_id))];
    const addonIds = [
      ...new Set(data.items.flatMap((i) => (i.addons ?? []).map((a) => a.addon_id))),
    ];

    const [{ data: prods, error: pErr }, addonsRes] = await Promise.all([
      supabase.from("products").select("id, name, price, accepts_addons").in("id", productIds),
      addonIds.length
        ? supabase.from("addons").select("id, name, price").in("id", addonIds)
        : Promise.resolve({ data: [] as { id: string; name: string; price: number }[], error: null }),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (addonsRes.error) throw new Error(addonsRes.error.message);
    const productMap = new Map((prods ?? []).map((p) => [p.id, p]));
    const addonMap = new Map((addonsRes.data ?? []).map((a) => [a.id, a]));

    type ComputedItem = {
      product_id: string;
      product_name_snapshot: string;
      unit_price_snapshot: number;
      quantity: number;
      line_total: number;
      addons: {
        addon_id: string;
        addon_name_snapshot: string;
        unit_price_snapshot: number;
        quantity: number;
      }[];
    };

    let subtotal = 0;
    const computed: ComputedItem[] = [];
    for (const it of data.items) {
      const p = productMap.get(it.product_id);
      if (!p) throw new Error(`Produto inválido: ${it.product_id}`);
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      const unit = Number(p.price);
      const addons = (it.addons ?? [])
        .map((a) => {
          const ad = addonMap.get(a.addon_id);
          if (!ad) throw new Error(`Adicional inválido: ${a.addon_id}`);
          const aqty = Math.max(1, Math.floor(Number(a.quantity ?? 1)));
          return {
            addon_id: ad.id,
            addon_name_snapshot: ad.name,
            unit_price_snapshot: Number(ad.price),
            quantity: aqty,
          };
        });
      const addonsTotal = addons.reduce((s, a) => s + a.unit_price_snapshot * a.quantity, 0);
      const line_total = (unit + addonsTotal) * qty;
      subtotal += line_total;
      computed.push({
        product_id: p.id,
        product_name_snapshot: p.name,
        unit_price_snapshot: unit,
        quantity: qty,
        line_total,
        addons,
      });
    }

    const discount = Math.max(0, Number(data.discount) || 0);
    const total = Math.max(0, subtotal - discount);

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        customer_name: data.customer_name?.trim() || null,
        channel: data.channel ?? "whatsapp",
        notes: data.notes?.trim() || null,
        subtotal,
        discount,
        total,
        payment_method: data.payment_method ?? "nao_informado",
        change_for:
          data.payment_method === "dinheiro" && data.change_for && data.change_for > 0
            ? data.change_for
            : null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (oErr || !order) throw new Error(oErr?.message || "Falha ao criar pedido");

    for (const it of computed) {
      const { data: itemRow, error: iErr } = await supabase
        .from("order_items")
        .insert({
          order_id: order.id,
          product_id: it.product_id,
          product_name_snapshot: it.product_name_snapshot,
          unit_price_snapshot: it.unit_price_snapshot,
          quantity: it.quantity,
          line_total: it.line_total,
        })
        .select("id")
        .single();
      if (iErr || !itemRow) throw new Error(iErr?.message || "Falha ao inserir item");
      if (it.addons.length) {
        const { error: aErr } = await supabase.from("order_item_addons").insert(
          it.addons.map((a) => ({
            order_item_id: itemRow.id,
            addon_id: a.addon_id,
            addon_name_snapshot: a.addon_name_snapshot,
            unit_price_snapshot: a.unit_price_snapshot,
            quantity: a.quantity,
          })),
        );
        if (aErr) throw new Error(aErr.message);
      }
    }

    return { id: order.id, total };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: OrderStatus }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason: string }) => d)
  .handler(async ({ data, context }) => {
    if (!data.reason?.trim()) throw new Error("Informe o motivo do cancelamento.");
    const { error } = await context.supabase
      .from("orders")
      .update({ status: "cancelado", cancel_reason: data.reason.trim() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sinceHours?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<OrderRow[]> => {
    const hours = data.sinceHours ?? 36;
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select(
        "id, customer_name, channel, status, subtotal, discount, total, notes, cancel_reason, payment_method, change_for, created_at, ready_at, delivered_at, order_items(id, product_name_snapshot, quantity, unit_price_snapshot, line_total, order_item_addons(id, addon_name_snapshot, quantity, unit_price_snapshot))",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        customer_name: string | null;
        channel: OrderChannel;
        status: OrderStatus;
        subtotal: number;
        discount: number;
        total: number;
        notes: string | null;
        cancel_reason: string | null;
        payment_method: OrderPaymentMethod;
        change_for: number | null;
        created_at: string;
        ready_at: string | null;
        delivered_at: string | null;
        order_items: {
          id: string;
          product_name_snapshot: string;
          quantity: number;
          unit_price_snapshot: number;
          line_total: number;
          order_item_addons: {
            id: string;
            addon_name_snapshot: string;
            quantity: number;
            unit_price_snapshot: number;
          }[];
        }[];
      };
      return {
        id: row.id,
        customer_name: row.customer_name,
        channel: row.channel,
        status: row.status,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        notes: row.notes,
        cancel_reason: row.cancel_reason,
        payment_method: row.payment_method ?? "nao_informado",
        change_for: row.change_for != null ? Number(row.change_for) : null,
        created_at: row.created_at,
        ready_at: row.ready_at,
        delivered_at: row.delivered_at,
        items: (row.order_items ?? []).map((i) => ({
          id: i.id,
          product_name_snapshot: i.product_name_snapshot,
          quantity: i.quantity,
          unit_price_snapshot: Number(i.unit_price_snapshot),
          line_total: Number(i.line_total),
          addons: (i.order_item_addons ?? []).map((a) => ({
            id: a.id,
            addon_name_snapshot: a.addon_name_snapshot,
            quantity: a.quantity,
            unit_price_snapshot: Number(a.unit_price_snapshot),
          })),
        })),
      };
    });
  });

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range?: "today" | "7d" | "30d" | "mtd" } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<DashboardMetrics> => {
    const range = data.range ?? "7d";
    const { data: result, error } = await context.supabase.rpc("dashboard_metrics", { _range: range });
    if (error) throw new Error(error.message);
    return result as unknown as DashboardMetrics;
  });