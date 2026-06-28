-- Resolve login/access errors caused by direct calls to locked SECURITY DEFINER helpers in RLS policies.
-- The helper functions stay non-executable by anon/authenticated, but table policies no longer call them directly.

-- user_roles: the app only needs users to read their own access status from the browser.
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admin role management is performed by authorized server functions with service role.
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

-- Catalog admin policies: avoid has_role() direct calls from browser queries.
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products"
ON public.products
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
);

DROP POLICY IF EXISTS "Admins view all products" ON public.products;
CREATE POLICY "Admins view all products"
ON public.products
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
);

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories"
ON public.categories
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
);

DROP POLICY IF EXISTS "Admins view all categories" ON public.categories;
CREATE POLICY "Admins view all categories"
ON public.categories
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
);

DROP POLICY IF EXISTS "Admins manage addons" ON public.addons;
CREATE POLICY "Admins manage addons"
ON public.addons
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
);

DROP POLICY IF EXISTS "Admins view all addons" ON public.addons;
CREATE POLICY "Admins view all addons"
ON public.addons
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
);

-- Orders: staff/admin access without direct has_staff_access() calls in policies.
DROP POLICY IF EXISTS "Staff can view orders" ON public.orders;
CREATE POLICY "Staff can view orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
);

DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;
CREATE POLICY "Staff can insert orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
);

DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;
CREATE POLICY "Staff can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
);

DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;
CREATE POLICY "Admins can delete orders"
ON public.orders
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.status = 'approved'
  )
);

DROP POLICY IF EXISTS "Staff can manage order_items" ON public.order_items;
CREATE POLICY "Staff can manage order_items"
ON public.order_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
);

DROP POLICY IF EXISTS "Staff can manage order_item_addons" ON public.order_item_addons;
CREATE POLICY "Staff can manage order_item_addons"
ON public.order_item_addons
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'approved'
      AND ur.role IN ('admin', 'staff')
  )
);

-- Preserve the security fix: these helper functions remain unavailable for direct browser/API calls.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_staff_access(uuid) FROM PUBLIC, anon, authenticated;