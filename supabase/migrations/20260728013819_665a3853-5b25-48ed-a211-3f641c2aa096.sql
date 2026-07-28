ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cash_amount numeric,
  ADD COLUMN IF NOT EXISTS secondary_payment_method public.order_payment_method;