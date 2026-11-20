-- RBAC Phase 1 (2026-11-20): client soft-delete support.
--
-- WHY THIS FILE LIVES HERE: voice_organizations was created through
-- the Supabase dashboard and is NOT covered by supabase/migrations/,
-- so this change cannot ride a migration. Apply it by hand in the
-- Supabase dashboard SQL Editor (project mrtvqttecdfgphgxeygj).
--
-- The design (rbac-admin-design.md §2/§4): deleting a client is a
-- SOFT delete — the row stays, deleted_at is stamped, and the Owner
-- can restore it. The voice-agents deleteClient / restoreClient
-- actions enforce the clients:delete permission server-side and
-- degrade gracefully until this runs (they answer with a "database
-- update not applied yet" message instead of failing obscurely).
-- Safe to run more than once.

alter table public.voice_organizations
  add column if not exists deleted_at timestamptz;

create index if not exists voice_organizations_deleted_at_idx
  on public.voice_organizations (deleted_at);

comment on column public.voice_organizations.deleted_at is
  'RBAC soft delete (2026-11-20): set when a client is deleted from the Clients view; the org is also suspended while deleted. NULL = not deleted. Restore clears it.';
