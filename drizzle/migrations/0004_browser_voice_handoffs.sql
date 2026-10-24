CREATE TABLE public.browser_voice_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL UNIQUE REFERENCES public.gemini_voice_sessions(id),
 call_history_id uuid NOT NULL REFERENCES public.call_history(id),
 organization_id uuid REFERENCES public.voice_organizations(id),
 token_hash text NOT NULL UNIQUE,
 status public.call_transfer_status NOT NULL DEFAULT 'not_requested',
 target_phone text NOT NULL,
 manager_name text NOT NULL DEFAULT 'the manager',
 summary text NOT NULL DEFAULT '',
 browser_call_sid text,
 owner_call_sid text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.browser_voice_handoffs TO authenticated;
GRANT ALL ON public.browser_voice_handoffs TO service_role;
ALTER TABLE public.browser_voice_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authorized voice managers read handoffs" ON public.browser_voice_handoffs FOR SELECT TO authenticated USING (public.is_voice_admin() OR public.can_manage_voice(organization_id));
CREATE OR REPLACE FUNCTION public.advance_browser_handoff(_id uuid, _expected public.call_transfer_status[], _next public.call_transfer_status, _error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.browser_voice_handoffs;
BEGIN
 UPDATE public.browser_voice_handoffs SET status=_next, last_error=_error, updated_at=now()
 WHERE id=_id AND status=ANY(_expected) RETURNING * INTO h;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.call_history SET transfer_requested=true, transfer_status=_next,
 transfer_target_phone=h.target_phone, transfer_conference_name='browser-handoff-'||h.id,
 transfer_caller_call_sid=h.browser_call_sid, transfer_owner_call_sid=h.owner_call_sid,
 transfer_error=_error, updated_at=now() WHERE id=h.call_history_id;
 INSERT INTO public.call_event_logs(call_history_id,event_type,event_source,message,payload)
 VALUES(h.call_history_id,'browser_transfer_'||_next,'twilio_browser',_error,jsonb_build_object('handoff_id',h.id,'status',_next));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.advance_browser_handoff(uuid,public.call_transfer_status[],public.call_transfer_status,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_browser_handoff(uuid,public.call_transfer_status[],public.call_transfer_status,text) TO service_role;