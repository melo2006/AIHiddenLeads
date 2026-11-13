-- Video avatar free-first-month bookkeeping (pricing cleanup, 2026-11-12).
--
-- ⚠️ DEPLOY ROUTE: this file lives in drizzle/migrations, whose deploy loop
-- RE-RUNS EVERY FILE on every deploy. Everything below is therefore fully
-- idempotent and safe to re-run: CREATE TABLE IF NOT EXISTS, CREATE INDEX
-- IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY.
--
-- One row per video avatar TRIAL (the add-on's billing row itself lives in
-- public.subscriptions with price_id = 'video_avatar_monthly'). A row's
-- existence is what makes the free month one-per-business: eligibility is
-- "no row for this user + environment". kept_at records the customer's
-- active choice to keep the add-on past the trial; reminder_sent_at is the
-- day-~25 reminder claim stamp (avatar-trial-reminders sweep);
-- default_off_armed_at records that the trialing subscription was armed
-- cancel_at_period_end (the default-off) at sync time.
CREATE TABLE IF NOT EXISTS public.video_avatar_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'sandbox',
  stripe_subscription_id text NOT NULL UNIQUE,
  trial_end timestamptz NULL,
  kept_at timestamptz NULL,
  reminder_sent_at timestamptz NULL,
  default_off_armed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_avatar_trials_user_env ON public.video_avatar_trials (user_id, environment);
CREATE INDEX IF NOT EXISTS video_avatar_trials_trial_end ON public.video_avatar_trials (trial_end);
GRANT SELECT ON public.video_avatar_trials TO authenticated;
GRANT ALL ON public.video_avatar_trials TO service_role;
ALTER TABLE public.video_avatar_trials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_avatar_trials_service_role" ON public.video_avatar_trials;
CREATE POLICY "video_avatar_trials_service_role" ON public.video_avatar_trials FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "video_avatar_trials_owner_read" ON public.video_avatar_trials;
CREATE POLICY "video_avatar_trials_owner_read" ON public.video_avatar_trials FOR SELECT TO authenticated USING (auth.uid() = user_id);
