-- Multi-tenant / reseller design, Phase 1 (2026-11-18):
-- lead -> customer link on prospects.
--
-- A prospect that becomes a paying customer is linked to the customer's
-- organization (voice_organizations), so the admin Clients view can show
-- which lead a customer came from, and the Pipeline's Closed Won stage
-- stops being a label with nothing behind it (design 2026-11-18 §3).
--
-- NOTE for whoever ships this: function deploys run with migrations
-- skipped, and production schema changes are applied through the
-- Supabase dashboard SQL Editor — apply this file's SQL there as well.
-- The application code degrades gracefully until it runs (the Clients
-- view reads the link with a fallback when the columns are absent).

alter table public.prospects
  add column if not exists converted_organization_id uuid
    references public.voice_organizations (id) on delete set null,
  add column if not exists converted_at timestamptz;

create index if not exists prospects_converted_organization_id_idx
  on public.prospects (converted_organization_id);
