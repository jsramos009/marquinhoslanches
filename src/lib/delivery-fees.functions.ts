import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type DeliveryFee = {
  id: string;
  neighborhood: string;
  fee: number;
  is_active: boolean;
};

export const listDeliveryFeesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeliveryFee[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("delivery_fees")
      .select("id, neighborhood, fee, is_active")
      .order("neighborhood", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((d: any) => ({ ...d, fee: Number(d.fee) }));
  });

type UpsertInput = {
  id?: string | null;
  neighborhood: string;
  fee: number;
  is_active: boolean;
};

export const upsertDeliveryFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsertInput) => {
    const neighborhood = String(input?.neighborhood ?? "").trim();
    const fee = Number(input?.fee);
    if (!neighborhood) throw new Error("Informe o nome do bairro.");
    if (!Number.isFinite(fee) || fee < 0) throw new Error("Valor do frete inválido.");
    return {
      id: input.id ?? null,
      neighborhood,
      fee,
      is_active: Boolean(input.is_active),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.id) {
      const { error } = await supabase
        .from("delivery_fees")
        .update({
          neighborhood: data.neighborhood,
          fee: data.fee,
          is_active: data.is_active,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabase
      .from("delivery_fees")
      .insert({
        neighborhood: data.neighborhood,
        fee: data.fee,
        is_active: data.is_active,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

export const deleteDeliveryFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("ID obrigatório.");
    return { id: String(input.id) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("delivery_fees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });