import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppSettings = {
  pix_key: string;
  pix_merchant_name: string;
  pix_merchant_city: string;
  menu_link: string;
  business_name: string;
  business_phone: string;
  business_address: string;
  operating_hours: string; // JSON string
  block_when_closed: string; // "1" | "0"
  min_order_value: string; // number as string
  service_fee_percent: string;
  estimated_prep_minutes: string;
  estimated_delivery_minutes: string;
  wa_msg_accepted: string;
  wa_msg_on_way: string;
};

const KEYS: (keyof AppSettings)[] = [
  "pix_key",
  "pix_merchant_name",
  "pix_merchant_city",
  "menu_link",
  "business_name",
  "business_phone",
  "business_address",
  "operating_hours",
  "block_when_closed",
  "min_order_value",
  "service_fee_percent",
  "estimated_prep_minutes",
  "estimated_delivery_minutes",
  "wa_msg_accepted",
  "wa_msg_on_way",
];

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const getAppSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppSettings> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value");
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: any) => {
      map[r.key] = r.value ?? "";
    });
    const out = {} as AppSettings;
    for (const k of KEYS) out[k] = map[k] ?? "";
    return out;
  });

export const updateAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<AppSettings>) => {
    const out: Partial<AppSettings> = {};
    for (const k of KEYS) {
      if (typeof input?.[k] === "string") {
        out[k] = String(input[k]).trim();
      }
    }
    return out;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const rows = Object.entries(data).map(([key, value]) => ({
      key,
      value: value ?? "",
    }));
    if (rows.length === 0) return { ok: true };
    const { error } = await supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });