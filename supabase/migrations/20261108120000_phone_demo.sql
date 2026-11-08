-- Phone Demo (voice-only front door): per-line opt-in for the AiHiddenLeads
-- phone demo. Only the company's own front-door numbers may offer the demo;
-- tenant lines must never pitch AiHiddenLeads, so the flag defaults to
-- false and is set explicitly for the two front-door rows below.
--
-- telephony-stream reads the flag at session start: it appends the phone
-- demo host policy (supabase/functions/_shared/phone-demo.ts) to the phone
-- instructions and tells the bridge to declare the phone-demo tools. No
-- other schema changes are needed: phone demos write to the same leads
-- table the web demo uses (verification/consent columns were added by
-- 20261108090000_verified_demo_gate.sql).

ALTER TABLE public.telephony_clients
  ADD COLUMN IF NOT EXISTS phone_demo_enabled boolean NOT NULL DEFAULT false;

-- The AIWIZ pair: toll-free +1 877-862-4949 and Hobe Sound +1 772-362-4949.
UPDATE public.telephony_clients
SET phone_demo_enabled = true
WHERE voice_number IN ('+18778624949', '+17723624949');
