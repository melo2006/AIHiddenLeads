-- Help & Support page, portion one (Ron's order, 2026-11-21): the
-- support ticket form on /help writes REAL tickets here through the
-- support-ticket edge function, which also emails every ticket to the
-- owner mailbox via _shared/hostinger-mail.ts.
--
-- Access model: service-role only, exactly like staff_invites. The
-- edge function inserts with the service role after zod validation;
-- the team reads tickets in the dashboard SQL editor / admin tooling.
-- Browsers never touch this table directly, so RLS is enabled with
-- NO anon/authenticated policies on purpose.
--
-- NOTE for whoever ships this: production schema changes are applied
-- through the Supabase dashboard SQL Editor (the core tree is not
-- auto-pushed), and drizzle/migrations/0022_support_tickets.sql is
-- the idempotent twin the deploy workflow applies — keep them in sync.

create table public.support_tickets (
  id uuid primary key,
  reference text not null unique,
  name text not null,
  business_name text not null default '',
  email text not null,
  topic text not null,
  urgency text not null default 'Normal',
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;

create index support_tickets_created_at_idx
  on public.support_tickets (created_at desc);
