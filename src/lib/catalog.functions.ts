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

export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type CatalogProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  accepts_addons: boolean;
  is_active: boolean;
  sort_order: number;
  stock_quantity: number | null;
  track_stock: boolean;
  addon_ids: string[];
};

export type CatalogAddon = {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  sort_order: number;
};

export type CatalogData = {
  categories: CatalogCategory[];
  products: CatalogProduct[];
  addons: CatalogAddon[];
};

export const getCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [cats, prods, addons, links] = await Promise.all([
      supabase.from("categories").select("id, slug, name, sort_order, is_active").order("sort_order"),
      supabase
        .from("products")
        .select(
          "id, category_id, name, description, price, image_url, accepts_addons, is_active, sort_order, stock_quantity, track_stock",
        )
        .order("sort_order"),
      supabase.from("addons").select("id, name, price, is_active, sort_order").order("sort_order"),
      supabase.from("product_addons").select("product_id, addon_id"),
    ]);
    if (cats.error) throw new Error(cats.error.message);
    if (prods.error) throw new Error(prods.error.message);
    if (addons.error) throw new Error(addons.error.message);
    if (links.error) throw new Error(links.error.message);

    const linkMap = new Map<string, string[]>();
    for (const l of links.data ?? []) {
      const arr = linkMap.get(l.product_id) ?? [];
      arr.push(l.addon_id);
      linkMap.set(l.product_id, arr);
    }

    const data: CatalogData = {
      categories: (cats.data ?? []) as CatalogCategory[],
      products: (prods.data ?? []).map((p: any) => ({
        ...p,
        price: Number(p.price),
        addon_ids: linkMap.get(p.id) ?? [],
      })),
      addons: (addons.data ?? []).map((a: any) => ({ ...a, price: Number(a.price) })),
    };
    return data;
  });

type ProductUpsert = {
  id?: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  accepts_addons: boolean;
  is_active: boolean;
  sort_order: number;
  stock_quantity: number | null;
  track_stock: boolean;
  addon_ids: string[];
};

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ProductUpsert) => {
    if (!d.name?.trim()) throw new Error("Nome obrigatório.");
    if (!d.category_id) throw new Error("Categoria obrigatória.");
    if (!(d.price >= 0)) throw new Error("Preço inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const payload = {
      category_id: data.category_id,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      price: data.price,
      image_url: data.image_url?.trim() || null,
      accepts_addons: data.accepts_addons,
      is_active: data.is_active,
      sort_order: data.sort_order,
      stock_quantity: data.track_stock ? Math.max(0, Math.floor(data.stock_quantity ?? 0)) : null,
      track_stock: data.track_stock,
    };

    let productId = data.id;
    if (productId) {
      const { error } = await supabase.from("products").update(payload).eq("id", productId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      productId = ins.id as string;
    }

    // Sync product_addons
    const { error: delErr } = await supabase.from("product_addons").delete().eq("product_id", productId);
    if (delErr) throw new Error(delErr.message);
    if (data.addon_ids.length) {
      const rows = data.addon_ids.map((addon_id, i) => ({ product_id: productId, addon_id, sort_order: i }));
      const { error: insErr } = await supabase.from("product_addons").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    return { id: productId };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setProductStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; track_stock: boolean; stock_quantity: number | null; is_active?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch = {
      track_stock: data.track_stock,
      stock_quantity: data.track_stock ? Math.max(0, Math.floor(data.stock_quantity ?? 0)) : null,
      ...(typeof data.is_active === "boolean" ? { is_active: data.is_active } : {}),
    };
    const { error } = await context.supabase.from("products").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type AddonUpsert = {
  id?: string;
  name: string;
  price: number;
  is_active: boolean;
  sort_order: number;
};

export const upsertAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AddonUpsert) => {
    if (!d.name?.trim()) throw new Error("Nome obrigatório.");
    if (!(d.price >= 0)) throw new Error("Preço inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = {
      name: data.name.trim(),
      price: data.price,
      is_active: data.is_active,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await context.supabase.from("addons").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      const { data: ins, error } = await context.supabase.from("addons").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      return { id: ins.id as string };
    }
  });

export const deleteAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("addons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });