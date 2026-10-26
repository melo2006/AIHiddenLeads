CREATE TABLE public.customer_workspaces (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, environment text NOT NULL, organization_id uuid NOT NULL REFERENCES public.voice_organizations(id), agent_id uuid NOT NULL REFERENCES public.voice_agents(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,environment));
GRANT SELECT ON public.customer_workspaces TO authenticated; GRANT ALL ON public.customer_workspaces TO service_role;
ALTER TABLE public.customer_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_workspace_owner ON public.customer_workspaces FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.provision_paid_workspace(_user uuid,_env text,_config jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE existing uuid; org uuid; agent uuid; BEGIN
IF _env NOT IN ('sandbox','live') THEN RAISE EXCEPTION 'Invalid environment'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=_user AND environment=_env AND price_id IN ('essentials_monthly','growth_monthly','fullservice_monthly') AND ((status IN ('active','past_due') AND (current_period_end IS NULL OR current_period_end>now())) OR (status='canceled' AND current_period_end>now()))) THEN RAISE EXCEPTION 'Paid subscription required'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(_user::text||_env,0));
SELECT agent_id INTO existing FROM public.customer_workspaces WHERE user_id=_user AND environment=_env; IF existing IS NOT NULL THEN RETURN existing; END IF;
INSERT INTO public.voice_organizations(name) VALUES('Customer business') RETURNING id INTO org;
INSERT INTO public.voice_agents(organization_id,draft) VALUES(org,_config) RETURNING id INTO agent;
INSERT INTO public.voice_memberships(organization_id,user_id,role) VALUES(org,_user,'editor');
INSERT INTO public.customer_workspaces(user_id,environment,organization_id,agent_id) VALUES(_user,_env,org,agent);
RETURN agent; END $$;
REVOKE ALL ON FUNCTION public.provision_paid_workspace(uuid,text,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.provision_paid_workspace(uuid,text,jsonb) TO service_role;
GRANT SELECT ON public.subscriptions TO authenticated; GRANT ALL ON public.subscriptions TO service_role;