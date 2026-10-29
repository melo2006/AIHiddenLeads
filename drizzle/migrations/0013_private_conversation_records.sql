CREATE TABLE public.conversation_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_ref text NOT NULL UNIQUE,
 channel text NOT NULL,
 business_name text NOT NULL DEFAULT '',
 agent_id uuid,
 transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
 audio_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
 summary jsonb,
 summary_status text NOT NULL DEFAULT 'pending',
 summary_error text,
 recipient_name text,
 recipient_email text,
 copy_requested_at timestamptz,
 copy_sent_at timestamptz,
 recording_agreed_at timestamptz,
 status text NOT NULL DEFAULT 'live',
 created_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz
);
GRANT SELECT ON public.conversation_records TO authenticated;
GRANT ALL ON public.conversation_records TO service_role;
ALTER TABLE public.conversation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_records_admin_read ON public.conversation_records FOR SELECT TO authenticated USING (public.is_voice_admin());
CREATE TABLE public.conversation_copy_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES public.conversation_records(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.conversation_copy_links TO service_role;
ALTER TABLE public.conversation_copy_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read call history" ON public.call_history;
CREATE POLICY "Platform admin reads call history" ON public.call_history FOR SELECT TO authenticated USING (public.is_voice_admin());
DROP POLICY IF EXISTS "Admin can read demo_chat_interactions" ON public.demo_chat_interactions;
CREATE POLICY "Platform admin reads chat records" ON public.demo_chat_interactions FOR SELECT TO authenticated USING (public.is_voice_admin());
CREATE POLICY conversation_audio_admin_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='conversation-recordings' AND public.is_voice_admin());