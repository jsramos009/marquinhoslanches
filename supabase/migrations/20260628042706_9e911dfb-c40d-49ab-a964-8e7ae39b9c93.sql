-- 1) Status column on user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_status_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_status_check
  CHECK (status IN ('pending','approved','rejected'));

-- 2) Existing rows (the bootstrap admin) are already approved
UPDATE public.user_roles SET status = 'approved' WHERE status <> 'approved';

-- 3) has_role now requires status='approved' so pending/rejected users get nothing
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND status = 'approved'
  )
$$;

-- 4) Allow an authenticated user to register their OWN pending staff request
DROP POLICY IF EXISTS "Users can request staff access" ON public.user_roles;
CREATE POLICY "Users can request staff access"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'staff'
  AND status = 'pending'
);