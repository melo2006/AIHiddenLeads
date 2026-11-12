-- Usage Reporting Suite (2026-11-12): a unified, idempotent usage ledger,
-- per-organization report settings, and a code-owned minute-pack catalog.
--
-- ⚠️ DEPLOY ROUTE: this file lives in drizzle/migrations, whose deploy loop
-- RE-RUNS EVERY FILE on every deploy. Everything below is therefore fully
-- idempotent and safe to re-run: CREATE TABLE IF NOT EXISTS, CREATE INDEX
-- IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY, and backfill
-- INSERTs guarded by ON CONFLICT DO NOTHING on the ledger's unique
-- (service, source_table, source_id) key.

-- ---------------------------------------------------------------------------
-- a. usage_events — one row per unit of metered usage, deduplicated by
--    (service, source_table, source_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES public.voice_organizations(id) ON DELETE SET NULL,
  agent_id uuid NULL REFERENCES public.voice_agents(id) ON DELETE SET NULL,
  telephony_client_id uuid NULL REFERENCES public.telephony_clients(id) ON DELETE SET NULL,
  service text NOT NULL CHECK (service IN ('web_voice','phone_voice','chat_brain','sms','email','video_avatar')),
  provider text NOT NULL CHECK (provider IN ('gemini','telnyx','twilio','simli','hostinger','resend','other')),
  line_number text NULL,
  quantity_minutes numeric(12,3) NULL,
  quantity_count integer NULL,
  est_cost_usd numeric(12,6) NULL,
  carrier_cost_usd numeric(12,6) NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service, source_table, source_id)
);
CREATE INDEX IF NOT EXISTS usage_events_org_time ON public.usage_events (organization_id, occurred_at);
CREATE INDEX IF NOT EXISTS usage_events_time ON public.usage_events (occurred_at);
CREATE INDEX IF NOT EXISTS usage_events_service_time ON public.usage_events (service, occurred_at);
GRANT SELECT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;

-- ---------------------------------------------------------------------------
-- b. usage_report_settings — one row per organization.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_report_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.voice_organizations(id) ON DELETE CASCADE,
  cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('off','daily','weekly','monthly')),
  report_email text NULL,
  sms_alerts boolean NOT NULL DEFAULT false,
  alert_phone text NULL,
  threshold_80_period text NULL,
  threshold_100_period text NULL,
  last_report_period text NULL,
  last_report_sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.usage_report_settings TO authenticated;
GRANT ALL ON public.usage_report_settings TO service_role;

-- ---------------------------------------------------------------------------
-- c. minute_packs — code-owned catalog. ONLY voice packs are seeded: video
--    packs stay unpriced because Simli's per-minute cost is unverified
--    anywhere in the repo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.minute_packs (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('voice','video')),
  minutes integer NOT NULL,
  price_cents integer NOT NULL,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO public.minute_packs (id, kind, minutes, price_cents, active) VALUES
  ('voice_100', 'voice', 100, 2000, true),
  ('voice_300', 'voice', 300, 5400, true),
  ('voice_500', 'voice', 500, 8500, true),
  ('voice_1000', 'voice', 1000, 15000, true)
ON CONFLICT (id) DO UPDATE SET
  kind = EXCLUDED.kind,
  minutes = EXCLUDED.minutes,
  price_cents = EXCLUDED.price_cents,
  active = EXCLUDED.active;
GRANT SELECT ON public.minute_packs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minute_packs TO authenticated;
GRANT ALL ON public.minute_packs TO service_role;

-- ---------------------------------------------------------------------------
-- d. minute_pack_purchases — one row per pack checkout.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.minute_pack_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NULL REFERENCES public.voice_organizations(id) ON DELETE SET NULL,
  pack_id text NOT NULL REFERENCES public.minute_packs(id),
  minutes integer NOT NULL,
  price_cents integer NOT NULL,
  stripe_checkout_session_id text NULL,
  stripe_payment_intent_id text NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid_test','paid','failed','refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS minute_pack_purchases_user ON public.minute_pack_purchases (user_id, created_at);
CREATE INDEX IF NOT EXISTS minute_pack_purchases_session ON public.minute_pack_purchases (stripe_checkout_session_id);
GRANT SELECT ON public.minute_pack_purchases TO authenticated;
GRANT ALL ON public.minute_pack_purchases TO service_role;

