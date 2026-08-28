import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  DiningCartItem,
  DiningCatalog,
  DiningPaymentMethod,
  DiningTableView,
} from "@/lib/dining-domain";
import { asDynamicDatabase, type DynamicDatabase } from "@/lib/supabase-dynamic";

type TableRow = { id: string; table_number: number; is_active: boolean };
type SessionRow = {
  id: string;
  dining_table_id: string;
  customer_name: string | null;
  notes: string | null;
  opened_at: string;
};
type SessionAddonRow = {
  id: string;
  addon_id: string | null;
  addon_name_snapshot: string;
  unit_price_snapshot: number | string;
  quantity: number;
};
type SessionItemRow = {
  id: string;
  dining_session_id: string;
  dining_consumption_batch_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_snapshot: number | string;
  quantity: number;
  line_total: number | string;
  notes: string | null;
  dining_session_item_addons?: SessionAddonRow[];
  dining_consumption_batches?: { batch_number: number } | null;
};
type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  price: number | string;
  image_url: string | null;
  accepts_addons: boolean;
};
type AddonRow = { id: string; name: string; price: number | string };
type ProductAddonRow = { product_id: string; addon_id: string };

async function staffDatabase(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .in("role", ["admin", "staff", "balcao"])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
  return asDynamicDatabase(supabaseAdmin);
}

async function requireOpenCashSession(db: DynamicDatabase) {
  const { data, error } = await db
    .from("cash_sessions")
    .select("id")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Abra o caixa antes de iniciar ou adicionar consumo às mesas.");
}

export const listDiningTables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiningTableView[]> => {
    const db = await staffDatabase(context.userId);
    const [{ data: tables, error: tableError }, { data: sessions, error: sessionError }] =
      await Promise.all([
        db.from("dining_tables").select("id, table_number, is_active").order("table_number"),
        db
          .from("dining_sessions")
          .select("id, dining_table_id, customer_name, notes, opened_at")
          .eq("status", "open"),
      ]);
    if (tableError) throw new Error(tableError.message);
    if (sessionError) throw new Error(sessionError.message);

    const sessionRows = (sessions ?? []) as SessionRow[];
    const sessionIds = sessionRows.map((session) => session.id);
    const { data: items, error: itemError } = sessionIds.length
      ? await db
          .from("dining_session_items")
          .select(
            "id, dining_session_id, dining_consumption_batch_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, line_total, notes, created_at, dining_session_item_addons(id, addon_id, addon_name_snapshot, unit_price_snapshot, quantity), dining_consumption_batches(batch_number)",
          )
          .in("dining_session_id", sessionIds)
          .order("created_at")
      : { data: [], error: null };
    if (itemError) throw new Error(itemError.message);

    const itemRows = (items ?? []) as SessionItemRow[];
    const batchIds = itemRows.map((item) => item.dining_consumption_batch_id);
    const { data: failedJobs, error: jobError } = batchIds.length
      ? await db
          .from("print_jobs")
          .select("source_id")
          .eq("source_kind", "dining_batch")
          .eq("status", "failed")
          .in("source_id", batchIds)
      : { data: [], error: null };
    if (jobError) throw new Error(jobError.message);

    const failedBatchIds = new Set(
      ((failedJobs ?? []) as { source_id: string }[]).map((job) => job.source_id),
    );
    const itemsBySession = new Map<string, SessionItemRow[]>();
    for (const item of itemRows) {
      const list = itemsBySession.get(item.dining_session_id) ?? [];
      list.push(item);
      itemsBySession.set(item.dining_session_id, list);
    }
    const sessionsByTable = new Map(
      sessionRows.map((session) => [session.dining_table_id, session]),
    );

    return ((tables ?? []) as TableRow[]).map((table) => {
      const session = sessionsByTable.get(table.id);
      if (!session) {
        return {
          id: table.id,
          table_number: Number(table.table_number),
          is_active: Boolean(table.is_active),
          state: "free",
          session: null,
        };
      }
      const sessionItems = itemsBySession.get(session.id) ?? [];
      const hasPrintFailure = sessionItems.some((item) =>
        failedBatchIds.has(item.dining_consumption_batch_id),
      );
      const mappedItems = sessionItems.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name_snapshot: item.product_name_snapshot,
        unit_price_snapshot: Number(item.unit_price_snapshot),
        quantity: Number(item.quantity),
        line_total: Number(item.line_total),
        notes: item.notes,
        batch_number: Number(item.dining_consumption_batches?.batch_number ?? 0),
        addons: (item.dining_session_item_addons ?? []).map((addon) => ({
          id: addon.id,
          addon_id: addon.addon_id,
          addon_name_snapshot: addon.addon_name_snapshot,
          unit_price_snapshot: Number(addon.unit_price_snapshot),
          quantity: Number(addon.quantity),
        })),
      }));
      return {
        id: table.id,
        table_number: Number(table.table_number),
        is_active: Boolean(table.is_active),
        state: hasPrintFailure ? "print_failed" : "occupied",
        session: {
          id: session.id,
          customer_name: session.customer_name,
          notes: session.notes,
          opened_at: session.opened_at,
          subtotal: mappedItems.reduce((sum, item) => sum + item.line_total, 0),
          items: mappedItems,
        },
      } as DiningTableView;
    });
  });

