ALTER TABLE public.telephony_clients ADD COLUMN IF NOT EXISTS transfer_name text, ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.voice_agents(id) ON DELETE SET NULL;
CREATE TABLE public.telephony_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.telephony_clients(id) ON DELETE CASCADE,
  call_sid text NOT NULL UNIQUE,
  from_phone text,
  token_hash text NOT NULL UNIQUE,
  token_used boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ringing',
  transferred boolean NOT NULL DEFAULT false,
  transfer_summary text,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT ON public.telephony_calls TO authenticated;
GRANT ALL ON public.telephony_calls TO service_role;
ALTER TABLE public.telephony_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read telephony calls" ON public.telephony_calls FOR SELECT TO authenticated USING (public.is_voice_admin());