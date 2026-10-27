import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeTheme } from '../_shared/widget-theme.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method!=='GET')return json({error:'GET required'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 const id=new URL(req.url).searchParams.get('agentId');
 if(id&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id))return json({error:'Invalid agent'},400);
 let query=db.from('voice_agents').select('id,published');query=id?query.eq(/^[0-9a-f-]{36}$/i.test(id)?'id':'slug',id):query.eq('slug','aspen-homepage');
 const {data:agent}=await query.maybeSingle();if(!agent?.published)return json({error:'Agent not published'},404);
 const c=agent.published as Record<string,unknown>;
 let avatarUrl='';if(c.avatarPath){const {data}=await db.storage.from('lead-uploads').createSignedUrl(String(c.avatarPath),3600);avatarUrl=data?.signedUrl||'';}
 return json({id:agent.id,name:c.name,businessName:c.businessName,avatarUrl,theme:normalizeTheme(c.theme)});
});