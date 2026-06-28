import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
export { isHamburgerCategory } from "@/lib/menu-utils";

export type Category = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
};

export type Product = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  accepts_addons: boolean;
  sort_order: number;
  suggestion_order: number | null;
};

export type Addon = {
  id: string;
  name: string;
  price: number;
  sort_order: number;
};

export type MenuData = {
  categories: Category[];
  products: Product[];
  addons: Addon[];
};

export const menuQueryOptions = () =>
  queryOptions({
    queryKey: ["menu"],
    queryFn: async (): Promise<MenuData> => {
      const [cats, prods, addons] = await Promise.all([
        supabase
          .from("categories")
          .select("id, slug, name, sort_order")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("products")
          .select(
            "id, category_id, name, description, price, image_url, accepts_addons, sort_order, suggestion_order",
          )
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("addons")
          .select("id, name, price, sort_order")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (cats.error) throw cats.error;
      if (prods.error) throw prods.error;
      if (addons.error) throw addons.error;
      return {
        categories: cats.data.map((c) => ({ ...c, sort_order: c.sort_order ?? 0 })) as Category[],
        products: (prods.data as unknown as Product[]).map((p) => ({
          ...p,
          price: Number(p.price),
        })),
        addons: (addons.data as unknown as Addon[]).map((a) => ({
          ...a,
          price: Number(a.price),
        })),
      };
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });