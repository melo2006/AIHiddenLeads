-- Multi-tenant / reseller design, Phase 2 (2026-11-18):
-- tenant invites, membership role ladder, platform rate card,
-- per-tenant rate-card overrides, and the tenant-branding bucket.
--
-- WHY THIS FILE LIVES HERE: the voice_* tables were created through
-- the Supabase dashboard and are NOT covered by the migrations in
-- supabase/migrations/, so this change cannot ride a migration. Apply
-- it by hand in the Supabase dashboard SQL Editor (project
-- mrtvqttecdfgphgxeygj), then redeploy the voice-agents and
-- gemini-session functions.
--
-- The application code degrades gracefully until this runs: invite,
-- tenant and rate-card reads/writes are attempted with fallbacks, and
-- cap enforcement treats missing data as "no caps configured" (today's
-- behavior) rather than failing sessions. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- tenant_invites — one row per invitation (design §3).
--   kind 'reseller': platform admin invites a new reseller; the reseller
--     org is created pre-named at invite time and organization_id points
--     at it. Accepting grants the invitee 'owner' of that org.
--   kind 'client': a reseller (or the platform) invites a client
--     business; the client org is created at invite time UNDER the
--     inviter's org (parent_organization_id), inert until accepted.
--     Accepting grants 'owner' of the client org.
--   kind 'staff': invite into an EXISTING org (organization_id),
--     granting `role` (admin/editor/viewer — never owner).
-- Only the token's SHA-256 hash is stored; the raw token travels in
-- the invite link only. inviter_organization_id is null when the
-- platform itself invited (a reseller invite).
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reseller', 'client', 'staff')),
  inviter_organization_id uuid references public.voice_organizations (id) on delete set null,
  organization_id uuid references public.voice_organizations (id) on delete set null,
  email text not null,
  company_name text,
  role text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'viewer')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tenant_invites_inviter_idx
  on public.tenant_invites (inviter_organization_id);
create index if not exists tenant_invites_org_idx
  on public.tenant_invites (organization_id);
create index if not exists tenant_invites_email_idx
  on public.tenant_invites (lower(email));

-- All access runs through edge functions with the service role (the
-- same pattern as the voice_* tables); the browser never queries this
-- table directly. RLS stays enabled with no public policies.
alter table public.tenant_invites enable row level security;

-- ---------------------------------------------------------------------------
-- Membership role ladder (design §2): owner | admin | editor | viewer.
-- 'editor' is the only role that existed before Phase 2 and stays valid.
-- If a legacy editor-only CHECK constraint exists under another name it
-- must be dropped by hand — this block adds the ladder constraint when
-- it is not already present.
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.voice_memberships
    add constraint voice_memberships_role_ladder_check
    check (role in ('owner', 'admin', 'editor', 'viewer'));
exception when duplicate_object then null;
end $$;

comment on column public.voice_memberships.role is
  'owner | admin | editor | viewer (design 2026-11-18 §2). editor predates the ladder and stays valid.';

-- ---------------------------------------------------------------------------
-- Platform rate card (design §11): one row per metered line. Absent
-- rows mean "use the built-in default" — the table only stores what
-- the admin changed from the Rate Card page.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_rate_card (
  line_key text primary key,
  cost_usd numeric not null default 0,
  charge_mode text not null default 'markup' check (charge_mode in ('markup', 'flat')),
  charge_value numeric not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.tenant_rate_card enable row level security;

comment on table public.tenant_rate_card is
  'Platform rate card overrides (design 2026-11-18 §11). charge_value is the markup percent when charge_mode=markup, the flat USD price when flat. Admin-only; never exposed to tenants.';

-- Per-tenant rate-card overrides (design §11): a sibling of
-- feature_limits, keyed by rate-card line key.
alter table public.voice_organizations
  add column if not exists rate_card_overrides jsonb not null default '{}'::jsonb;

comment on column public.voice_organizations.rate_card_overrides is
  'Per-tenant rate-card overrides keyed by line key (design 2026-11-18 §11). Empty object = platform card.';

-- ---------------------------------------------------------------------------
-- tenant-branding storage bucket (design §3): logos, public read.
-- Writes happen from signed-in browsers at <organization_id>/<file>
-- paths; WHICH logo_url an org may claim is enforced server-side by
-- the voice-agents saveBranding action (the URL must live under the
-- org's own prefix), so storage policies stay simple.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tenant-branding', 'tenant-branding', true)
on conflict (id) do nothing;

do $$
begin
  create policy "tenant-branding authenticated write"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'tenant-branding');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "tenant-branding authenticated update"
    on storage.objects for update to authenticated
    using (bucket_id = 'tenant-branding')
    with check (bucket_id = 'tenant-branding');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "tenant-branding authenticated delete"
    on storage.objects for delete to authenticated
    using (bucket_id = 'tenant-branding');
exception when duplicate_object then null;
end $$;
