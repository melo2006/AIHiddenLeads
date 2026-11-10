-- Follow-up pack (2026-11-11): consent + exactly-once bookkeeping for the
-- post-call demo-link text, booking confirmation texts, reminders and the
-- no-show recovery.
--
-- ⚠️ DEPLOY ROUTE: do NOT apply this file with a db-push deploy — the
-- November migration ledger has drift and a push would replay/reconcile
-- unrelated migrations. Apply it by pasting this file into the Supabase
-- dashboard SQL editor for project mrtvqttecdfgphgxeygj (the proven route),
-- then verify with the SELECT at the bottom. It is idempotent
-- (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS), so a re-run is
-- harmless. All runtime code treats the new columns as OPTIONAL: every send
-- path first probes for the columns and degrades to "not eligible" when
-- they are absent, so functions may deploy before or after this SQL.

-- Phone-demo leads: the caller's answer to "Can I text the demo link to
-- this number…?" (save_phone_demo_lead records it). NULL = not asked yet.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sms_consent boolean;

-- Bookings: consent captured on the BookCall form (and false for bookings
-- made any other way — voice bookings never imply text consent), plus the
-- exactly-once stamps the followup-sweep reads and writes.
ALTER TABLE public.implementation_calls
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS noshow_sent_at timestamptz;

-- The SMS ledger (sms_delivery_log) gains the two recipient keys the
-- follow-up sends log against: leads (phone-demo recap) and bookings.
-- prospect_id already exists and stays the outreach key.
ALTER TABLE public.sms_delivery_log
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.implementation_calls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sms_delivery_log_lead_template_idx
  ON public.sms_delivery_log (lead_id, template_id);
CREATE INDEX IF NOT EXISTS implementation_calls_followup_idx
  ON public.implementation_calls (status, slot_start);

-- Verification (run after applying; expect: leads.sms_consent,
-- implementation_calls.{sms_consent, confirmation_sms_sent_at,
-- reminder_24h_sent_at, reminder_1h_sent_at, noshow_sent_at},
-- sms_delivery_log.{lead_id, booking_id}):
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND ((table_name = 'leads' AND column_name = 'sms_consent')
--       OR (table_name = 'implementation_calls')
--       OR (table_name = 'sms_delivery_log' AND column_name IN ('lead_id', 'booking_id')))
--   ORDER BY table_name, column_name;

-- ---------------------------------------------------------------------------
-- OPTIONAL cron wiring for the followup-sweep (deploy step — run separately,
-- only when wiring the schedule; replace <PROJECT_REF> and set the
-- FOLLOWUP_SWEEP_SECRET edge-function secret to the same value first):
--
--   SELECT cron.schedule(
--     'followup-sweep-15min',
--     '*/15 * * * *',
--     $$ SELECT net.http_post(
--          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/followup-sweep',
--          headers := jsonb_build_object(
--            'Content-Type', 'application/json',
--            'x-followup-secret', '<FOLLOWUP_SWEEP_SECRET>'),
--          body := '{}'::jsonb
--        ); $$
--   );
-- ---------------------------------------------------------------------------
