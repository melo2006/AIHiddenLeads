CREATE OR REPLACE FUNCTION public.authorize_gemini_session(_visitor text, _token text, _config jsonb, _agent uuid DEFAULT NULL, _org uuid DEFAULT NULL, _lead uuid DEFAULT NULL, _prospect uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g voice_guardrails; sid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(761084);
 SELECT * INTO g FROM voice_guardrails ORDER BY created_at LIMIT 1;
 IF g.enabled THEN
  IF (SELECT count(*) FROM gemini_voice_sessions WHERE created_at >= date_trunc('day',now())) + (SELECT count(*) FROM demo_call_attempts WHERE allowed AND created_at>=date_trunc('day',now())) >= g.max_calls_per_day_total THEN
   RAISE EXCEPTION 'Daily voice limit reached';
  END IF;
  IF coalesce(_config->>'quotaClass','visitor')='visitor' AND (SELECT count(*) FROM gemini_voice_sessions WHERE visitor_hash=_visitor AND created_at>=date_trunc('day',now()) AND coalesce(config->>'preview','false')<>'true' AND coalesce(config->>'quotaClass','visitor')='visitor' AND (consumed OR expires_at>now())) >= g.max_calls_per_visitor_per_day THEN
   RAISE EXCEPTION 'Your daily voice limit has been reached';
  END IF;
 END IF;
 INSERT INTO gemini_voice_sessions(visitor_hash,token_hash,config,agent_id,organization_id,lead_id,prospect_id,max_seconds) VALUES(_visitor,_token,_config,_agent,_org,_lead,_prospect,least(coalesce(g.max_call_seconds,300),3600)) RETURNING id INTO sid;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.authorize_gemini_session(text,text,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_gemini_session(text,text,jsonb,uuid,uuid,uuid,uuid) TO service_role;