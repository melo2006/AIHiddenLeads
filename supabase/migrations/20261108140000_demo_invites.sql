-- Cold-email invite links (2026-11-08): short personal demo links for
-- prospects whose website demo was pre-built ahead of time.
--
-- Link shape: https://aihiddenleads.com/demo/<website-slug>/<code>
-- The slug is the prospect's own website host (readable, nothing hidden);
-- the code is the secret and only its SHA-256 hash is stored (same
-- pattern as demo_verification_codes and voice_demo_shares). Campaign
-- and source live on the invite row — attribution is recovered
-- server-side from the link itself, never from URL parameters.
--
-- The demo-invite edge function (service role) is the only reader/writer
-- of the table; no client role gets any access.

CREATE TABLE public.demo_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  slug text NOT NULL,
  token_hash text NOT NULL,
  campaign text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX demo_invites_token_hash_idx
  ON public.demo_invites (token_hash);

CREATE INDEX demo_invites_slug_idx
  ON public.demo_invites (slug);

CREATE INDEX demo_invites_lead_idx
  ON public.demo_invites (lead_id);

ALTER TABLE public.demo_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_invites FROM anon;
REVOKE ALL ON TABLE public.demo_invites FROM authenticated;

-- Invite-arrival bookkeeping on the lead itself. Arriving through the
-- personal inbox link IS the email proof for invited prospects, so the
-- arrival is recorded here — deliberately DISTINCT from the public
-- gate's contact_verified / verified_channel / verified_at columns,
-- which an invite arrival never touches.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS invite_channel text,
  ADD COLUMN IF NOT EXISTS invite_arrived_at timestamptz;

-- create_demo_invite: the pre-build / sending driver mints a link for a
-- pre-built lead. The caller supplies the slug and the SHA-256 hash of
-- the code (the raw code only ever exists in the email itself).
CREATE FUNCTION public.create_demo_invite(
  _lead_id uuid,
  _slug text,
  _token_hash text,
  _campaign text,
  _source text
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.demo_invites (lead_id, slug, token_hash, campaign, source)
  VALUES (_lead_id, _slug, _token_hash, _campaign, _source)
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.create_demo_invite(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_demo_invite(uuid, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_demo_invite(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_invite(uuid, text, text, text, text) TO service_role;
