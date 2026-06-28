-- Internal helpers: not meant to be called directly via Data API
REVOKE EXECUTE ON FUNCTION public.has_staff_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_order_status() FROM PUBLIC, anon, authenticated;
-- dashboard_metrics is meant to be called by signed-in staff; keep authenticated EXECUTE,
-- just remove anon
REVOKE EXECUTE ON FUNCTION public.dashboard_metrics(text) FROM PUBLIC, anon;