export const getDiningCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiningCatalog> => {
    const db = await staffDatabase(context.userId);
    const [categories, products, addons, links] = await Promise.all([
      db
        .from("categories")
        .select("id, name, sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      db
        .from("products")
        .select("id, category_id, name, price, image_url, accepts_addons")
        .eq("is_active", true)
        .order("sort_order"),
      db.from("addons").select("id, name, price").eq("is_active", true).order("sort_order"),
      db.from("product_addons").select("product_id, addon_id"),
    ]);
    for (const result of [categories, products, addons, links]) {
      if (result.error) throw new Error(result.error.message);
    }
    const addonIdsByProduct = new Map<string, string[]>();
    for (const link of (links.data ?? []) as ProductAddonRow[]) {
      const ids = addonIdsByProduct.get(link.product_id) ?? [];
      ids.push(link.addon_id);
      addonIdsByProduct.set(link.product_id, ids);
    }
    return {
      categories: (categories.data ?? []) as DiningCatalog["categories"],
      products: ((products.data ?? []) as ProductRow[]).map((product) => ({
        ...product,
        price: Number(product.price),
        addon_ids: addonIdsByProduct.get(product.id) ?? [],
      })),
      addons: ((addons.data ?? []) as AddonRow[]).map((addon) => ({
        ...addon,
        price: Number(addon.price),
      })),
    };
  });

export const openDiningSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      tableId: string;
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
    }) => {
      if (!data?.tableId) throw new Error("Mesa inválida.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    await requireOpenCashSession(db);
    const { data: sessionId, error } = await db.rpc("dining_open_session", {
      p_table_id: data.tableId,
      p_opened_by: context.userId,
      p_customer_name: data.customerName?.trim() || null,
      p_customer_phone: data.customerPhone?.replace(/\D/g, "") || null,
      p_customer_address: data.customerAddress?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { sessionId: sessionId as string };
  });

export const setDiningTableCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { count: number }) => {
    if (!Number.isInteger(data?.count) || data.count < 1 || data.count > 30) {
      throw new Error("A quantidade de mesas deve ficar entre 1 e 30.");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    const { error } = await db.rpc("dining_set_active_count", { p_active_count: data.count });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addDiningConsumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      sessionId: string;
      requestKey: string;
      items: DiningCartItem[];
      notes?: string | null;
    }) => {
      if (
        !data?.sessionId ||
        !data.requestKey ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        throw new Error("Adicione pelo menos um item.");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    await requireOpenCashSession(db);
    const { data: batchId, error } = await db.rpc("dining_add_consumption", {
      p_session_id: data.sessionId,
      p_request_key: data.requestKey,
      p_items: data.items,
      p_created_by: context.userId,
      p_notes: data.notes?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { batchId: batchId as string };
  });

export const cancelEmptyDiningSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => {
    if (!data?.sessionId) throw new Error("Comanda inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    const { error } = await db.rpc("dining_cancel_empty_session", {
      p_session_id: data.sessionId,
      p_cancelled_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeDiningSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      sessionId: string;
      serviceChargePercent: number;
      paymentMethod: DiningPaymentMethod;
      secondaryPaymentMethod?: Exclude<DiningPaymentMethod, "misto" | "nao_informado"> | null;
      cashAmount?: number | null;
      changeFor?: number | null;
      notes?: string | null;
    }) => {
      if (!data?.sessionId) throw new Error("Comanda inválida.");
      if (
        !Number.isFinite(data.serviceChargePercent) ||
        data.serviceChargePercent < 0 ||
        data.serviceChargePercent > 30
      ) {
        throw new Error("A taxa de serviço deve ficar entre 0% e 30%.");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    const { data: receiptJobId, error } = await db.rpc("dining_close_session", {
      p_session_id: data.sessionId,
      p_closed_by: context.userId,
      p_service_charge_percent: data.serviceChargePercent,
      p_payment_method: data.paymentMethod,
      p_secondary_payment_method: data.secondaryPaymentMethod ?? null,
      p_cash_amount: data.cashAmount ?? null,
      p_change_for: data.changeFor ?? null,
      p_notes: data.notes?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { receiptJobId: receiptJobId as string };
  });
