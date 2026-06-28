
CREATE TABLE public.delivery_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  neighborhood TEXT NOT NULL,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX delivery_fees_neighborhood_lower_uidx ON public.delivery_fees (lower(neighborhood));

GRANT SELECT ON public.delivery_fees TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_fees TO authenticated;
GRANT ALL ON public.delivery_fees TO service_role;

ALTER TABLE public.delivery_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active delivery fees"
ON public.delivery_fees FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert delivery fees"
ON public.delivery_fees FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update delivery fees"
ON public.delivery_fees FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete delivery fees"
ON public.delivery_fees FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_delivery_fees_updated_at
BEFORE UPDATE ON public.delivery_fees
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
