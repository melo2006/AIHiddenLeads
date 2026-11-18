-- Multi-tenant / reseller design, reseller subdomains (2026-11-18,
-- design §12.2): a reseller org's public slug — company.aihiddenleads
-- .com — under which the public site renders in his brand.
--
-- WHY THIS FILE LIVES HERE: the voice_* tables were created through
-- the Supabase dashboard and are NOT covered by the migrations in
-- supabase/migrations/, so this change cannot ride a migration. Apply
-- it by hand in the Supabase dashboard SQL Editor (project
-- mrtvqttecdfgphgxeygj), then redeploy the voice-agents function.
--
-- The application code degrades gracefully until this runs: org reads
-- fall back to the previous column set (subdomain reads as "not set"),
-- the public tenantBranding lookup answers "no tenant" (the normal
-- platform site), and setSubdomain answers with a clear "apply the
-- subdomain database update first" message instead of failing. Safe
-- to run more than once.

-- ---------------------------------------------------------------------------
-- The slug itself: lowercase-hyphen, unique across orgs, NULL when
-- unset. Format/reserved-word validation lives in code
-- (_shared/tenancy.ts validateSubdomain); the unique partial index is
-- the database backstop so two orgs can never hold the same slug.
-- ---------------------------------------------------------------------------
alter table public.voice_organizations
  add column if not exists subdomain text;

comment on column public.voice_organizations.subdomain is
  'Public reseller slug (design 2026-11-18 §12.2): <subdomain>.aihiddenleads.com renders the public site under this org''s branding. Reseller orgs only; NULL when unset. Validated (lowercase-hyphen, reserved words blocked) and uniqueness-checked in the voice-agents function; the unique index below is the backstop.';

create unique index if not exists voice_organizations_subdomain_key
  on public.voice_organizations (subdomain)
  where subdomain is not null;
