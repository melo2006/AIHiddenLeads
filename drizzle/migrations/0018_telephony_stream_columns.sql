ALTER TABLE public.telephony_calls
  ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'webhook',
  ADD COLUMN IF NOT EXISTS ai_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reconnects integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checkpoint_at timestamptz;