import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isCompleteOnlineOrder,
  onlineScanWindow,
  type PrintJob,
  type ThermalPayload,
} from "@/lib/print-domain";
import { asDynamicDatabase } from "@/lib/supabase-dynamic";

type OnlineOrderItemRow = {
  id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price_snapshot: number | string;
  line_total: number | string;
  order_item_addons?: {
    addon_name_snapshot: string;
    quantity: number;
    unit_price_snapshot: number | string;
  }[];
};
type OnlineOrderRow = {
  id: string;
  customer_name: string | null;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  notes: string | null;
  payment_method: string | null;
  change_for: number | string | null;
  cash_amount: number | string | null;
  secondary_payment_method: string | null;
  delivery_mode: string;
  delivery_fee: number | string | null;
  delivery_address: string | null;
  delivery_neighborhood: string | null;
  created_at: string;
  order_items?: OnlineOrderItemRow[];
};
type PrintJobRow = Omit<PrintJob, "attempts" | "payload"> & {
  attempts: number | string;
  payload: ThermalPayload;
};

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

function mapJob(row: PrintJobRow): PrintJob {
  return {
    ...row,
    attempts: Number(row.attempts),
    payload: row.payload as ThermalPayload,
  };
}

export const reconcileOnlinePrintJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await staffDatabase(context.userId);
    const { data: state, error: stateError } = await db
      .from("print_system_state")
      .select("activated_at, last_online_scan_at")
      .eq("singleton", true)
      .single();
    if (stateError) throw new Error(stateError.message);

    const scanState = state as { activated_at: string; last_online_scan_at: string | null };
    const scanCompletedAt = new Date();
    const scanWindow = onlineScanWindow(
      scanState.activated_at,
      scanState.last_online_scan_at,
      scanCompletedAt,
    );
    const orders: OnlineOrderRow[] = [];
    const pageSize = 250;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error: orderError } = await db
        .from("orders")
        .select(
          "id, customer_name, channel, status, subtotal, discount, total, notes, payment_method, change_for, cash_amount, secondary_payment_method, delivery_mode, delivery_fee, delivery_address, delivery_neighborhood, created_at, order_items(id, product_name_snapshot, quantity, unit_price_snapshot, line_total, order_item_addons(addon_name_snapshot, quantity, unit_price_snapshot))",
        )
        .eq("channel", "whatsapp")
        .neq("status", "cancelado")
        .gte("created_at", scanWindow.from)
        .lte("created_at", scanWindow.through)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (orderError) throw new Error(orderError.message);
      const pageRows = (page ?? []) as OnlineOrderRow[];
      orders.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }

    const jobs = [];
    let incomplete = 0;
    for (const raw of orders) {
      const items = (raw.order_items ?? []).map((item) => ({
        id: item.id,
        name: item.product_name_snapshot,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price_snapshot),
        line_total: Number(item.line_total),
        addons: (item.order_item_addons ?? []).map((addon) => ({
          name: addon.addon_name_snapshot,
          quantity: Number(addon.quantity),
          unit_price: Number(addon.unit_price_snapshot),
        })),
      }));
      const complete = isCompleteOnlineOrder({
        subtotal: Number(raw.subtotal),
        discount: Number(raw.discount),
        delivery_fee: Number(raw.delivery_fee ?? 0),
        total: Number(raw.total),
        items,
      });
      if (!complete) {
        incomplete += 1;
        continue;
      }
      jobs.push({
        job_key: `online-order:${raw.id}`,
        source_kind: "online_order",
        source_id: raw.id,
        document_type: "kitchen_ticket",
        auto_print: true,
        payload: {
          source: "online_order",
          order_id: raw.id,
          customer_name: raw.customer_name,
          created_at: raw.created_at,
          delivery_mode: raw.delivery_mode,
          delivery_address: raw.delivery_address,
          delivery_neighborhood: raw.delivery_neighborhood,
          notes: raw.notes,
          subtotal: Number(raw.subtotal),
          discount: Number(raw.discount),
          delivery_fee: Number(raw.delivery_fee ?? 0),
          total: Number(raw.total),
          payment_method: raw.payment_method ?? "nao_informado",
          secondary_payment_method: raw.secondary_payment_method,
          cash_amount: raw.cash_amount == null ? null : Number(raw.cash_amount),
          change_for: raw.change_for == null ? null : Number(raw.change_for),
          items,
        } satisfies ThermalPayload,
      });
    }

    if (jobs.length) {
      const { error: insertError } = await db
        .from("print_jobs")
        .upsert(jobs, { onConflict: "job_key", ignoreDuplicates: true });
      if (insertError) throw new Error(insertError.message);
    }
    const { error: updateError } = await db
      .from("print_system_state")
      .update({
        last_online_scan_at: scanCompletedAt.toISOString(),
        updated_at: scanCompletedAt.toISOString(),
      })
      .eq("singleton", true);
    if (updateError) throw new Error(updateError.message);
    return { scanned: (orders ?? []).length, eligible: jobs.length, incomplete };
  });

