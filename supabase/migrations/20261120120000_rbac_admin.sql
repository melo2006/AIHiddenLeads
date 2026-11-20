-- RBAC admin system, Phase 1 (design: rbac-admin-design.md, approved by
-- Ron 2026-11-20): platform-scope roles, per-area permissions, staff
-- assignments + invites, and an audit log.
--
-- Model: a person holds ONE role in ONE scope (staff_assignments).
-- Phase 1 seeds the six platform roles from the design §3 matrix and
-- migrates the account(s) blessed by is_admin_email() to Owner.
-- is_admin_email() itself is NOT removed: has_permission() keeps it as
-- a break-glass fallback during rollout (an allowlisted email is
-- treated as Owner), so nobody can be locked out by this migration.
--
-- Enforcement: browsers may READ roles / the permission matrix / their
-- team's assignments (RLS below), but all WRITES to staff_assignments
-- run through the guarded SECURITY DEFINER RPCs assign_staff_role()
-- and set_staff_active() — called by the voice-agents edge function
-- with the verified actor id — which enforce the hierarchy rules
-- (no self-edit, no grants above your own rank, only the Owner can
-- grant or remove the Admin role) and write the audit_log rows.
-- staff_invites is service-role only, exactly like tenant_invites.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  -- Hierarchy ladder for the grant guards: a higher rank outranks.
  rank integer NOT NULL,
  -- Which scope family this role belongs to. Phase 1 seeds 'platform'
  -- roles only; reseller/client role families arrive in Phases 2/3.
  scope_type text NOT NULL DEFAULT 'platform'
    CHECK (scope_type IN ('platform', 'reseller', 'client')),
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  area text NOT NULL,
  action text NOT NULL,
  PRIMARY KEY (role_id, area, action)
);

CREATE TABLE public.staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id),
  scope_type text NOT NULL DEFAULT 'platform'
    CHECK (scope_type IN ('platform', 'reseller', 'client')),
  -- NULL for platform scope; the voice_organizations id for
  -- reseller/client scopes (Phases 2/3).
  scope_id uuid,
  active boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One assignment per person per scope (scope_id is NULL at platform
-- scope, so the unique index coalesces it).
CREATE UNIQUE INDEX staff_assignments_person_scope_idx
  ON public.staff_assignments (
    user_id, scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX staff_assignments_user_idx ON public.staff_assignments (user_id);
CREATE INDEX staff_assignments_scope_idx
  ON public.staff_assignments (scope_type, scope_id);

CREATE TABLE public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id),
  scope_type text NOT NULL DEFAULT 'platform'
    CHECK (scope_type IN ('platform', 'reseller', 'client')),
  scope_id uuid,
  -- Only the SHA-256 hash is stored; the raw token travels in the
  -- invite link only (same pattern as tenant_invites / demo_invites).
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  invited_by uuid REFERENCES auth.users(id),
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  email_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_invites_email_idx ON public.staff_invites (lower(email));

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  area text,
  target_type text,
  target_id text,
  scope_type text NOT NULL DEFAULT 'platform',
  scope_id uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_user_id);

-- ---------------------------------------------------------------------------
-- Seed: the six preset platform roles (design §3)
-- ---------------------------------------------------------------------------

INSERT INTO public.roles (key, name, rank, scope_type) VALUES
  ('owner',              'Owner',              100, 'platform'),
  ('admin',              'Admin',               80, 'platform'),
  ('operations_manager', 'Operations Manager',  60, 'platform'),
  ('sales_assistant',    'Sales Assistant',     40, 'platform'),
  ('support',            'Support',             20, 'platform'),
  ('read_only',          'Read-Only',           10, 'platform');

-- Seed: the permission matrix (design §3, transcribed 1:1).
-- Areas: clients, resellers, campaigns, leads, billing, content,
-- settings, team, audit. "Create / Edit" rows seed both actions;
-- the merged Content "View / Edit" row seeds view+edit for Support
-- but view-only for Read-Only (a read-only role never edits).
INSERT INTO public.role_permissions (role_id, area, action)
SELECT r.id, v.area, v.action
FROM public.roles r
JOIN (VALUES
  -- Owner: everything.
  ('owner','clients','view'), ('owner','clients','create'), ('owner','clients','edit'), ('owner','clients','delete'),
  ('owner','resellers','view'), ('owner','resellers','create'), ('owner','resellers','edit'), ('owner','resellers','delete'),
  ('owner','campaigns','view'), ('owner','campaigns','create'), ('owner','campaigns','edit'), ('owner','campaigns','send'),
  ('owner','leads','view'), ('owner','leads','edit'),
  ('owner','billing','view'), ('owner','billing','change'),
  ('owner','content','view'), ('owner','content','edit'),
  ('owner','settings','view'), ('owner','settings','change'),
  ('owner','team','view'), ('owner','team','manage'),
  ('owner','audit','view'),
  -- Admin: everything except client/reseller delete and billing change.
  -- (team:manage is still bounded by the RPC guard: Admins may manage
  -- below-Admin roles only — only the Owner grants/removes Admin.)
  ('admin','clients','view'), ('admin','clients','create'), ('admin','clients','edit'),
  ('admin','resellers','view'), ('admin','resellers','create'), ('admin','resellers','edit'),
  ('admin','campaigns','view'), ('admin','campaigns','create'), ('admin','campaigns','edit'), ('admin','campaigns','send'),
  ('admin','leads','view'), ('admin','leads','edit'),
  ('admin','billing','view'),
  ('admin','content','view'), ('admin','content','edit'),
  ('admin','settings','view'), ('admin','settings','change'),
  ('admin','team','view'), ('admin','team','manage'),
  ('admin','audit','view'),
  -- Operations Manager: day-to-day operations; no campaign send.
  ('operations_manager','clients','view'), ('operations_manager','clients','create'), ('operations_manager','clients','edit'),
  ('operations_manager','resellers','view'),
  ('operations_manager','campaigns','view'), ('operations_manager','campaigns','create'), ('operations_manager','campaigns','edit'),
  ('operations_manager','leads','view'), ('operations_manager','leads','edit'),
  ('operations_manager','billing','view'),
  ('operations_manager','content','view'), ('operations_manager','content','edit'),
  ('operations_manager','settings','view'),
  -- Sales Assistant: own pipeline work only.
  ('sales_assistant','clients','view'), ('sales_assistant','clients','create'), ('sales_assistant','clients','edit'),
  ('sales_assistant','campaigns','view'), ('sales_assistant','campaigns','create'), ('sales_assistant','campaigns','edit'),
  ('sales_assistant','leads','view'), ('sales_assistant','leads','edit'),
  -- Support: read-mostly, can fix content.
  ('support','clients','view'),
  ('support','resellers','view'),
  ('support','campaigns','view'),
  ('support','leads','view'),
  ('support','content','view'), ('support','content','edit'),
  -- Read-Only: views only, never an edit anywhere.
  ('read_only','clients','view'),
  ('read_only','resellers','view'),
  ('read_only','campaigns','view'),
  ('read_only','leads','view'),
  ('read_only','billing','view'),
  ('read_only','content','view'),
  ('read_only','settings','view')
) AS v(role_key, area, action) ON v.role_key = r.key;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The email an auth user signs in with (for the break-glass check).
CREATE OR REPLACE FUNCTION public.staff_user_email(_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = _user;
$$;

-- Break-glass: the pre-RBAC allowlist still confers full (Owner)
-- access during rollout, per the design §4. Retire by dropping this
-- branch once every admin holds a real assignment.
CREATE OR REPLACE FUNCTION public.is_owner_user(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_email(public.staff_user_email(_user))
      OR EXISTS (
        SELECT 1
        FROM public.staff_assignments sa
        JOIN public.roles r ON r.id = sa.role_id
        WHERE sa.user_id = _user AND sa.active AND r.key = 'owner'
      );
$$;

-- The one permission question every surface asks.
CREATE OR REPLACE FUNCTION public.has_permission(
  _user uuid,
  _area text,
  _action text,
  _scope_type text DEFAULT 'platform',
  _scope_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_email(public.staff_user_email(_user))
      OR EXISTS (
        SELECT 1
        FROM public.staff_assignments sa
        JOIN public.role_permissions rp ON rp.role_id = sa.role_id
        WHERE sa.user_id = _user
          AND sa.active
          AND sa.scope_type = _scope_type
          AND sa.scope_id IS NOT DISTINCT FROM _scope_id
          AND rp.area = _area
          AND rp.action = _action
      );
$$;

-- The actor's effective rank inside a scope (100 for the Owner and
-- for the break-glass allowlist). -1 when the actor holds nothing.
CREATE OR REPLACE FUNCTION public.staff_actor_rank(
  _user uuid,
  _scope_type text DEFAULT 'platform',
  _scope_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_owner_user(_user) THEN 100
    ELSE coalesce((
      SELECT max(r.rank)
      FROM public.staff_assignments sa
      JOIN public.roles r ON r.id = sa.role_id
      WHERE sa.user_id = _user
        AND sa.active
        AND sa.scope_type = _scope_type
        AND sa.scope_id IS NOT DISTINCT FROM _scope_id
    ), -1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.write_audit(
  _actor uuid,
  _action text,
  _area text,
  _target_type text,
  _target_id text,
  _scope_type text,
  _scope_id uuid,
  _summary jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.audit_log (actor_user_id, action, area, target_type, target_id, scope_type, scope_id, summary)
  VALUES (_actor, _action, _area, _target_type, _target_id, coalesce(_scope_type, 'platform'), _scope_id, coalesce(_summary, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Guarded write RPCs. The actor is auth.uid() when a signed-in browser
-- calls directly; the voice-agents edge function (service role, so
-- auth.uid() is NULL) passes the JWT-verified actor id explicitly.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_staff_role(
  _actor uuid,
  _target_user uuid,
  _role_key text,
  _scope_type text DEFAULT 'platform',
  _scope_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _effective_actor uuid := coalesce(auth.uid(), _actor);
  _role public.roles%ROWTYPE;
  _actor_rank integer;
  _actor_is_owner boolean;
  _existing public.staff_assignments%ROWTYPE;
  _existing_role_key text;
  _assignment_id uuid;
BEGIN
  IF _effective_actor IS NULL THEN
    RAISE EXCEPTION 'An actor is required';
  END IF;
  IF NOT public.has_permission(_effective_actor, 'team', 'manage', _scope_type, _scope_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage the team';
  END IF;
  -- Nobody changes their own role — not even the Owner.
  IF _target_user = _effective_actor THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;
  SELECT * INTO _role FROM public.roles WHERE key = _role_key;
  IF _role.id IS NULL THEN
    RAISE EXCEPTION 'Unknown role: %', _role_key;
  END IF;
  IF _role.scope_type <> _scope_type THEN
    RAISE EXCEPTION 'Role % does not belong to the % scope', _role_key, _scope_type;
  END IF;
  -- The Owner role is seeded at setup; it is never granted at runtime.
  IF _role.key = 'owner' THEN
    RAISE EXCEPTION 'The Owner role cannot be granted';
  END IF;
  _actor_rank := public.staff_actor_rank(_effective_actor, _scope_type, _scope_id);
  _actor_is_owner := public.is_owner_user(_effective_actor);
  -- Nobody grants a role higher than their own.
  IF _role.rank > _actor_rank THEN
    RAISE EXCEPTION 'You cannot grant a role higher than your own';
  END IF;
  -- Only the Owner creates an Admin.
  IF _role.key = 'admin' AND NOT _actor_is_owner THEN
    RAISE EXCEPTION 'Only the Owner can grant the Admin role';
  END IF;
  SELECT * INTO _existing
  FROM public.staff_assignments
  WHERE user_id = _target_user
    AND scope_type = _scope_type
    AND scope_id IS NOT DISTINCT FROM _scope_id;
  IF _existing.id IS NOT NULL THEN
    SELECT key INTO _existing_role_key FROM public.roles WHERE id = _existing.role_id;
    -- Only the Owner changes or removes an Admin's assignment.
    IF _existing_role_key IN ('admin', 'owner') AND NOT _actor_is_owner THEN
      RAISE EXCEPTION 'Only the Owner can change an Admin''s role';
    END IF;
    UPDATE public.staff_assignments
    SET role_id = _role.id, active = true, updated_at = now()
    WHERE id = _existing.id
    RETURNING id INTO _assignment_id;
  ELSE
    INSERT INTO public.staff_assignments (user_id, role_id, scope_type, scope_id, invited_by)
    VALUES (_target_user, _role.id, _scope_type, _scope_id, _effective_actor)
    RETURNING id INTO _assignment_id;
  END IF;
  PERFORM public.write_audit(
    _effective_actor, 'staff.role_assigned', 'team', 'user',
    _target_user::text, _scope_type, _scope_id,
    jsonb_build_object('role', _role.key, 'previousRole', _existing_role_key)
  );
  RETURN _assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_active(
  _actor uuid,
  _assignment_id uuid,
  _active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _effective_actor uuid := coalesce(auth.uid(), _actor);
  _assignment public.staff_assignments%ROWTYPE;
  _role_key text;
BEGIN
  IF _effective_actor IS NULL THEN
    RAISE EXCEPTION 'An actor is required';
  END IF;
  SELECT * INTO _assignment FROM public.staff_assignments WHERE id = _assignment_id;
  IF _assignment.id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF NOT public.has_permission(_effective_actor, 'team', 'manage', _assignment.scope_type, _assignment.scope_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage the team';
  END IF;
  -- Nobody deactivates themselves.
  IF _assignment.user_id = _effective_actor THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;
  SELECT key INTO _role_key FROM public.roles WHERE id = _assignment.role_id;
  IF _role_key = 'owner' THEN
    RAISE EXCEPTION 'The Owner account cannot be deactivated';
  END IF;
  IF _role_key = 'admin' AND NOT public.is_owner_user(_effective_actor) THEN
    RAISE EXCEPTION 'Only the Owner can deactivate an Admin';
  END IF;
  UPDATE public.staff_assignments
  SET active = _active, updated_at = now()
  WHERE id = _assignment.id;
  PERFORM public.write_audit(
    _effective_actor,
    CASE WHEN _active THEN 'staff.activated' ELSE 'staff.deactivated' END,
    'team', 'user', _assignment.user_id::text,
    _assignment.scope_type, _assignment.scope_id,
    jsonb_build_object('role', _role_key, 'active', _active)
  );
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row level security. Reads are policy-gated; writes happen only
-- through the RPCs above (SECURITY DEFINER) or the service role.
-- ---------------------------------------------------------------------------

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roles are readable by signed-in users"
ON public.roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Role permissions are readable by signed-in users"
ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team members can read assignments"
ON public.staff_assignments FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_permission(auth.uid(), 'team', 'view', scope_type, scope_id)
);

CREATE POLICY "Audit log is readable by audit viewers"
ON public.audit_log FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'audit', 'view', scope_type, scope_id));

-- staff_invites: no policies on purpose — service role only, the same
-- posture as tenant_invites.
REVOKE ALL ON TABLE public.staff_invites FROM anon, authenticated;

GRANT SELECT ON public.roles, public.role_permissions,
  public.staff_assignments, public.audit_log TO authenticated;
GRANT ALL ON public.roles, public.role_permissions,
  public.staff_assignments, public.staff_invites, public.audit_log
  TO service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text, text, uuid),
  public.is_owner_user(uuid), public.staff_actor_rank(uuid, text, uuid),
  public.assign_staff_role(uuid, uuid, text, text, uuid),
  public.set_staff_active(uuid, uuid, boolean)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner migration: every account the pre-RBAC allowlist blesses
-- becomes the platform Owner. is_admin_email() stays in place as the
-- break-glass fallback (see is_owner_user / has_permission).
-- ---------------------------------------------------------------------------

INSERT INTO public.staff_assignments (user_id, role_id, scope_type, scope_id, active)
SELECT u.id, r.id, 'platform', NULL, true
FROM auth.users u
JOIN public.roles r ON r.key = 'owner'
WHERE public.is_admin_email(u.email)
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_assignments sa
    WHERE sa.user_id = u.id AND sa.scope_type = 'platform' AND sa.scope_id IS NULL
  );
