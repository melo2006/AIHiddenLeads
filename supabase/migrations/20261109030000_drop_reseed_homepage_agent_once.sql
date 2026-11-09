-- Cleanup for the one-off homepage-agent reseed capability (20261109020000).
-- The reseed was executed once on 2026-11-09; the capability RPC, its knowledge
-- source function, and the chunk-assembly helper functions are removed.
-- Applied manually via the Supabase dashboard SQL editor on 2026-11-09
-- (migration ledger row inserted alongside), same route as 20261109020000.
DROP FUNCTION IF EXISTS public.reseed_homepage_agent_once(text);
DROP FUNCTION IF EXISTS public.homepage_agent_knowledge_source();
DROP FUNCTION IF EXISTS public.homepage_kb_greeting();
DROP FUNCTION IF EXISTS public.homepage_kb_knowledge();
DROP FUNCTION IF EXISTS public.homepage_kb_prompt();
