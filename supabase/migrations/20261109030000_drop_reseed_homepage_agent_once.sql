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
-- The chunked apply also created ten part-functions holding the split string
-- literals (5 knowledge parts + 5 prompt parts); dropped in the same session.
DROP FUNCTION IF EXISTS public.homepage_kb_knowledge_p1();
DROP FUNCTION IF EXISTS public.homepage_kb_knowledge_p2();
DROP FUNCTION IF EXISTS public.homepage_kb_knowledge_p3();
DROP FUNCTION IF EXISTS public.homepage_kb_knowledge_p4();
DROP FUNCTION IF EXISTS public.homepage_kb_knowledge_p5();
DROP FUNCTION IF EXISTS public.homepage_kb_prompt_p1();
DROP FUNCTION IF EXISTS public.homepage_kb_prompt_p2();
DROP FUNCTION IF EXISTS public.homepage_kb_prompt_p3();
DROP FUNCTION IF EXISTS public.homepage_kb_prompt_p4();
DROP FUNCTION IF EXISTS public.homepage_kb_prompt_p5();
