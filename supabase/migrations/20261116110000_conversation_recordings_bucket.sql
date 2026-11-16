-- Conversation recordings bucket (2026-11-16).
--
-- The Gemini Live proxy has uploaded per-speaker WAV checkpoints to
-- the 'conversation-recordings' Storage bucket since the recording
-- feature shipped, but the bucket was never provisioned in any
-- migration — every checkpoint failed with "Bucket not found" (the
-- proxy swallowed the error as a bare 'audio checkpoint failed' log
-- line), on BOTH the Edge and VPS paths. Transcripts/records were
-- unaffected; only the audio files were lost.
--
-- APPLIED 2026-11-16 via the Storage admin API from the VPS
-- (createBucket, public = false), verified by an upload/remove
-- probe. This file records the provisioning canonically for fresh
-- environments; it is idempotent.
insert into storage.buckets (id, name, public)
values ('conversation-recordings', 'conversation-recordings', false)
on conflict (id) do nothing;
