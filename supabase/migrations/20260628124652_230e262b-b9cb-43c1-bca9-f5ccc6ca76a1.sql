CREATE TYPE public.order_payment_method AS ENUM ('pix','cartao_credito','cartao_debito','dinheiro','nao_informado');

ALTER TABLE public.orders
  ADD COLUMN payment_method public.order_payment_method NOT NULL DEFAULT 'nao_informado',
  ADD COLUMN change_for numeric(10,2);