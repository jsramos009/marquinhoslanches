import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isHamburgerCategory } from "@/lib/menu-utils";

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
  customer_phone: string | null;
  channel: OrderChannel;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  cancel_reason: string | null;
  payment_method: OrderPaymentMethod;
  change_for: number | null;
  delivery_mode: "delivery" | "pickup";
  delivery_fee: number;
  delivery_address: string | null;
  delivery_neighborhood: string | null;
  created_at: string;
  ready_at: string | null;
  delivered_at: string | null;
  items: {
    id: string;
    product_id: string | null;
    product_name_snapshot: string;
    quantity: number;
    unit_price_snapshot: number;
    line_total: number;
    addons: {
      id: string;
      addon_id: string | null;
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
  customer_phone?: string | null;
  channel?: OrderChannel;
  notes?: string | null;
  discount?: number;
  payment_method?: OrderPaymentMethod;
  change_for?: number | null;
  delivery_mode?: "delivery" | "pickup";
  delivery_fee?: number;
  delivery_address?: string | null;
  delivery_neighborhood?: string | null;
  items: {
    product_id: string;
    quantity: number;
    addons?: { addon_id: string; quantity?: number }[];
  }[];
};

async function assertStaffAccess(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .in("role", ["admin", "staff"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

function toISODateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

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
      supabase
        .from("products")
        .select("id, name, price, accepts_addons, category_id, categories(slug, name)")
        .in("id", productIds),
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
      const rawCategory = (p as unknown as { categories?: unknown }).categories;
      const category = Array.isArray(rawCategory)
        ? ((rawCategory[0] as { slug?: string | null; name?: string | null } | undefined) ?? null)
        : ((rawCategory as { slug?: string | null; name?: string | null } | null | undefined) ?? null);
      const acceptsAddons = Boolean(p.accepts_addons) && isHamburgerCategory(category?.slug, category?.name);
      const addons = (acceptsAddons ? (it.addons ?? []) : [])
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
    const deliveryFee = Math.max(0, Number(data.delivery_fee) || 0);
    const deliveryMode = data.delivery_mode === "delivery" ? "delivery" : "pickup";
    const effectiveFee = deliveryMode === "delivery" ? deliveryFee : 0;
    const total = Math.max(0, subtotal - discount + effectiveFee);

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        customer_name: data.customer_name?.trim() || null,
        customer_phone: data.customer_phone?.trim() || null,
        channel: data.channel ?? "whatsapp",
        notes: data.notes?.trim() || null,
        status: "em_producao",
        subtotal,
        discount,
        total,
        payment_method: data.payment_method ?? "nao_informado",
        change_for:
          data.payment_method === "dinheiro" && data.change_for && data.change_for > 0
            ? data.change_for
            : null,
        delivery_mode: deliveryMode,
        delivery_fee: effectiveFee,
        delivery_address:
          deliveryMode === "delivery"
            ? data.delivery_address?.trim() || null
            : null,
        delivery_neighborhood:
          deliveryMode === "delivery"
            ? data.delivery_neighborhood?.trim() || null
            : null,
        created_by: userId,
      } as any)
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

type UpdateOrderInput = CreateOrderInput & { id: string };

export const updateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpdateOrderInput) => {
    if (!d?.id) throw new Error("Pedido inválido.");
    if (!Array.isArray(d.items) || d.items.length === 0) {
      throw new Error("Pedido precisa de pelo menos 1 item.");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const productIds = [...new Set(data.items.map((i) => i.product_id))];
    const addonIds = [
      ...new Set(data.items.flatMap((i) => (i.addons ?? []).map((a) => a.addon_id))),
    ];

    const [{ data: prods, error: pErr }, addonsRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price, accepts_addons, category_id, categories(slug, name)")
        .in("id", productIds),
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
      const rawCategory = (p as unknown as { categories?: unknown }).categories;
      const category = Array.isArray(rawCategory)
        ? ((rawCategory[0] as { slug?: string | null; name?: string | null } | undefined) ?? null)
        : ((rawCategory as { slug?: string | null; name?: string | null } | null | undefined) ?? null);
      const acceptsAddons = Boolean(p.accepts_addons) && isHamburgerCategory(category?.slug, category?.name);
      const addons = (acceptsAddons ? (it.addons ?? []) : []).map((a) => {
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
    const deliveryFee = Math.max(0, Number(data.delivery_fee) || 0);
    const deliveryMode = data.delivery_mode === "delivery" ? "delivery" : "pickup";
    const effectiveFee = deliveryMode === "delivery" ? deliveryFee : 0;
    const total = Math.max(0, subtotal - discount + effectiveFee);

    const { error: uErr } = await supabase
      .from("orders")
      .update({
        customer_name: data.customer_name?.trim() || null,
        customer_phone: data.customer_phone?.trim() || null,
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
        delivery_mode: deliveryMode,
        delivery_fee: effectiveFee,
        delivery_address:
          deliveryMode === "delivery" ? data.delivery_address?.trim() || null : null,
        delivery_neighborhood:
          deliveryMode === "delivery" ? data.delivery_neighborhood?.trim() || null : null,
      } as any)
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    // Remove itens antigos (order_item_addons removidos por cascade via FK)
    const { data: oldItems, error: oiErr } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", data.id);
    if (oiErr) throw new Error(oiErr.message);
    const oldIds = (oldItems ?? []).map((r: any) => r.id);
    if (oldIds.length) {
      const { error: daErr } = await supabase
        .from("order_item_addons")
        .delete()
        .in("order_item_id", oldIds);
      if (daErr) throw new Error(daErr.message);
      const { error: diErr } = await supabase.from("order_items").delete().eq("order_id", data.id);
      if (diErr) throw new Error(diErr.message);
    }

    for (const it of computed) {
      const { data: itemRow, error: iErr } = await supabase
        .from("order_items")
        .insert({
          order_id: data.id,
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

    return { id: data.id, total };
  });

export const getOrderById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id obrigatório");
    return d;
  })
  .handler(async ({ data, context }): Promise<OrderRow | null> => {
    const { data: row, error } = await context.supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone, channel, status, subtotal, discount, total, notes, cancel_reason, payment_method, change_for, delivery_mode, delivery_fee, delivery_address, delivery_neighborhood, created_at, ready_at, delivered_at, order_items(id, product_id, product_name_snapshot, quantity, unit_price_snapshot, line_total, order_item_addons(id, addon_id, addon_name_snapshot, quantity, unit_price_snapshot))",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const r = row as any;
    return {
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
      delivery_mode: (r.delivery_mode === "delivery" ? "delivery" : "pickup") as "delivery" | "pickup",
      delivery_fee: Number(r.delivery_fee ?? 0),
      delivery_address: r.delivery_address ?? null,
      delivery_neighborhood: r.delivery_neighborhood ?? null,
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
    };
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
        "id, customer_name, customer_phone, channel, status, subtotal, discount, total, notes, cancel_reason, payment_method, change_for, delivery_mode, delivery_fee, delivery_address, delivery_neighborhood, created_at, ready_at, delivered_at, order_items(id, product_id, product_name_snapshot, quantity, unit_price_snapshot, line_total, order_item_addons(id, addon_id, addon_name_snapshot, quantity, unit_price_snapshot))",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        customer_name: string | null;
        customer_phone: string | null;
        channel: OrderChannel;
        status: OrderStatus;
        subtotal: number;
        discount: number;
        total: number;
        notes: string | null;
        cancel_reason: string | null;
        payment_method: OrderPaymentMethod;
        change_for: number | null;
        delivery_mode: string | null;
        delivery_fee: number | null;
        delivery_address: string | null;
        delivery_neighborhood: string | null;
        created_at: string;
        ready_at: string | null;
        delivered_at: string | null;
        order_items: {
          id: string;
          product_id: string | null;
          product_name_snapshot: string;
          quantity: number;
          unit_price_snapshot: number;
          line_total: number;
          order_item_addons: {
            id: string;
            addon_id: string | null;
            addon_name_snapshot: string;
            quantity: number;
            unit_price_snapshot: number;
          }[];
        }[];
      };
      return {
        id: row.id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        channel: row.channel,
        status: row.status,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        notes: row.notes,
        cancel_reason: row.cancel_reason,
        payment_method: row.payment_method ?? "nao_informado",
        change_for: row.change_for != null ? Number(row.change_for) : null,
        delivery_mode: (row.delivery_mode === "delivery" ? "delivery" : "pickup") as "delivery" | "pickup",
        delivery_fee: Number(row.delivery_fee ?? 0),
        delivery_address: row.delivery_address ?? null,
        delivery_neighborhood: row.delivery_neighborhood ?? null,
        created_at: row.created_at,
        ready_at: row.ready_at,
        delivered_at: row.delivered_at,
        items: (row.order_items ?? []).map((i) => ({
          id: i.id,
          product_id: i.product_id ?? null,
          product_name_snapshot: i.product_name_snapshot,
          quantity: i.quantity,
          unit_price_snapshot: Number(i.unit_price_snapshot),
          line_total: Number(i.line_total),
          addons: (i.order_item_addons ?? []).map((a) => ({
            id: a.id,
            addon_id: a.addon_id ?? null,
            addon_name_snapshot: a.addon_name_snapshot,
            quantity: a.quantity,
            unit_price_snapshot: Number(a.unit_price_snapshot),
          })),
        })),
      };
    });
  });

// Pedidos arquivados: criados ANTES do início do dia local do servidor,
// nos últimos `days` dias (padrão 30). Útil para histórico por data.
export const listArchivedOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<OrderRow[]> => {
    const days = Math.min(90, Math.max(1, data.days ?? 30));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const since = new Date(startOfToday.getTime() - days * 86_400_000);
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone, channel, status, subtotal, discount, total, notes, cancel_reason, payment_method, change_for, delivery_mode, delivery_fee, delivery_address, delivery_neighborhood, created_at, ready_at, delivered_at, order_items(id, product_id, product_name_snapshot, quantity, unit_price_snapshot, line_total, order_item_addons(id, addon_id, addon_name_snapshot, quantity, unit_price_snapshot))",
      )
      .gte("created_at", since.toISOString())
      .lt("created_at", startOfToday.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        customer_name: string | null;
        customer_phone: string | null;
        channel: OrderChannel;
        status: OrderStatus;
        subtotal: number;
        discount: number;
        total: number;
        notes: string | null;
        cancel_reason: string | null;
        payment_method: OrderPaymentMethod;
        change_for: number | null;
        delivery_mode: string | null;
        delivery_fee: number | null;
        delivery_address: string | null;
        delivery_neighborhood: string | null;
        created_at: string;
        ready_at: string | null;
        delivered_at: string | null;
        order_items: {
          id: string;
          product_id: string | null;
          product_name_snapshot: string;
          quantity: number;
          unit_price_snapshot: number;
          line_total: number;
          order_item_addons: {
            id: string;
            addon_id: string | null;
            addon_name_snapshot: string;
            quantity: number;
            unit_price_snapshot: number;
          }[];
        }[];
      };
      return {
        id: row.id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        channel: row.channel,
        status: row.status,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        notes: row.notes,
        cancel_reason: row.cancel_reason,
        payment_method: row.payment_method ?? "nao_informado",
        change_for: row.change_for != null ? Number(row.change_for) : null,
        delivery_mode: (row.delivery_mode === "delivery" ? "delivery" : "pickup") as "delivery" | "pickup",
        delivery_fee: Number(row.delivery_fee ?? 0),
        delivery_address: row.delivery_address ?? null,
        delivery_neighborhood: row.delivery_neighborhood ?? null,
        created_at: row.created_at,
        ready_at: row.ready_at,
        delivered_at: row.delivered_at,
        items: (row.order_items ?? []).map((i) => ({
          id: i.id,
          product_id: i.product_id ?? null,
          product_name_snapshot: i.product_name_snapshot,
          quantity: i.quantity,
          unit_price_snapshot: Number(i.unit_price_snapshot),
          line_total: Number(i.line_total),
          addons: (i.order_item_addons ?? []).map((a) => ({
            id: a.id,
            addon_id: a.addon_id ?? null,
            addon_name_snapshot: a.addon_name_snapshot,
            quantity: a.quantity,
            unit_price_snapshot: Number(a.unit_price_snapshot),
          })),
        })),
      };
    });
  });

