-- Forced covered view for leads (Ray Miramontes fix, 2026-11-15).
--
-- mira-realestate.com refuses to load in a real browser iframe
-- (verified: HTTP 403 / ERR_BLOCKED_BY_RESPONSE in desktop and mobile
-- browser contexts) even though check-iframe-embed's server-side fetch
-- succeeds and reports the site embeddable. The browser error page
-- fires the iframe's load event, which disarms DemoSite's blocked
-- watchdog and blocks the screenshot fallback, so the demo showed
-- every visitor a browser error page instead of the site.
--
-- force_covered_view is the stored presentation pin for that case:
-- refresh-example-leads re-asserts it from the pinned map
-- (supabase/functions/_shared/realtor-example-pinned-leads.ts,
-- forceCoveredView — today: ray-miramontes only) after every refresh,
-- and DemoSite reads it from the lead record and presents the covered
-- screenshot view from the start; the raw iframe is never rendered
-- for a flagged lead. It is a PRESENTATION fact only — it asserts
-- nothing about consent banners and never touches the consent
-- columns. Additive and nullable: NULL/false means "not pinned"
-- (every existing row, and every lead that is not a flagged pin).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS force_covered_view boolean;

-- get_demo_lead: Postgres cannot change a function's return table with
-- CREATE OR REPLACE, so drop and recreate it identical to the definition
-- in 20261115120000_leads_website_language.sql PLUS force_covered_view
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
  website_language text,
  force_covered_view boolean
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
    l.website_language,
    l.force_covered_view
  FROM public.leads l
  WHERE l.id = _lead_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_demo_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO service_role;
