-- Voice cloning (2026-11-13): the client's ElevenLabs cloned voice, created
-- from the setup wizard's "Create your own voice" panel by the
-- voice-clone-create edge function (ElevenLabs Instant Voice Cloning).
--
-- ⚠️ DEPLOY ROUTE: do NOT apply this file with a db-push deploy — the
-- November migration ledger has drift and a push would replay/reconcile
-- unrelated migrations. Apply it by pasting this file into the Supabase
-- dashboard SQL editor for project mrtvqttecdfgphgxeygj (the proven route),
-- then verify with the SELECT at the bottom. It is idempotent
-- (ADD COLUMN IF NOT EXISTS), so a re-run is harmless. All runtime code
-- treats the new columns as OPTIONAL: voice-clone-create probes them and
-- degrades to "no clone stored" when they are absent, so the function may
-- deploy before or after this SQL.
--
-- The $50 custom add-on covers BOTH the photo avatar (custom_avatar_credits)
-- and this voice clone; entitlement is the purchased credit row, these
-- columns only store the resulting clone.

-- cloned_voice_id: the ElevenLabs voice_id returned by POST /v1/voices/add.
-- cloned_voice_status: creating | ready | failed (written by the function).
ALTER TABLE public.voice_agents
  ADD COLUMN IF NOT EXISTS cloned_voice_id text,
  ADD COLUMN IF NOT EXISTS cloned_voice_name text,
  ADD COLUMN IF NOT EXISTS cloned_voice_status text;

-- Verify (expect 3 rows):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'voice_agents'
--   AND column_name LIKE 'cloned_voice%';
