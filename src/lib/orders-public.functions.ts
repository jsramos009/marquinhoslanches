import { createServerFn } from "@tanstack/react-start";
import { isHamburgerCategory } from "@/lib/menu-utils";

export type PublicOrderInput = {
  customer_name: string;
  customer_phone: string;
  notes?: string | null;
  delivery_address?: string | null;
  delivery_mode?: "delivery" | "pickup";
  delivery_fee?: number;
  delivery_neighborhood?: string | null;
  payment_method?:
    | "pix"
    | "cartao_credito"
    | "cartao_debito"
    | "dinheiro"
    | "nao_informado";
  change_for?: number | null;
  cash_amount?: number | null;
  secondary_payment_method?:
    | "pix"
    | "cartao_credito"
    | "cartao_debito"
    | null;
  items: {
    product_id: string;
    quantity: number;
    notes?: string | null;
    addons?: { addon_id: string; quantity?: number }[];
  }[];
};

/**
 * Cria um pedido a partir do cardápio público (cliente final), sem
 * exigir autenticação. Toda a validação de preços/produtos é feita
 * no servidor — o cliente envia apenas IDs e quantidades.
 */
export const submitPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((d: PublicOrderInput) => {
    if (!d || !Array.isArray(d.items) || d.items.length === 0) {
      throw new Error("Pedido precisa de pelo menos 1 item.");
    }
    if (!d.customer_name?.trim() || !d.customer_phone?.trim()) {
      throw new Error("Informe nome e telefone.");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Cumprimento de horário e pedido mínimo (server-side)
    const { parseOperatingHours, isOpenNow } = await import(
      "@/lib/business-hours"
    );
    const { data: settingsRows } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["operating_hours", "block_when_closed", "min_order_value"]);
    const smap: Record<string, string> = {};
    (settingsRows ?? []).forEach((r: any) => {
      if (r?.key) smap[r.key] = r.value ?? "";
    });
    const block = (smap.block_when_closed ?? "1") !== "0";
    if (block) {
      const hours = parseOperatingHours(smap.operating_hours);
      const { open } = isOpenNow(hours);
      if (!open) {
        throw new Error(
          "Estamos fechados no momento. Tente novamente no horário de funcionamento.",
        );
      }
    }
    const minOrder = Number(smap.min_order_value) || 0;

    const productIds = [...new Set(data.items.map((i) => i.product_id))];
    const addonIds = [
      ...new Set(
        data.items.flatMap((i) => (i.addons ?? []).map((a) => a.addon_id)),
      ),
    ];

    const [{ data: prods, error: pErr }, addonsRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select(
          "id, name, price, accepts_addons, is_active, category_id, categories(slug, name)",
        )
        .in("id", productIds),
      addonIds.length
        ? supabaseAdmin.from("addons").select("id, name, price").in("id", addonIds)
        : Promise.resolve({
            data: [] as { id: string; name: string; price: number }[],
            error: null,
          }),
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
      notes: string | null;
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
      if (p.is_active === false) {
        throw new Error(`Produto indisponível: ${p.name}`);
      }
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      const unit = Number(p.price);
      const rawCategory = (p as unknown as { categories?: unknown }).categories;
      const category = Array.isArray(rawCategory)
        ? ((rawCategory[0] as { slug?: string | null; name?: string | null } | undefined) ?? null)
        : ((rawCategory as { slug?: string | null; name?: string | null } | null | undefined) ?? null);
      const acceptsAddons =
        Boolean(p.accepts_addons) &&
        isHamburgerCategory(category?.slug, category?.name);
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
      const addonsTotal = addons.reduce(
        (s, a) => s + a.unit_price_snapshot * a.quantity,
        0,
      );
      const line_total = (unit + addonsTotal) * qty;
      subtotal += line_total;
      computed.push({
        product_id: p.id,
        product_name_snapshot: p.name,
        unit_price_snapshot: unit,
        quantity: qty,
        line_total,
        notes: it.notes?.trim() || null,
        addons,
      });
    }

    if (minOrder > 0 && subtotal < minOrder) {
      throw new Error(
        `Pedido mínimo de R$ ${minOrder.toFixed(2)}. Adicione mais itens.`,
      );
    }

    const deliveryMode = data.delivery_mode === "delivery" ? "delivery" : "pickup";
    const deliveryFee = deliveryMode === "delivery" ? Math.max(0, Number(data.delivery_fee) || 0) : 0;
    const total = subtotal + deliveryFee;
    const notesParts: string[] = [];
    if (data.delivery_mode === "delivery" && data.delivery_address?.trim()) {
      notesParts.push(`Entrega: ${data.delivery_address.trim()}`);
    } else if (data.delivery_mode === "pickup") {
      notesParts.push("Retirada no local");
    }
    // Inclui observações por item (que não cabem na tabela order_items)
    for (const c of computed) {
      if (c.notes) {
        notesParts.push(`Obs. ${c.product_name_snapshot}: ${c.notes}`);
      }
    }
    if (data.notes?.trim()) notesParts.push(data.notes.trim());
    const notes = notesParts.length ? notesParts.join("\n") : null;

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: data.customer_name.trim(),
        customer_phone: data.customer_phone.trim(),
        channel: "whatsapp",
        notes,
        status: "em_producao",
        subtotal,
        discount: 0,
        total,
        payment_method: data.payment_method ?? "nao_informado",
        change_for:
          data.payment_method === "dinheiro" &&
          data.change_for &&
          data.change_for > 0
            ? data.change_for
            : null,
        cash_amount:
          data.secondary_payment_method && data.cash_amount && data.cash_amount > 0
            ? data.cash_amount
            : null,
        secondary_payment_method:
          data.secondary_payment_method && data.cash_amount && data.cash_amount > 0
            ? data.secondary_payment_method
            : null,
        delivery_mode: deliveryMode,
        delivery_fee: deliveryFee,
        delivery_address:
          deliveryMode === "delivery"
            ? data.delivery_address?.trim() || null
            : null,
        delivery_neighborhood:
          deliveryMode === "delivery"
            ? data.delivery_neighborhood?.trim() || null
            : null,
      } as any)
      .select("id")
      .single();
    if (oErr || !order) throw new Error(oErr?.message || "Falha ao criar pedido");

    for (const it of computed) {
      const { data: itemRow, error: iErr } = await supabaseAdmin
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
      if (iErr || !itemRow)
        throw new Error(iErr?.message || "Falha ao inserir item");
      if (it.addons.length) {
        const { error: aErr } = await supabaseAdmin
          .from("order_item_addons")
          .insert(
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

/**
 * Retorna dados m\u00ednimos de um pedido para reconstruir o carrinho no
 * card\u00e1pio p\u00fablico via /refazer/{id}. N\u00e3o exp\u00f5e PII.
 */
export const getPublicOrderRepeat = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => {
    if (!d?.id || typeof d.id !== "string") throw new Error("id inv\u00e1lido");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, notes, order_items(product_id, quantity, order_item_addons(addon_id))",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido n\u00e3o encontrado");
    const items = ((order as any).order_items ?? [])
      .filter((i: any) => i.product_id)
      .map((i: any) => ({
        p: i.product_id as string,
        q: Math.max(1, Number(i.quantity) || 1),
        a: ((i.order_item_addons ?? []) as any[])
          .map((a) => a.addon_id)
          .filter((x): x is string => typeof x === "string"),
      }));
    return {
      items,
      notes: (order as any).notes ?? null,
    };
  });