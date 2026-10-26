CREATE TABLE public.campaign_visit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), visit_id uuid NOT NULL, event text NOT NULL, path text NOT NULL, source text NOT NULL DEFAULT '', campaign text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(visit_id,event,path));
GRANT SELECT ON public.campaign_visit_events TO authenticated;
GRANT ALL ON public.campaign_visit_events TO service_role;
ALTER TABLE public.campaign_visit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read campaign events" ON public.campaign_visit_events FOR SELECT TO authenticated USING (public.is_voice_admin());
CREATE INDEX campaign_visit_events_created ON public.campaign_visit_events(created_at);