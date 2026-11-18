-- Multi-tenant / reseller design, Phase 1 (2026-11-18):
-- tenant hierarchy + branding + limits columns on voice_organizations.
--
-- WHY THIS FILE LIVES HERE: the voice_* / customer_* tables were created
-- through the Supabase dashboard and are NOT covered by the migrations in
-- supabase/migrations/, so this change cannot ride a migration. Apply it
-- by hand in the Supabase dashboard SQL Editor (project
-- mrtvqttecdfgphgxeygj), then redeploy the voice-agents function.
--
-- The application code degrades gracefully until this runs: every read of
-- the new columns is attempted with a fallback to the pre-existing column
-- set, and missing branding is treated as "no branding" (the platform
-- AiHiddenLeads brand is shown). Safe to run more than once.

alter table public.voice_organizations
  add column if not exists parent_organization_id uuid
    references public.voice_organizations (id) on delete set null,
  add column if not exists type text not null default 'client',
  add column if not exists logo_url text,
  add column if not exists slogan text,
  add column if not exists support_email text,
  add column if not exists brand_color text,
  add column if not exists feature_limits jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'active';

-- Value guards (added via DO blocks so re-running this file is a no-op).
do $$
begin
  alter table public.voice_organizations
    add constraint voice_organizations_type_check
    check (type in ('client', 'reseller'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.voice_organizations
    add constraint voice_organizations_status_check
    check (status in ('active', 'suspended'));
exception when duplicate_object then null;
end $$;

-- Design §3: a slogan is one line, max 80 characters.
do $$
begin
  alter table public.voice_organizations
    add constraint voice_organizations_slogan_length_check
    check (slogan is null or char_length(slogan) <= 80);
exception when duplicate_object then null;
end $$;

-- A reseller's subtree is read by parent; index the hierarchy edge.
create index if not exists voice_organizations_parent_idx
  on public.voice_organizations (parent_organization_id);

comment on column public.voice_organizations.parent_organization_id is
  'Reseller hierarchy (design 2026-11-18): null = direct/platform-level client; set = this org belongs to that reseller org.';
comment on column public.voice_organizations.type is
  'client | reseller (design 2026-11-18). Existing rows default to client.';
comment on column public.voice_organizations.feature_limits is
  'Per-tenant allowance set by the platform admin (design 2026-11-18 §6). Empty object = plan defaults.';
comment on column public.voice_organizations.status is
  'active | suspended (design 2026-11-18).';
