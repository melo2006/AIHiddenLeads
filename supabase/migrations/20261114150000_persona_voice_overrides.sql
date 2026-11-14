-- Persona voice overrides (admin voice control, 2026-11-14).
--
-- Ron directs the DEMO personas' voices from the admin Demo Voices tab
-- (Voice Agents → Demo Voices) instead of waiting on a code publish.
-- One row per demo persona whose voice Ron has changed:
--
--   persona    — the persona key: 'aspen' | 'sara' | 'alex' | 'frank' |
--                'latina' (Monica) | 'black-professional-lady' |
--                'executive' | 'middle-aged-pro'
--   voice_name — a Gemini Live prebuilt voice name (validated in code
--                against the VOICES list on both write and read; the
--                catalog lives in code, so no FK is possible)
--   updated_by — the platform admin who saved it (auth.users id)
--
-- gemini-session (service role) reads the row when it stamps a demo
-- session's voice: the DB value WINS; no row → the personas.ts code
-- default. Reads are fail-safe in code (any error → code default), so
-- deploying the function before this migration lands is safe, and
-- deleting a row ("Reset to default" in the admin tab) restores the
-- code default with no publish.
--
-- Access: platform admins only, via the SAME protected role table
-- (voice_platform_roles) the rest of the Voice Agents admin surface
-- uses. The browser client reads/writes directly under these policies;
-- service-role traffic (gemini-session) bypasses RLS as usual.
--
-- ADDITIVE ONLY: creates one new table + its policies. Nothing
-- existing is altered, dropped or backfilled.

CREATE TABLE IF NOT EXISTS public.persona_voice_overrides (
  persona text PRIMARY KEY CHECK (persona IN (
    'aspen', 'sara', 'alex', 'frank', 'latina',
    'black-professional-lady', 'executive', 'middle-aged-pro'
  )),
  voice_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.persona_voice_overrides ENABLE ROW LEVEL SECURITY;

-- One policy set per verb, all gated on the platform admin role.
-- (DROP POLICY IF EXISTS first so re-running this file is safe.)
DROP POLICY IF EXISTS persona_voice_overrides_admin_select ON public.persona_voice_overrides;
CREATE POLICY persona_voice_overrides_admin_select ON public.persona_voice_overrides
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.voice_platform_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

DROP POLICY IF EXISTS persona_voice_overrides_admin_insert ON public.persona_voice_overrides;
CREATE POLICY persona_voice_overrides_admin_insert ON public.persona_voice_overrides
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.voice_platform_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

DROP POLICY IF EXISTS persona_voice_overrides_admin_update ON public.persona_voice_overrides;
CREATE POLICY persona_voice_overrides_admin_update ON public.persona_voice_overrides
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.voice_platform_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.voice_platform_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

DROP POLICY IF EXISTS persona_voice_overrides_admin_delete ON public.persona_voice_overrides;
CREATE POLICY persona_voice_overrides_admin_delete ON public.persona_voice_overrides
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.voice_platform_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- The browser client needs table privileges in addition to the RLS
-- policies above (RLS gates rows; it does not grant access). Anon gets
-- nothing: the overrides are an admin surface, never public.
REVOKE ALL ON TABLE public.persona_voice_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.persona_voice_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.persona_voice_overrides TO service_role;
