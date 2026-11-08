-- Campaign tracking report (2026-11-09): link public campaign visits to
-- the invited lead they belong to, and record cold-email sends.
--
-- Two honest-signal foundations (deliberately NO email-open pixel — Apple
-- Mail Privacy Protection and Gmail image prefetch make open counts lie):
--
-- 1) campaign_visit_events.lead_id — the invite arrival (DemoSite with
--    invite=1 / a leadId param) is the only public flow that knows which
--    lead a browser tab belongs to. The client persists that lead id in
--    sessionStorage next to the campaign visit id and includes it in
--    subsequent campaign-events posts, so a prospect's demo journey
--    (page_view → scan_started → voice_started → voice_ended) can be
--    attributed to their invite. Ad-traffic visits never carry a lead id
--    and behave exactly as before. Visits recorded before this ships have
--    lead_id NULL and cannot be retro-attributed.
--
-- 2) public.outreach_sends — one row per cold email actually sent by the
--    sending driver (written with the service role at send time). This is
--    the denominator for every rate in the outreach report.
--
-- Access pattern matches public.demo_invites: RLS on, all access revoked
-- from anon/authenticated; the outreach-report edge function (service
-- role, admin-authenticated) is the only reader.

ALTER TABLE public.campaign_visit_events
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaign_visit_events_lead_idx
  ON public.campaign_visit_events (lead_id);

CREATE TABLE public.outreach_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  prospect_id uuid,
  campaign text NOT NULL,
  source text,
  step integer NOT NULL,
  mailbox text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  message_id text,
  status text NOT NULL DEFAULT 'sent'
);

CREATE INDEX outreach_sends_campaign_idx
  ON public.outreach_sends (campaign);

CREATE INDEX outreach_sends_lead_idx
  ON public.outreach_sends (lead_id);

ALTER TABLE public.outreach_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.outreach_sends FROM anon;
REVOKE ALL ON TABLE public.outreach_sends FROM authenticated;
