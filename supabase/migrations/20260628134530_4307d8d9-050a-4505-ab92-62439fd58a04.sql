REVOKE SELECT (cost) ON public.products FROM anon, authenticated;
-- service_role mantém acesso total para operações administrativas server-side.
GRANT SELECT (cost) ON public.products TO service_role;