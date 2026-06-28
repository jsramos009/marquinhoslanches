REVOKE EXECUTE ON FUNCTION public.dashboard_metrics(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(text) TO service_role;