export const listPrintJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PrintJob[]> => {
    const db = await staffDatabase(context.userId);
    const { data: recent, error } = await db
      .from("print_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const actionable: PrintJobRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error: actionableError } = await db
        .from("print_jobs")
        .select("*")
        .in("status", ["pending", "failed", "printing"])
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (actionableError) throw new Error(actionableError.message);
      const pageRows = (page ?? []) as PrintJobRow[];
      actionable.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }

    const recentRows = (recent ?? []) as PrintJobRow[];
    const byId = new Map([...actionable, ...recentRows].map((row) => [row.id, mapJob(row)]));
    return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  });

export const claimNextPrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { stationId: string }) => data)
  .handler(async ({ data, context }): Promise<PrintJob | null> => {
    if (!data.stationId?.trim()) throw new Error("Estação inválida.");
    const db = await staffDatabase(context.userId);
    const { data: rows, error } = await db.rpc("print_claim_next_job", {
      p_station_id: data.stationId,
    });
    if (error) throw new Error(error.message);
    const claimedRows = (rows ?? []) as PrintJobRow[];
    return claimedRows[0] ? mapJob(claimedRows[0]) : null;
  });

export const claimPrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string; stationId: string }) => data)
  .handler(async ({ data, context }): Promise<PrintJob | null> => {
    const db = await staffDatabase(context.userId);
    const { data: rows, error } = await db.rpc("print_claim_job", {
      p_job_id: data.jobId,
      p_station_id: data.stationId,
    });
    if (error) throw new Error(error.message);
    const claimedRows = (rows ?? []) as PrintJobRow[];
    return claimedRows[0] ? mapJob(claimedRows[0]) : null;
  });

export const completePrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string; stationId: string }) => data)
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    const { error } = await db.rpc("print_complete_job", {
      p_job_id: data.jobId,
      p_station_id: data.stationId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renewPrintJobClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string; stationId: string; holdSeconds?: number }) => {
    const holdSeconds = data.holdSeconds ?? 600;
    if (!Number.isInteger(holdSeconds) || holdSeconds < 30 || holdSeconds > 7200) {
      throw new Error("Duração de lease inválida.");
    }
    return { ...data, holdSeconds };
  })
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    const { error } = await db.rpc("print_renew_job_claim", {
      p_job_id: data.jobId,
      p_station_id: data.stationId,
      p_hold_seconds: data.holdSeconds,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const failPrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string; stationId: string; error: string }) => data)
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    const { error } = await db.rpc("print_fail_job", {
      p_job_id: data.jobId,
      p_station_id: data.stationId,
      p_error: data.error,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retryPrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => data)
  .handler(async ({ data, context }) => {
    const db = await staffDatabase(context.userId);
    const { error } = await db.rpc("print_retry_job", { p_job_id: data.jobId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getQzCertificate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffDatabase(context.userId);
    const certificate = process.env.QZ_TRAY_CERTIFICATE?.replaceAll("\\n", "\n");
    if (!certificate) throw new Error("QZ_TRAY_CERTIFICATE não configurado no servidor.");
    return certificate;
  });

export const signQzPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payload: string }) => {
    if (!data?.payload || data.payload.length > 100_000)
      throw new Error("Payload de assinatura inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await staffDatabase(context.userId);
    const privateKey = process.env.QZ_TRAY_PRIVATE_KEY?.replaceAll("\\n", "\n");
    if (!privateKey) throw new Error("QZ_TRAY_PRIVATE_KEY não configurada no servidor.");
    const { createSign } = await import("node:crypto");
    const signer = createSign("RSA-SHA512");
    signer.update(data.payload);
    signer.end();
    return signer.sign(privateKey, "base64");
  });