-- ---------------------------------------------------------------------------
-- e. Row level security.
-- ---------------------------------------------------------------------------
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage_events_service_role" ON public.usage_events;
CREATE POLICY "usage_events_service_role" ON public.usage_events FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "usage_events_admin_read" ON public.usage_events;
CREATE POLICY "usage_events_admin_read" ON public.usage_events FOR SELECT TO authenticated USING (public.is_voice_admin());
DROP POLICY IF EXISTS "usage_events_member_read" ON public.usage_events;
CREATE POLICY "usage_events_member_read" ON public.usage_events FOR SELECT TO authenticated USING (
  organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.voice_memberships m
    WHERE m.organization_id = usage_events.organization_id AND m.user_id = auth.uid()
  )
);

ALTER TABLE public.usage_report_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage_settings_service_role" ON public.usage_report_settings;
CREATE POLICY "usage_settings_service_role" ON public.usage_report_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "usage_settings_admin" ON public.usage_report_settings;
CREATE POLICY "usage_settings_admin" ON public.usage_report_settings FOR ALL TO authenticated USING (public.is_voice_admin()) WITH CHECK (public.is_voice_admin());
DROP POLICY IF EXISTS "usage_settings_member_read" ON public.usage_report_settings;
CREATE POLICY "usage_settings_member_read" ON public.usage_report_settings FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.voice_memberships m
    WHERE m.organization_id = usage_report_settings.organization_id AND m.user_id = auth.uid()
  )
);
-- A client creates their settings row on first save from /account (the
-- settings form upserts), so members need an INSERT policy as well as read.
DROP POLICY IF EXISTS "usage_settings_member_insert" ON public.usage_report_settings;
CREATE POLICY "usage_settings_member_insert" ON public.usage_report_settings FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.voice_memberships m
    WHERE m.organization_id = usage_report_settings.organization_id AND m.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "usage_settings_member_update" ON public.usage_report_settings;
CREATE POLICY "usage_settings_member_update" ON public.usage_report_settings FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.voice_memberships m
    WHERE m.organization_id = usage_report_settings.organization_id AND m.user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.voice_memberships m
    WHERE m.organization_id = usage_report_settings.organization_id AND m.user_id = auth.uid()
  )
);

ALTER TABLE public.minute_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "minute_packs_service_role" ON public.minute_packs;
CREATE POLICY "minute_packs_service_role" ON public.minute_packs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "minute_packs_public_read" ON public.minute_packs;
CREATE POLICY "minute_packs_public_read" ON public.minute_packs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "minute_packs_admin_write" ON public.minute_packs;
CREATE POLICY "minute_packs_admin_write" ON public.minute_packs FOR ALL TO authenticated USING (public.is_voice_admin()) WITH CHECK (public.is_voice_admin());

ALTER TABLE public.minute_pack_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pack_purchases_service_role" ON public.minute_pack_purchases;
CREATE POLICY "pack_purchases_service_role" ON public.minute_pack_purchases FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pack_purchases_admin_read" ON public.minute_pack_purchases;
CREATE POLICY "pack_purchases_admin_read" ON public.minute_pack_purchases FOR SELECT TO authenticated USING (public.is_voice_admin());
DROP POLICY IF EXISTS "pack_purchases_own_read" ON public.minute_pack_purchases;
CREATE POLICY "pack_purchases_own_read" ON public.minute_pack_purchases FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- f. Idempotent backfill from the existing source tables. occurred_at is
--    stored in UTC (timestamptz). Numeric estimates are guarded with a
--    regex check before casting so an odd historical row can never fail
--    the migration.
-- ---------------------------------------------------------------------------

-- Web voice: finalized Gemini browser sessions.
INSERT INTO public.usage_events
  (organization_id, agent_id, service, provider, quantity_minutes, est_cost_usd, source_table, source_id, occurred_at)
SELECT
  s.organization_id,
  s.agent_id,
  'web_voice',
  'gemini',
  s.duration_seconds / 60.0,
  CASE WHEN (s.usage ->> 'audio_estimate_usd') ~ '^[0-9]+(\.[0-9]+)?$'
       THEN (s.usage ->> 'audio_estimate_usd')::numeric ELSE NULL END,
  'gemini_voice_sessions',
  s.id::text,
  COALESCE(s.started_at, s.created_at)
