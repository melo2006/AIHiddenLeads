-- Multi-tenant / reseller design, Phase 2.5 (2026-11-18):
-- demo/presentation tenants, reseller retail pricing, the currency
-- conversion table, and the reseller catalog selection.
--
-- WHY THIS FILE LIVES HERE: the voice_* tables were created through
-- the Supabase dashboard and are NOT covered by the migrations in
-- supabase/migrations/, so this change cannot ride a migration. Apply
-- it by hand in the Supabase dashboard SQL Editor (project
-- mrtvqttecdfgphgxeygj), then redeploy the voice-agents function.
--
-- The application code degrades gracefully until this runs: org reads
-- fall back to the Phase 2 column set (demo/retail/catalog features
-- read as "not set"), and the seed action answers with a clear
-- "apply the Phase 2.5 database update first" message instead of
-- failing. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Demo tenants (design §12.1): is_demo is the ONE marker that keeps
-- presentation data out of real numbers. Demo orgs never get rows in
-- usage_events / gemini_voice_sessions — their presentation figures
-- live in demo_profile and are only ever substituted when a demo
-- org's OWN row is rendered (Tenants screen, reseller console).
-- ---------------------------------------------------------------------------
alter table public.voice_organizations
  add column if not exists is_demo boolean not null default false;

alter table public.voice_organizations
  add column if not exists demo_profile jsonb not null default '{}'::jsonb;

comment on column public.voice_organizations.is_demo is
  'Presentation/demo tenant (design 2026-11-18 §12.1). Demo orgs are seeded/removed by the voice-agents seedDemoData/removeDemoData actions and excluded from every real billing/usage rollup.';
comment on column public.voice_organizations.demo_profile is
  'Presentation figures for a demo org ({ minutes, spendUsd, demoSpendUsd, seededAt }). Never read for non-demo orgs; never written to the usage ledger.';

-- ---------------------------------------------------------------------------
-- Reseller retail pricing (design §12.3): the reseller's OWN price
-- list for his customers — per rate-card line key, { mode, markupPct,
-- flatUsd, addonUsd }. A sibling of rate_card_overrides (which is how
-- the PLATFORM prices the reseller). Absent lines price at the
-- recommendation (100% markup) in code.
-- ---------------------------------------------------------------------------
alter table public.voice_organizations
  add column if not exists retail_prices jsonb not null default '{}'::jsonb;

comment on column public.voice_organizations.retail_prices is
  'The reseller''s retail price settings for his customers, keyed by rate-card line (design 2026-11-18 §12.3). Never exposed to the platform''s other tenants; his customers see only the computed retail prices.';

-- The currency the reseller's customers see prices in (design §12.4).
-- The platform always settles with the reseller in USD regardless.
alter table public.voice_organizations
  add column if not exists customer_currency text not null default 'USD';

do $$
begin
  alter table public.voice_organizations
    add constraint voice_organizations_customer_currency_check
    check (customer_currency in ('USD', 'CAD', 'BRL'));
exception when duplicate_object then null;
end $$;

comment on column public.voice_organizations.customer_currency is
  'Display currency for this reseller''s customer-facing prices (design 2026-11-18 §12.4). Settlement with the platform is always USD.';

-- ---------------------------------------------------------------------------
-- Reseller catalog selection (design §12.5): which avatars, voices
-- and languages the reseller offers his clients.
--   { avatars: string[] | null, voices: string[] | null,
--     languages: string[] }
-- A null list means the whole shared library is offered.
-- ---------------------------------------------------------------------------
alter table public.voice_organizations
  add column if not exists offered_catalog jsonb not null default '{}'::jsonb;

comment on column public.voice_organizations.offered_catalog is
  'Catalog curation for a reseller''s clients (design 2026-11-18 §12.5): { avatars, voices, languages }; null list = whole library offered.';

-- ---------------------------------------------------------------------------
-- Currency conversion table (design §12.4): USD base — a row means
-- "1 USD = rate units of this currency". Only currencies the admin
-- has changed get a row; absent rows use the built-in defaults in
-- _shared/currency.ts (shown in the UI as editable defaults with
-- their as-of date, never as a live FX feed). USD is the base and
-- never has a row.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_currency_rates (
  code text primary key check (code in ('CAD', 'BRL')),
  rate numeric not null check (rate > 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.tenant_currency_rates enable row level security;

comment on table public.tenant_currency_rates is
  'Admin-edited currency conversion rates, USD base (design 2026-11-18 §12.4). Absent code = built-in default rate in _shared/currency.ts.';
