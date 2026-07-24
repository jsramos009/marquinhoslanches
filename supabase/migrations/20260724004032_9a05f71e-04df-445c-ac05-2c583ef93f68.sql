CREATE OR REPLACE FUNCTION public.dashboard_metrics(_range text DEFAULT '7d'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    _start := date_trunc('day', _now AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  ELSIF _range = '30d' THEN
    _start := _now - interval '30 days';
  ELSIF _range = 'mtd' THEN
    _start := date_trunc('month', _now AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  ELSE
    _range := '7d';
    _start := _now - interval '7 days';
  END IF;

  _prev_end := _start;
  _prev_start := _start - (_end - _start);

  WITH cur AS (
    SELECT count(*) AS n, coalesce(sum(total),0) AS revenue FROM public.orders
    WHERE created_at >= _start AND created_at < _end AND status <> 'cancelado'
  ), prev AS (
    SELECT count(*) AS n, coalesce(sum(total),0) AS revenue FROM public.orders
    WHERE created_at >= _prev_start AND created_at < _prev_end AND status <> 'cancelado'
  ), series AS (
    SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day,
           coalesce(sum(total),0)::numeric AS revenue, count(*)::int AS orders
    FROM public.orders WHERE created_at >= _start AND created_at < _end AND status <> 'cancelado'
    GROUP BY 1 ORDER BY 1
  ), status_counts AS (
    SELECT status::text AS status, count(*)::int AS n FROM public.orders
    WHERE created_at >= _start AND created_at < _end GROUP BY 1
  ), top_products AS (
    SELECT oi.product_id, oi.product_name_snapshot AS name, sum(oi.line_total)::numeric AS revenue, sum(oi.quantity)::int AS qty
    FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
    WHERE o.created_at >= _start AND o.created_at < _end AND o.status <> 'cancelado'
    GROUP BY 1,2 ORDER BY revenue DESC LIMIT 10
  ), sold_ids AS (
    SELECT DISTINCT oi.product_id FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
    WHERE o.created_at >= _start AND o.created_at < _end AND o.status <> 'cancelado' AND oi.product_id IS NOT NULL
  ), idle_products AS (
    SELECT p.id, p.name, p.price::numeric FROM public.products p
    WHERE p.is_active = true AND p.id NOT IN (SELECT product_id FROM sold_ids WHERE product_id IS NOT NULL)
    ORDER BY p.name LIMIT 20
  ), prep_times AS (
    SELECT avg(extract(epoch FROM (ready_at - created_at)))::int AS avg_prep_seconds,
           avg(extract(epoch FROM (delivered_at - ready_at)))::int AS avg_deliver_seconds
    FROM public.orders WHERE created_at >= _start AND created_at < _end AND ready_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'range', _range, 'start', _start, 'end', _end,
    'revenue', (SELECT revenue FROM cur), 'orders', (SELECT n FROM cur),
    'avg_ticket', CASE WHEN (SELECT n FROM cur) > 0 THEN (SELECT revenue/n FROM cur) ELSE 0 END,
    'prev_revenue', (SELECT revenue FROM prev), 'prev_orders', (SELECT n FROM prev),
    'series', coalesce((SELECT jsonb_agg(s) FROM series s), '[]'::jsonb),
    'status_counts', coalesce((SELECT jsonb_agg(sc) FROM status_counts sc), '[]'::jsonb),
    'top_products', coalesce((SELECT jsonb_agg(tp) FROM top_products tp), '[]'::jsonb),
    'idle_products', coalesce((SELECT jsonb_agg(ip) FROM idle_products ip), '[]'::jsonb),
    'avg_prep_seconds', (SELECT avg_prep_seconds FROM prep_times),
    'avg_deliver_seconds', (SELECT avg_deliver_seconds FROM prep_times)
  ) INTO _result;
  RETURN _result;
END;
$function$;