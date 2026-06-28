
-- 1. Estoque nos produtos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity integer,
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false;

-- 2. Vínculo produto <-> adicional
CREATE TABLE IF NOT EXISTS public.product_addons (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, addon_id)
);

GRANT SELECT ON public.product_addons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_addons TO authenticated;
GRANT ALL ON public.product_addons TO service_role;

ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vínculos visíveis para todos"
  ON public.product_addons FOR SELECT
  USING (true);

CREATE POLICY "Admins manage product_addons"
  ON public.product_addons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_product_addons_product ON public.product_addons(product_id);
CREATE INDEX IF NOT EXISTS idx_product_addons_addon ON public.product_addons(addon_id);
