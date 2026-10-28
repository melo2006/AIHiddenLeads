import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeTheme } from '../_shared/widget-theme.ts';
import { resolveDemoShare } from '../_shared/demo-share.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method!=='GET')return json({error:'GET required'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 const share=new URL(req.url).searchParams.get('share');
 if(share){const agent=await resolveDemoShare(db,share);if(!agent)return json({error:'This demo link has expired or was turned off.'},404);const c=agent.draft as Record<string,unknown>;let avatarUrl='';if(c.avatarPath){const {data}=await db.storage.from('lead-uploads').createSignedUrl(String(c.avatarPath),3600);avatarUrl=data?.signedUrl||'';}
  // Public-safe fields only: no prompts, sources, contacts, transfer numbers or other tenants.
  return json({name:c.name,businessName:c.businessName,websiteUrl:c.websiteUrl||'',industry:c.industry||'',greeting:c.greeting||'',previewScreenshot:c.previewScreenshot||'',launcherLabel:c.launcherLabel||'Ask Aspen',launcherCorner:c.launcherCorner||'bottom-right',theme:normalizeTheme(c.theme),avatarUrl});}
 const id=new URL(req.url).searchParams.get('agentId');
 if(id&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id))return json({error:'Invalid agent'},400);
 let query=db.from('voice_agents').select('id,published');query=id?query.eq(/^[0-9a-f-]{36}$/i.test(id)?'id':'slug',id):query.eq('slug','aspen-homepage');
 const {data:agent}=await query.maybeSingle();if(!agent?.published)return json({error:'Agent not published'},404);
 const c=agent.published as Record<string,unknown>;
 let avatarUrl='';if(c.avatarPath){const {data}=await db.storage.from('lead-uploads').createSignedUrl(String(c.avatarPath),3600);avatarUrl=data?.signedUrl||'';}
 return json({id:agent.id,name:c.name,businessName:c.businessName,avatarUrl,theme:normalizeTheme(c.theme)});
});