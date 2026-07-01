ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_neighborhood text,
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'pickup' CHECK (delivery_mode IN ('delivery','pickup'));