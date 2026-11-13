-- Screenshot provenance for leads: which capture leg produced the stored
-- website_screenshot — 'browserless' | 'firecrawl' | 'generated'.
--
-- Until this column existed, a generated placeholder was indistinguishable
-- from a real capture in the row itself, and the 2026-11-13 capture outage
-- (Browserless 401 + Firecrawl rejecting the deprecated v1 screenshot
-- body) hid behind that silence: every demo quietly fell back to a drawn
-- placeholder and nothing in the data said so.
--
-- Additive and nullable. scan-website writes the column best-effort in a
-- SEPARATE update whose failure is only logged, so the function is safe to
-- deploy before this migration is applied; rows scanned earlier simply
-- stay NULL.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS screenshot_provider text;
