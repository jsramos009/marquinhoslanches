
-- 1) Restrict cost column exposure: revoke from anon/authenticated
REVOKE SELECT (cost) ON public.products FROM anon, authenticated;

-- 2) Revoke EXECUTE on internal SECURITY DEFINER helpers from signed-in/anon users.
--    They are only used inside RLS policies, which run as the function owner.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_staff_access(uuid) FROM PUBLIC, anon, authenticated;
