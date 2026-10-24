CREATE TABLE public.implementation_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  business_name text,
  notes text,
  slot_start timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.implementation_calls TO authenticated;
GRANT ALL ON public.implementation_calls TO service_role;

ALTER TABLE public.implementation_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read implementation calls"
  ON public.implementation_calls FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated users can update implementation calls"
  ON public.implementation_calls FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Public view exposing only taken slot times (no PII) so the booking page can hide them
CREATE VIEW public.implementation_call_slots AS
  SELECT slot_start FROM public.implementation_calls WHERE status <> 'cancelled';

GRANT SELECT ON public.implementation_call_slots TO anon;
GRANT SELECT ON public.implementation_call_slots TO authenticated;