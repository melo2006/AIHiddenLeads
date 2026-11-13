-- Demo-intake SMS consent (Telnyx TFV fix, 2026-11-13): the website demo
-- form gained an honest OPTIONAL SMS checkbox (unchecked by default; the
-- demo works identically either way). The visitor's choice is written to
-- leads.sms_consent — the same column the follow-up pack added for
-- phone-demo leads — through this SECURITY DEFINER RPC, mirroring the
-- established set_demo_lead_uploads pattern (anon cannot UPDATE leads
-- directly). Both values are recorded: true = ticked, false = shown and
-- left unticked (no SMS may be sent on any lane for that lead; email is
-- unaffected). NULL keeps its existing meaning: never asked.
--
-- ⚠️ DEPLOY ROUTE: do NOT apply this file with a db-push deploy — the
-- November migration ledger has drift and a push would replay/reconcile
-- unrelated migrations. Apply it by pasting this file into the Supabase
-- dashboard SQL editor for project mrtvqttecdfgphgxeygj (the proven
-- route). It is idempotent (CREATE OR REPLACE), so a re-run is harmless.
-- The client treats the write as best-effort (same as uploads): until
-- this SQL is applied, the demo still starts normally and the consent
-- write simply logs an error in the browser console.

CREATE OR REPLACE FUNCTION public.set_demo_lead_sms_consent(
  _lead_id uuid,
  _sms_consent boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET sms_consent = COALESCE(_sms_consent, false)
  WHERE id = _lead_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_demo_lead_sms_consent(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_demo_lead_sms_consent(uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.set_demo_lead_sms_consent(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_demo_lead_sms_consent(uuid, boolean) TO service_role;

-- Verification (run after applying; expect: set_demo_lead_sms_consent):
--   SELECT proname FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname = 'set_demo_lead_sms_consent';
