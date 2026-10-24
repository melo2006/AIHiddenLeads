// One-off maintenance: refresh the homepage agent's stored knowledge from the
// reviewed reference in _shared/homepage-knowledge.ts. Admin-only.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { HOMEPAGE_KNOWLEDGE, HOMEPAGE_SALES_PROMPT } from '../_shared/homepage-knowledge.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'platform_admin').maybeSingle();
    if (!role) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { data: agent, error: findErr } = await db.from('voice_agents').select('id,draft,published').eq('slug', 'aspen-homepage').single();
    if (findErr || !agent) throw findErr ?? new Error('homepage agent not found');
    const patch = (cfg: Record<string, unknown> | null) => cfg ? { ...cfg, knowledge: HOMEPAGE_KNOWLEDGE, systemPrompt: HOMEPAGE_SALES_PROMPT } : cfg;
    const { error: upErr } = await db.from('voice_agents').update({ draft: patch(agent.draft), published: patch(agent.published) }).eq('id', agent.id);
    if (upErr) throw upErr;
    return new Response(JSON.stringify({ ok: true, agentId: agent.id }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
