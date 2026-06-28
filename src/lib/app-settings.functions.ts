import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppSettings = {
  pix_key: string;
  pix_merchant_name: string;
  pix_merchant_city: string;
  menu_link: string;
};

const KEYS: (keyof AppSettings)[] = [
  "pix_key",
  "pix_merchant_name",
  "pix_merchant_city",
  "menu_link",
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
    return {
      pix_key: map.pix_key ?? "",
      pix_merchant_name: map.pix_merchant_name ?? "",
      pix_merchant_city: map.pix_merchant_city ?? "",
      menu_link: map.menu_link ?? "",
    };
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