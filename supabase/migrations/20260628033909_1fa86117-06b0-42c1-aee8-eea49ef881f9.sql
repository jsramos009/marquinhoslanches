ALTER TABLE public.products ADD COLUMN IF NOT EXISTS suggestion_order integer;
COMMENT ON COLUMN public.products.suggestion_order IS 'NULL = not suggested. Lower value = higher priority in cross-sell suggestions. Currently used for beverage cross-sell after adding a hamburger/hot dog.';

WITH first_three AS (
  SELECT p.id, row_number() OVER (ORDER BY p.sort_order, p.created_at, p.name) AS rn
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  WHERE c.slug = 'bebidas' AND p.is_active = true
)
UPDATE public.products p
SET suggestion_order = f.rn
FROM first_three f
WHERE p.id = f.id AND f.rn <= 3;