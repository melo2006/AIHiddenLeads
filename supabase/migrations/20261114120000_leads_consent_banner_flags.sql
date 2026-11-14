-- Consent-banner scan flags for leads (Publish #49 follow-up, 2026-11-14).
--
-- Publish #49 detected banner sites by fingerprinting the homepage HTML
-- inside check-iframe-embed — a live probe from the edge function's
-- datacenter egress. Bot-walled sites (martinezrealtorsfl.com answers
-- "unreachable" there) never got fingerprinted, so the visitor's browser
-- received the raw iframe with the banner in the middle of the demo.
--
-- Detection now lives in the scan-website CAPTURE pipeline, whose
-- Browserless/Firecrawl browsers actually render these pages: the #48
-- dismissal script's in-page report is recorded on the lead row as
--   consent_banner_seen      — a consent banner was present at scan time
--   consent_banner_dismissed — the capture dismissed it (Reject preferred)
-- and DemoSite routes a stored TRUE flag to the dismissal-covered live
-- view, outranking the live probe (whose verdict stays a secondary signal
-- for leads with no scan record).
--
-- Additive and nullable: NULL means "never recorded" (every row scanned
-- before this ships, and any scan whose capture could not witness the
-- page — e.g. the capture browser itself hit a bot wall). scan-website
-- writes the columns best-effort in a SEPARATE update whose failure is
-- only logged, so the function is safe to deploy before this migration
-- is applied.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS consent_banner_seen boolean;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS consent_banner_dismissed boolean;

-- get_demo_lead: Postgres cannot change a function's return table with
-- CREATE OR REPLACE, so drop and recreate it identical to the definition
-- in 20261108090000_verified_demo_gate.sql PLUS the two consent columns
-- at the END: consent_banner_seen, consent_banner_dismissed.
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
  consent_banner_dismissed boolean
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
    l.consent_banner_dismissed
  FROM public.leads l
  WHERE l.id = _lead_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_demo_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO service_role;
