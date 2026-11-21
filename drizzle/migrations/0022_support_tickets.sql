-- Support tickets from the /help page form (Ron's order, 2026-11-21).
--
-- ⚠️ DEPLOY ROUTE: this file lives in drizzle/migrations, whose deploy
-- loop RE-RUNS EVERY FILE on every deploy. Everything below is
-- therefore fully idempotent and safe to re-run: CREATE TABLE IF NOT
-- EXISTS, CREATE INDEX IF NOT EXISTS, and the RLS enable (a no-op
-- when already on). The canonical history copy lives in
-- supabase/migrations/20261121160000_support_tickets.sql — keep the
-- two in sync.
--
-- Access model: service-role only. The support-ticket edge function
-- inserts with the service role after validation and emails each
-- ticket to the owner mailbox; browsers never touch the table
-- directly, so RLS is on with no anon/authenticated policies.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  name text NOT NULL,
  business_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  topic text NOT NULL,
  urgency text NOT NULL DEFAULT 'Normal',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx
  ON public.support_tickets (created_at DESC);
