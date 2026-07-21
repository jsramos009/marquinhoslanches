
-- =========================
-- 1. CASH SESSIONS
-- =========================
CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opened_by uuid REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  opening_note text,
  closing_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view cash sessions"
  ON public.cash_sessions FOR SELECT TO authenticated
  USING (public.has_staff_access(auth.uid()));

CREATE POLICY "Staff can insert cash sessions"
  ON public.cash_sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_staff_access(auth.uid()));

CREATE POLICY "Staff can update cash sessions"
  ON public.cash_sessions FOR UPDATE TO authenticated
  USING (public.has_staff_access(auth.uid()))
  WITH CHECK (public.has_staff_access(auth.uid()));

CREATE TRIGGER cash_sessions_set_updated_at
  BEFORE UPDATE ON public.cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apenas uma sessão aberta por vez
CREATE UNIQUE INDEX one_open_cash_session ON public.cash_sessions (closed_at)
  WHERE closed_at IS NULL;

-- =========================
-- 2. COURIERS
-- =========================
CREATE TABLE public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view couriers"
  ON public.couriers FOR SELECT TO authenticated
  USING (public.has_staff_access(auth.uid()));

CREATE POLICY "Admins can manage couriers"
  ON public.couriers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER couriers_set_updated_at
  BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- 3. CUSTOMERS
-- =========================
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  last_address text,
  last_neighborhood text,
  orders_count integer NOT NULL DEFAULT 0,
  total_spent numeric(12,2) NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.has_staff_access(auth.uid()));

CREATE POLICY "Staff can insert customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_staff_access(auth.uid()));

CREATE POLICY "Staff can update customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (public.has_staff_access(auth.uid()))
  WITH CHECK (public.has_staff_access(auth.uid()));

CREATE INDEX customers_phone_digits_idx ON public.customers (phone);
CREATE INDEX customers_name_idx ON public.customers (lower(name));

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- 4. ORDERS: novas colunas
-- =========================
ALTER TABLE public.orders
  ADD COLUMN cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  ADD COLUMN courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL;

CREATE INDEX orders_cash_session_idx ON public.orders (cash_session_id);
CREATE INDEX orders_courier_idx ON public.orders (courier_id);

-- =========================
-- 5. Helper: caixa aberto atual
-- =========================
CREATE OR REPLACE FUNCTION public.current_cash_session_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_cash_session_id() TO authenticated, anon;

-- =========================
-- 6. Trigger: vincular pedido ao caixa aberto + upsert cliente
-- =========================
CREATE OR REPLACE FUNCTION public.orders_attach_session_and_customer()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _session uuid;
  _phone_norm text;
BEGIN
  IF NEW.cash_session_id IS NULL THEN
    SELECT id INTO _session FROM public.cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1;
    IF _session IS NOT NULL THEN NEW.cash_session_id := _session; END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_before_insert_session
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_attach_session_and_customer();

-- Após inserir: upsert customers
CREATE OR REPLACE FUNCTION public.orders_upsert_customer()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _phone_norm text;
BEGIN
  _phone_norm := regexp_replace(coalesce(NEW.customer_phone, ''), '\D', '', 'g');
  IF length(_phone_norm) < 8 THEN RETURN NEW; END IF;

  INSERT INTO public.customers (phone, name, last_address, last_neighborhood, orders_count, total_spent, last_order_at)
  VALUES (
    _phone_norm,
    NULLIF(trim(coalesce(NEW.customer_name, '')), ''),
    NEW.delivery_address,
    NEW.delivery_neighborhood,
    1,
    coalesce(NEW.total, 0),
    NEW.created_at
  )
  ON CONFLICT (phone) DO UPDATE SET
    name = COALESCE(NULLIF(trim(coalesce(EXCLUDED.name, '')), ''), public.customers.name),
    last_address = COALESCE(EXCLUDED.last_address, public.customers.last_address),
    last_neighborhood = COALESCE(EXCLUDED.last_neighborhood, public.customers.last_neighborhood),
    orders_count = public.customers.orders_count + 1,
    total_spent = public.customers.total_spent + coalesce(EXCLUDED.total_spent, 0),
    last_order_at = GREATEST(public.customers.last_order_at, EXCLUDED.last_order_at),
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_after_insert_customer
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_upsert_customer();

-- =========================
-- 7. Backfill customers a partir do histórico
-- =========================
INSERT INTO public.customers (phone, name, last_address, last_neighborhood, orders_count, total_spent, last_order_at)
SELECT
  regexp_replace(customer_phone, '\D', '', 'g') AS phone,
  (array_agg(customer_name ORDER BY created_at DESC) FILTER (WHERE customer_name IS NOT NULL AND trim(customer_name) <> ''))[1] AS name,
  (array_agg(delivery_address ORDER BY created_at DESC) FILTER (WHERE delivery_address IS NOT NULL))[1] AS last_address,
  (array_agg(delivery_neighborhood ORDER BY created_at DESC) FILTER (WHERE delivery_neighborhood IS NOT NULL))[1] AS last_neighborhood,
  count(*)::int AS orders_count,
  coalesce(sum(total), 0) AS total_spent,
  max(created_at) AS last_order_at
FROM public.orders
WHERE customer_phone IS NOT NULL
  AND length(regexp_replace(customer_phone, '\D', '', 'g')) >= 8
GROUP BY regexp_replace(customer_phone, '\D', '', 'g')
ON CONFLICT (phone) DO NOTHING;
