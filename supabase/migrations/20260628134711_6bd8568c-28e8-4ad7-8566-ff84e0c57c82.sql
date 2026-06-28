CREATE INDEX IF NOT EXISTS idx_products_active_sort
  ON public.products (sort_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_active_category_sort
  ON public.products (category_id, sort_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_categories_active_sort
  ON public.categories (sort_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_addons_active_sort
  ON public.addons (sort_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);