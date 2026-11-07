-- Verified Demo Gate (Phase 1): email verification codes for the demo.
--
-- Codes are stored only as SHA-256 hashes (see
-- supabase/functions/_shared/verification-code.ts). The table is
-- service-role only: the demo-verification edge function reads and writes
-- it with the service role, and no client role gets any access.

CREATE TABLE public.demo_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  target text NOT NULL,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'verified', 'expired', 'locked', 'superseded')
  ),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  requester_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz
);

CREATE INDEX demo_verification_codes_lead_status_created_idx
  ON public.demo_verification_codes (lead_id, status, created_at DESC);

ALTER TABLE public.demo_verification_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_verification_codes FROM anon;
REVOKE ALL ON TABLE public.demo_verification_codes FROM authenticated;

-- Verification + consent bookkeeping on the lead itself. The disclosure
-- version / capture timestamp are the electronic-consent evidence trail
-- for the demo flow (the visitor accepts the disclosure shown at the
-- contact field by requesting a code); code_not_completed flags leads
-- that consented but never finished verification, for a gentler,
-- email-first follow-up.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_channel text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_disclosure_version text,
  ADD COLUMN IF NOT EXISTS consent_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_not_completed boolean NOT NULL DEFAULT false;

-- get_demo_lead: Postgres cannot change a function's return table with
-- CREATE OR REPLACE, so drop and recreate it identical to the definition
-- in 20260617043404_f0b7acd9-4de5-4115-be9c-6bcfbc03c48e.sql PLUS two extra
-- return columns at the END: contact_verified, code_not_completed.
DROP FUNCTION IF EXISTS public.get_demo_lead(uuid);

CREATE FUNCTION public.get_demo_lead(_lead_id uuid)
RETURNS TABLE (
  id uuid,
  updated_at timestamptz,
  full_name text,
  business_name text,
  email text,
  phone text,
  niche text,
  website_url text,
  website_screenshot text,
  screenshot_tablet text,
  screenshot_mobile text,
  website_title text,
  website_description text,
  website_content text,
  brand_colors jsonb,
  brand_logo text,
  scan_status text,
  contact_verified boolean,
  code_not_completed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.updated_at,
    l.full_name,
    l.business_name,
    l.email,
    l.phone,
    l.niche,
    l.website_url,
    l.website_screenshot,
    l.screenshot_tablet,
    l.screenshot_mobile,
    l.website_title,
    l.website_description,
    l.website_content,
    l.brand_colors,
    l.brand_logo,
    l.scan_status,
    l.contact_verified,
    l.code_not_completed
  FROM public.leads l
  WHERE l.id = _lead_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_demo_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO service_role;
