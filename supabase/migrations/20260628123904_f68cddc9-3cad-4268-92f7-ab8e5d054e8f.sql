GRANT EXECUTE ON FUNCTION public.has_staff_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(text) TO authenticated;