FROM public.gemini_voice_sessions s
WHERE s.status = 'ended' AND s.duration_seconds > 0
ON CONFLICT DO NOTHING;

-- Video avatar: same sessions with the avatar enabled.
-- NOTE: this is an upper-bound proxy — the whole session is counted,
-- because avatar-live time is not tracked separately anywhere.
INSERT INTO public.usage_events
  (organization_id, agent_id, service, provider, quantity_minutes, est_cost_usd, source_table, source_id, occurred_at)
SELECT
  s.organization_id,
  s.agent_id,
  'video_avatar',
  'simli',
  s.duration_seconds / 60.0,
  NULL,
  'gemini_voice_sessions',
  s.id::text,
  COALESCE(s.started_at, s.created_at)
FROM public.gemini_voice_sessions s
WHERE s.status = 'ended' AND s.duration_seconds > 0
  AND s.config -> 'videoAvatar' ->> 'enabled' = 'true'
ON CONFLICT DO NOTHING;

-- Phone voice: finalized telephony calls, with the carrier cost from the
-- matching telephony_usage row when one exists.
INSERT INTO public.usage_events
  (organization_id, telephony_client_id, service, provider, line_number, quantity_minutes, est_cost_usd, carrier_cost_usd, source_table, source_id, occurred_at)
SELECT
  tcl.organization_id,
  tc.client_id,
  'phone_voice',
  CASE WHEN tc.transport = 'telnyx-stream' THEN 'telnyx'
       WHEN tc.transport = 'stream' THEN 'twilio'
       ELSE 'other' END,
  tcl.voice_number,
  tc.seconds / 60.0,
  CASE WHEN (tc.ai_usage ->> 'audio_estimate_usd') ~ '^[0-9]+(\.[0-9]+)?$'
       THEN (tc.ai_usage ->> 'audio_estimate_usd')::numeric ELSE NULL END,
  tu.provider_cost_usd,
  'telephony_calls',
  tc.id::text,
  tc.started_at
FROM public.telephony_calls tc
LEFT JOIN public.telephony_clients tcl ON tcl.id = tc.client_id
LEFT JOIN public.telephony_usage tu ON tu.provider_sid = tc.call_sid AND tu.kind = 'voice'
WHERE tc.seconds > 0
  AND (tc.ended_at IS NOT NULL OR tc.status IN ('completed','transferred_done'))
ON CONFLICT DO NOTHING;

-- SMS: delivered/logged text messages (organization is not recorded on
-- the source rows, so it stays NULL).
INSERT INTO public.usage_events
  (organization_id, service, provider, line_number, quantity_count, est_cost_usd, source_table, source_id, occurred_at)
SELECT
  NULL,
  'sms',
  'twilio',
  l.from_phone,
  COALESCE(l.segments, 1),
  l.price_usd,
  'sms_delivery_log',
  l.id::text,
  l.sent_at
FROM public.sms_delivery_log l
WHERE l.message_sid IS NOT NULL
ON CONFLICT DO NOTHING;

-- Chat brain: website-learning / scraping AI usage (organization is not
-- recorded on the source rows, so it stays NULL).
INSERT INTO public.usage_events
  (organization_id, service, provider, quantity_count, est_cost_usd, source_table, source_id, occurred_at)
SELECT
  NULL,
  'chat_brain',
  'other',
  u.ai_calls,
  u.estimated_cost_usd,
  'scraping_usage',
  u.id::text,
  u.created_at
FROM public.scraping_usage u
ON CONFLICT DO NOTHING;

-- Email: NO backfill — no historical email send log exists. Email events
-- accrue from the usage-reports engine (and future hooks) going forward.

-- ---------------------------------------------------------------------------
-- g. OPTIONAL cron wiring for the usage-reports sweep (deploy step — run
--    separately in the Supabase dashboard SQL editor, NOT as part of this
--    migration; replace <PROJECT_REF> and set the USAGE_REPORTS_SECRET
--    edge-function secret to the same value first):
--
--   SELECT cron.schedule(
--     'usage-reports-hourly',
--     '0 * * * *',
--     $$ SELECT net.http_post(
--          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/usage-reports',
--          headers := jsonb_build_object(
--            'Content-Type', 'application/json',
--            'x-usage-reports-secret', '<USAGE_REPORTS_SECRET>'),
--          body := '{}'::jsonb
--        ); $$
--   );
-- ---------------------------------------------------------------------------
