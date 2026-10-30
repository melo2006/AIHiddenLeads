CREATE TABLE public.telephony_pricing (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  twilio_inbound_per_min numeric NOT NULL DEFAULT 0.0085,
  twilio_outbound_per_min numeric NOT NULL DEFAULT 0.014,
  twilio_sms_per_segment numeric NOT NULL DEFAULT 0.0083,
  twilio_number_monthly numeric NOT NULL DEFAULT 1.15,
  default_markup_pct numeric NOT NULL DEFAULT 30,
  fixed_voice_per_min numeric,
  fixed_sms_per_segment numeric,
  published_voice_per_min numeric NOT NULL DEFAULT 0.05,
  published_sms_per_segment numeric,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.telephony_pricing TO authenticated;
GRANT ALL ON public.telephony_pricing TO service_role;
ALTER TABLE public.telephony_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage telephony pricing" ON public.telephony_pricing FOR ALL TO authenticated USING (public.is_voice_admin()) WITH CHECK (public.is_voice_admin());
INSERT INTO public.telephony_pricing (id) VALUES (true);

CREATE TABLE public.telephony_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.voice_organizations(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  voice_number text,
  number_sid text,
  sms_number text,
  messaging_service_sid text,
  transfer_phone text,
  markup_pct numeric,
  fixed_voice_per_min numeric,
  fixed_sms_per_segment numeric,
  monthly_cap_usd numeric,
  active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telephony_clients TO authenticated;
GRANT ALL ON public.telephony_clients TO service_role;
ALTER TABLE public.telephony_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage telephony clients" ON public.telephony_clients FOR ALL TO authenticated USING (public.is_voice_admin()) WITH CHECK (public.is_voice_admin());

CREATE TABLE public.telephony_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.telephony_clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('call','sms')),
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  seconds integer NOT NULL DEFAULT 0,
  segments integer NOT NULL DEFAULT 0,
  provider_cost_usd numeric,
  provider_sid text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telephony_usage_client_time ON public.telephony_usage (client_id, occurred_at);
GRANT SELECT ON public.telephony_usage TO authenticated;
GRANT ALL ON public.telephony_usage TO service_role;
ALTER TABLE public.telephony_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read telephony usage" ON public.telephony_usage FOR SELECT TO authenticated USING (public.is_voice_admin());

CREATE OR REPLACE FUNCTION public.get_public_telephony_prices()
RETURNS TABLE(voice_per_min numeric, sms_per_segment numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT published_voice_per_min, published_sms_per_segment FROM public.telephony_pricing WHERE id
$$;
GRANT EXECUTE ON FUNCTION public.get_public_telephony_prices() TO anon, authenticated;