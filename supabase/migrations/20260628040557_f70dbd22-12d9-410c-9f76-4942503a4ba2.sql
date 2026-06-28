-- 1) Enum de papéis
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabela user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Security-definer function para checar papel sem recursão
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- 4) Policies user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Garantir GRANT de escrita para authenticated nas tabelas de catálogo
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.addons TO authenticated;

-- 6) Policies admin para escrita em products/categories/addons (mantém SELECT público existente)
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products"
ON public.products FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories"
ON public.categories FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage addons" ON public.addons;
CREATE POLICY "Admins manage addons"
ON public.addons FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7) Admins enxergam também itens inativos (catálogo completo)
DROP POLICY IF EXISTS "Admins view all products" ON public.products;
CREATE POLICY "Admins view all products"
ON public.products FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all categories" ON public.categories;
CREATE POLICY "Admins view all categories"
ON public.categories FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all addons" ON public.addons;
CREATE POLICY "Admins view all addons"
ON public.addons FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));