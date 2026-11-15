-- Detected website language for leads (Publish #66, 2026-11-15).
--
-- Ron's direction: a demo runs in the language the visitor's OWN website
-- is published in when the visitor has not explicitly picked a language
-- with the site switch (his nephew in Brazil pastes a Brazilian
-- customer's URL and the whole demo — loading messages, greetings, voice,
-- chat, captions — comes up in Brazilian Portuguese automatically).
-- Priority: explicit site pick > detected site language > English.
--
-- scan-website classifies the scanned content (homepage first, then all
-- pages) with _shared/content-language.ts and stores the verdict here:
-- 'en', 'es' or 'pt-BR' (Portuguese ALWAYS stores as 'pt-BR' — the
-- product's only Portuguese; never 'pt-PT'). Additive and nullable: NULL
-- means "never recorded or not confidently classifiable" (every row
-- scanned before this ships, and thin/mixed-language scans). scan-website
-- writes the column best-effort in SEPARATE updates whose failure is only
-- logged, so the function is safe to deploy before this migration is
-- applied.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS website_language text;

-- get_demo_lead: Postgres cannot change a function's return table with
-- CREATE OR REPLACE, so drop and recreate it identical to the definition
-- in 20261114120000_leads_consent_banner_flags.sql PLUS website_language
-- at the END.
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
  code_not_completed boolean,
  consent_banner_seen boolean,
  consent_banner_dismissed boolean,
  website_language text
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
    l.code_not_completed,
    l.consent_banner_seen,
    l.consent_banner_dismissed,
    l.website_language
  FROM public.leads l
  WHERE l.id = _lead_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_demo_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO service_role;
