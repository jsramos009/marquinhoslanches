-- Helper: has_staff_access = approved staff or approved admin
CREATE OR REPLACE FUNCTION public.has_staff_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND status = 'approved'
      AND role IN ('admin','staff')
  )
$$;

-- updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.order_channel AS ENUM ('whatsapp','balcao','telefone','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('recebido','em_producao','pronto','entregue','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text,
  channel public.order_channel NOT NULL DEFAULT 'whatsapp',
  status public.order_status NOT NULL DEFAULT 'recebido',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  cancel_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_staff_access(auth.uid()));
CREATE POLICY "Staff can insert orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (public.has_staff_access(auth.uid()));
CREATE POLICY "Staff can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_staff_access(auth.uid()))
  WITH CHECK (public.has_staff_access(auth.uid()));
CREATE POLICY "Admins can delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX orders_status_idx ON public.orders(status);

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger to stamp status timestamps
CREATE OR REPLACE FUNCTION public.stamp_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'recebido' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'em_producao' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    IF NEW.status = 'pronto' AND NEW.ready_at IS NULL THEN NEW.ready_at := now(); END IF;
    IF NEW.status = 'entregue' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
    IF NEW.status = 'cancelado' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_stamp_status
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_order_status();

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  unit_price_snapshot numeric(10,2) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage order_items" ON public.order_items
  FOR ALL TO authenticated
  USING (public.has_staff_access(auth.uid()))
  WITH CHECK (public.has_staff_access(auth.uid()));

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX order_items_product_id_idx ON public.order_items(product_id);

-- ORDER ITEM ADDONS
CREATE TABLE public.order_item_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES public.addons(id) ON DELETE SET NULL,
  addon_name_snapshot text NOT NULL,
  unit_price_snapshot numeric(10,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_addons TO authenticated;
GRANT ALL ON public.order_item_addons TO service_role;
ALTER TABLE public.order_item_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage order_item_addons" ON public.order_item_addons
  FOR ALL TO authenticated
  USING (public.has_staff_access(auth.uid()))
  WITH CHECK (public.has_staff_access(auth.uid()));

CREATE INDEX order_item_addons_item_idx ON public.order_item_addons(order_item_id);

-- DASHBOARD METRICS RPC
CREATE OR REPLACE FUNCTION public.dashboard_metrics(_range text DEFAULT '7d')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _start timestamptz;
  _end timestamptz := _now;
  _prev_start timestamptz;
  _prev_end timestamptz;
  _result jsonb;
BEGIN
  IF NOT public.has_staff_access(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _range = 'today' THEN
    _start := date_trunc('day', _now);
  ELSIF _range = '30d' THEN
    _start := _now - interval '30 days';
  ELSIF _range = 'mtd' THEN
    _start := date_trunc('month', _now);
  ELSE
    _range := '7d';
    _start := _now - interval '7 days';
  END IF;

  _prev_end := _start;
  _prev_start := _start - (_end - _start);

  WITH cur AS (
    SELECT count(*) AS n, coalesce(sum(total),0) AS revenue
    FROM public.orders
    WHERE created_at >= _start AND created_at < _end AND status <> 'cancelado'
  ),
  prev AS (
    SELECT count(*) AS n, coalesce(sum(total),0) AS revenue
    FROM public.orders
    WHERE created_at >= _prev_start AND created_at < _prev_end AND status <> 'cancelado'
  ),
  series AS (
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           coalesce(sum(total),0)::numeric AS revenue,
           count(*)::int AS orders
    FROM public.orders
    WHERE created_at >= _start AND created_at < _end AND status <> 'cancelado'
    GROUP BY 1 ORDER BY 1
  ),
  status_counts AS (
    SELECT status::text AS status, count(*)::int AS n
    FROM public.orders
    WHERE created_at >= _start AND created_at < _end
    GROUP BY 1
  ),
  top_products AS (
    SELECT oi.product_id,
           oi.product_name_snapshot AS name,
           sum(oi.line_total)::numeric AS revenue,
           sum(oi.quantity)::int AS qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.created_at >= _start AND o.created_at < _end AND o.status <> 'cancelado'
    GROUP BY 1,2
    ORDER BY revenue DESC
    LIMIT 10
  ),
  sold_ids AS (
    SELECT DISTINCT oi.product_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.created_at >= _start AND o.created_at < _end AND o.status <> 'cancelado'
      AND oi.product_id IS NOT NULL
  ),
  idle_products AS (
    SELECT p.id, p.name, p.price::numeric
    FROM public.products p
    WHERE p.is_active = true
      AND p.id NOT IN (SELECT product_id FROM sold_ids WHERE product_id IS NOT NULL)
    ORDER BY p.name
    LIMIT 20
  ),
  prep_times AS (
    SELECT
      avg(extract(epoch FROM (ready_at - created_at)))::int AS avg_prep_seconds,
      avg(extract(epoch FROM (delivered_at - ready_at)))::int AS avg_deliver_seconds
    FROM public.orders
    WHERE created_at >= _start AND created_at < _end
      AND ready_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'range', _range,
    'start', _start,
    'end', _end,
    'revenue', (SELECT revenue FROM cur),
    'orders', (SELECT n FROM cur),
    'avg_ticket', CASE WHEN (SELECT n FROM cur) > 0 THEN (SELECT revenue/n FROM cur) ELSE 0 END,
    'prev_revenue', (SELECT revenue FROM prev),
    'prev_orders', (SELECT n FROM prev),
    'series', coalesce((SELECT jsonb_agg(s) FROM series s), '[]'::jsonb),
    'status_counts', coalesce((SELECT jsonb_agg(sc) FROM status_counts sc), '[]'::jsonb),
    'top_products', coalesce((SELECT jsonb_agg(tp) FROM top_products tp), '[]'::jsonb),
    'idle_products', coalesce((SELECT jsonb_agg(ip) FROM idle_products ip), '[]'::jsonb),
    'avg_prep_seconds', (SELECT avg_prep_seconds FROM prep_times),
    'avg_deliver_seconds', (SELECT avg_deliver_seconds FROM prep_times)
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_metrics(text) TO authenticated;