// Pedidos de um dia específico (00:00 até 24:00 no fuso do servidor).
// Usado no relatório personalizado por data em /admin/arquivados.
export const listOrdersByDay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { day: string }) => {
    if (!d?.day || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)) {
      throw new Error("Data inválida (use YYYY-MM-DD).");
    }
    return d;
  })
  .handler(async ({ data, context }): Promise<OrderRow[]> => {
    const [y, m, dd] = data.day.split("-").map(Number);
    const start = new Date(y, m - 1, dd, 0, 0, 0, 0);
    const end = new Date(y, m - 1, dd + 1, 0, 0, 0, 0);
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone, channel, status, subtotal, discount, total, notes, cancel_reason, payment_method, change_for, delivery_mode, delivery_fee, delivery_address, delivery_neighborhood, created_at, ready_at, delivered_at, order_items(id, product_id, product_name_snapshot, quantity, unit_price_snapshot, line_total, order_item_addons(id, addon_id, addon_name_snapshot, quantity, unit_price_snapshot))",
      )
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as any;
      return {
        id: row.id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        channel: row.channel,
        status: row.status,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        notes: row.notes,
        cancel_reason: row.cancel_reason,
        payment_method: row.payment_method ?? "nao_informado",
        change_for: row.change_for != null ? Number(row.change_for) : null,
        delivery_mode: (row.delivery_mode === "delivery" ? "delivery" : "pickup") as
          | "delivery"
          | "pickup",
        delivery_fee: Number(row.delivery_fee ?? 0),
        delivery_address: row.delivery_address ?? null,
        delivery_neighborhood: row.delivery_neighborhood ?? null,
        created_at: row.created_at,
        ready_at: row.ready_at,
        delivered_at: row.delivered_at,
        items: (row.order_items ?? []).map((i: any) => ({
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
      };
    });
  });

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range?: "today" | "7d" | "30d" | "mtd" } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<DashboardMetrics> => {
    await assertStaffAccess(context.userId);
    const range = data.range ?? "7d";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const end = now;
    const start = new Date(now);
    if (range === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (range === "30d") {
      start.setDate(start.getDate() - 30);
    } else if (range === "mtd") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(start.getDate() - 7);
    }
    const span = end.getTime() - start.getTime();
    const prevEnd = start;
    const prevStart = new Date(start.getTime() - span);

    const [{ data: current, error: currentErr }, { data: previous, error: previousErr }] =
      await Promise.all([
        supabaseAdmin
          .from("orders")
          .select("id, status, total, created_at, ready_at, delivered_at")
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString()),
        supabaseAdmin
          .from("orders")
          .select("status, total")
          .gte("created_at", prevStart.toISOString())
          .lt("created_at", prevEnd.toISOString()),
      ]);
    if (currentErr) throw new Error(currentErr.message);
    if (previousErr) throw new Error(previousErr.message);

    const orders = current ?? [];
    const prevOrders = previous ?? [];
    const validOrders = orders.filter((o) => o.status !== "cancelado");
    const validPrev = prevOrders.filter((o) => o.status !== "cancelado");
    const revenue = validOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const prevRevenue = validPrev.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const seriesMap = new Map<string, { day: string; revenue: number; orders: number }>();
    for (const o of validOrders) {
      const day = toISODateKey(new Date(o.created_at));
      const item = seriesMap.get(day) ?? { day, revenue: 0, orders: 0 };
      item.revenue += Number(o.total || 0);
      item.orders += 1;
      seriesMap.set(day, item);
    }

    const statusCounts = new Map<OrderStatus, number>();
    for (const o of orders) {
      const status = o.status as OrderStatus;
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }

    const activeOrderIds = validOrders.map((o) => o.id);
    const { data: items, error: itemsErr } = activeOrderIds.length
      ? await supabaseAdmin
          .from("order_items")
          .select("product_id, product_name_snapshot, line_total, quantity")
          .in("order_id", activeOrderIds)
      : { data: [], error: null };
    if (itemsErr) throw new Error(itemsErr.message);

    const topMap = new Map<string, { product_id: string | null; name: string; revenue: number; qty: number }>();
    for (const item of items ?? []) {
      const key = item.product_id ?? item.product_name_snapshot;
      const row = topMap.get(key) ?? {
        product_id: item.product_id,
        name: item.product_name_snapshot,
        revenue: 0,
        qty: 0,
      };
      row.revenue += Number(item.line_total || 0);
      row.qty += Number(item.quantity || 0);
      topMap.set(key, row);
    }
    const topProducts = [...topMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const soldIds = new Set((items ?? []).map((i) => i.product_id).filter(Boolean));
    const { data: products, error: productsErr } = await supabaseAdmin
      .from("products")
      .select("id, name, price")
      .eq("is_active", true)
      .order("name");
    if (productsErr) throw new Error(productsErr.message);

    const prepSamples = orders.filter((o) => o.ready_at);
    const avgPrep = prepSamples.length
      ? Math.round(
          prepSamples.reduce(
            (sum, o) => sum + (new Date(o.ready_at!).getTime() - new Date(o.created_at).getTime()) / 1000,
            0,
          ) / prepSamples.length,
        )
      : null;
    const deliverSamples = orders.filter((o) => o.ready_at && o.delivered_at);
    const avgDeliver = deliverSamples.length
      ? Math.round(
          deliverSamples.reduce(
            (sum, o) => sum + (new Date(o.delivered_at!).getTime() - new Date(o.ready_at!).getTime()) / 1000,
            0,
          ) / deliverSamples.length,
        )
      : null;

    return {
      range,
      start: start.toISOString(),
      end: end.toISOString(),
      revenue,
      orders: validOrders.length,
      avg_ticket: validOrders.length ? revenue / validOrders.length : 0,
      prev_revenue: prevRevenue,
      prev_orders: validPrev.length,
      series: [...seriesMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
      status_counts: [...statusCounts.entries()].map(([status, n]) => ({ status, n })),
      top_products: topProducts,
      idle_products: (products ?? [])
        .filter((p) => !soldIds.has(p.id))
        .slice(0, 20)
        .map((p) => ({ id: p.id, name: p.name, price: Number(p.price) })),
      avg_prep_seconds: avgPrep,
      avg_deliver_seconds: avgDeliver,
    };
  });

// Busca cliente salvo pelo telefone (usado no lançamento manual para
// prefill de nome, endereço e bairro sem precisar perguntar de novo).
export const getCustomerByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone: string }) => d ?? { phone: "" })
  .handler(async ({ data, context }) => {
    const digits = (data.phone || "").replace(/\D+/g, "");
    if (digits.length < 8) return null;
    const tail = digits.slice(-8);
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select(
        "customer_name, customer_phone, delivery_address, delivery_neighborhood, delivery_mode, created_at",
      )
      .ilike("customer_phone", `%${tail}%`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    const list = (rows ?? []).filter((r) =>
      (r.customer_phone || "").replace(/\D+/g, "").endsWith(tail),
    );
    if (list.length === 0) return null;
    const latestName = list.find((r) => r.customer_name && r.customer_name.trim());
    const lastDelivery = list.find(
      (r) => r.delivery_mode === "delivery" && r.delivery_address,
    );
    return {
      customer_name: latestName?.customer_name ?? list[0].customer_name ?? null,
      customer_phone: list[0].customer_phone ?? null,
      delivery_address: lastDelivery?.delivery_address ?? null,
      delivery_neighborhood: lastDelivery?.delivery_neighborhood ?? null,
    };
  });