import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { DEFAULT_AGENT, VOICES, isPublicUrl } from '../_shared/voice-config.ts';
import { validPricing } from '../_shared/voice-usage.ts';

const configSchema = z.object({ name:z.string().min(1).max(80), businessName:z.string().min(1).max(160), voice:z.enum(VOICES as [string,...string[]]), avatarPath:z.string().max(500).default(''), greeting:z.string().min(1).max(1500), systemPrompt:z.string().min(1).max(12000), knowledge:z.string().max(60000).default(''), crawlDepth:z.union([z.literal(1),z.literal(2)]).default(1), recordTranscript:z.boolean().default(false) });
const requestSchema = z.object({ action:z.enum(['list','usage','pricing','create','save','publish','source','refresh','removeSource','member','rollback']), agentId:z.string().uuid().optional(), sourceId:z.string().uuid().optional(), config:configSchema.optional(), businessName:z.string().min(1).max(160).optional(), userEmail:z.string().email().optional(), kind:z.enum(['url','document']).optional(), label:z.string().min(1).max(255).optional(), url:z.string().max(2000).optional(), storagePath:z.string().max(500).optional(), pricing:z.object({model:z.literal('gemini-3.8-live'),inputAudioPerMinute:z.number().finite().min(0).max(100),outputAudioPerMinute:z.number().finite().min(0).max(100),source:z.string().url().max(2000)}).optional() });
const json = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return json({error:'POST required'},405);
  try {
    const db=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    if(!token) return json({error:'Sign in required'},401);
    const {data:{user}}=await db.auth.getUser(token);
    if(!user) return json({error:'Sign in required'},401);
    const {data:role}=await db.from('voice_platform_roles').select('role').eq('user_id',user.id).maybeSingle();
    const admin=role?.role==='admin';
    const parsed=requestSchema.safeParse(await req.json());
    if(!parsed.success) return json({error:parsed.error.flatten()},400);
    const body=parsed.data;
    if(body.action==='usage' || body.action==='pricing') {
      if(!admin) return json({error:'Administrator access required'},403);
      if(body.action==='pricing') {
        const pricing=validPricing(body.pricing,'gemini-3.8-live');
        if(!pricing) return json({error:'Enter model-specific audio rates and an HTTPS pricing reference.'},400);
        const {data:guard,error:guardError}=await db.from('voice_guardrails').select('id').limit(1).single(); if(guardError) throw guardError;
        const {error}=await db.from('voice_guardrails').update({gemini_pricing:pricing}).eq('id',guard.id); if(error) throw error;
        return json({success:true});
      }
      const {data:sessions,error}=await db.from('gemini_voice_sessions').select('id,created_at,started_at,ended_at,last_activity_at,duration_seconds,status,agent_id,organization_id,lead_id,prospect_id,config,usage').order('created_at',{ascending:false}).limit(500); if(error) throw error;
      const {data:guard}=await db.from('voice_guardrails').select('gemini_pricing').limit(1).maybeSingle();
      return json({model:'gemini-3.8-live',pricing:guard?.gemini_pricing || {},sessions:(sessions || []).map(({config,...s})=>({...s,businessName:config?.businessName || 'Voice lab',preview:config?.preview===true,transcriptEnabled:config?.recordTranscript===true}))});
    }
    if(body.action==='list') {
      const {data:members}=await db.from('voice_memberships').select('organization_id').eq('user_id',user.id).eq('role','editor');
      let query=db.from('voice_agents').select('*,voice_organizations(name),voice_agent_sources(*)').order('created_at');
      if(!admin) query=query.in('organization_id',(members || []).map(m=>m.organization_id));
      const {data,error}=await query; if(error) throw error;
      return json({agents:data,admin});
    }
    if(body.action==='create') {
      if(!admin) return json({error:'Administrator access required'},403);
      const businessName=body.businessName || 'New business';
      const {data:org,error}=await db.from('voice_organizations').insert({name:businessName}).select().single(); if(error) throw error;
      const {data:homepage}=await db.from('voice_agents').select('id').eq('slug','aspen-homepage').maybeSingle();
      const isHomepage=businessName==='AI Hidden Leads' && !homepage;
      const {data:agent,error:err}=await db.from('voice_agents').insert({organization_id:org.id,draft:{...DEFAULT_AGENT,businessName},...(isHomepage?{slug:'aspen-homepage'}:{})}).select().single(); if(err) throw err;
      return json({agent});
    }
    if(!body.agentId) return json({error:'Agent required'},400);
    const {data:agent}=await db.from('voice_agents').select('*').eq('id',body.agentId).maybeSingle();
    if(!agent) return json({error:'Agent not found'},404);
    const {data:membership}=await db.from('voice_memberships').select('id').eq('organization_id',agent.organization_id).eq('user_id',user.id).eq('role','editor').maybeSingle();
    if(!admin && !membership) return json({error:'Access denied'},403);
    if(body.action==='member') {
      if(!admin || !body.userEmail) return json({error:'Administrator and client email required'},403);
      // Existing accounts only: no public signup or silent creation of user identities.
      let client=null;
      for(let page=1;page<=20;page++) { const {data,error}=await db.auth.admin.listUsers({page,perPage:100}); if(error) throw error; client=data.users.find(u=>u.email?.toLowerCase()===body.userEmail?.toLowerCase()); if(client || data.users.length<100) break; }
      if(!client) return json({error:'This client needs an existing sign-in account before access can be granted.'},400);
      const {error}=await db.from('voice_memberships').upsert({organization_id:agent.organization_id,user_id:client.id,role:'editor'},{onConflict:'organization_id,user_id'}); if(error) throw error;
      return json({success:true});
    }
    if(body.action==='save') {
      if(!body.config) return json({error:'Settings required'},400);
      if(body.config.avatarPath && !body.config.avatarPath.startsWith(`voice/${agent.id}/`)) return json({error:'Avatar must belong to this agent'},400);
      const {error}=await db.from('voice_agents').update({draft:body.config,updated_at:new Date().toISOString()}).eq('id',agent.id); if(error) throw error; return json({success:true});
    }
    if(body.action==='publish') {
      const parsedConfig=configSchema.safeParse(agent.draft); if(!parsedConfig.success) return json({error:'Save valid settings first'},400);
      const {data:sources}=await db.from('voice_agent_sources').select('content,status').eq('agent_id',agent.id);
      if(sources?.some(s=>s.status!=='ready')) return json({error:'Refresh or remove unfinished knowledge sources before publishing.'},400);
      const config={...parsedConfig.data,sourceKnowledge:(sources || []).map(s=>s.content || '').join('\n\n').slice(0,100000)};
      const version=agent.version+1;
      const {error}=await db.from('voice_agent_versions').insert({agent_id:agent.id,version,config}); if(error) throw error;
      const {error:err}=await db.from('voice_agents').update({published:config,version,updated_at:new Date().toISOString()}).eq('id',agent.id); if(err) throw err;
      return json({success:true,version});
    }
    if(body.action==='rollback') {
      const {data:versions}=await db.from('voice_agent_versions').select('*').eq('agent_id',agent.id).order('version',{ascending:false}).limit(2);
      const previous=versions?.[1]; if(!previous) return json({error:'No earlier published version'},400);
      const {error}=await db.from('voice_agents').update({published:previous.config,updated_at:new Date().toISOString()}).eq('id',agent.id); if(error) throw error; return json({success:true});
    }
    if(body.action==='source') {
      if(!body.kind || !body.label) return json({error:'Source type and label required'},400);
      if(body.kind==='url' && (!body.url || !isPublicUrl(body.url))) return json({error:'Use a public website URL'},400);
      if(body.kind==='document' && (!body.storagePath?.startsWith(`voice/${agent.id}/`) || !/\.(txt|md|csv|pdf)$/i.test(body.storagePath))) return json({error:'Upload a PDF, text, Markdown or CSV document to this agent'},400);
      const {count}=await db.from('voice_agent_sources').select('id',{count:'exact',head:true}).eq('agent_id',agent.id);
      if((count || 0)>=12) return json({error:'Maximum 12 sources per agent'},400);
      const {error}=await db.from('voice_agent_sources').insert({agent_id:agent.id,kind:body.kind,label:body.label,url:body.url,storage_path:body.storagePath}); if(error) throw error; return json({success:true});
    }
    const {data:source}=await db.from('voice_agent_sources').select('*').eq('id',body.sourceId || '').eq('agent_id',agent.id).maybeSingle();
    if(!source) return json({error:'Source not found'},404);
    if(body.action==='removeSource') { const {error}=await db.from('voice_agent_sources').delete().eq('id',source.id); if(error) throw error; return json({success:true}); }
    await db.from('voice_agent_sources').update({status:'processing',last_error:null}).eq('id',source.id);
    try {
      let content='';
      if(source.kind==='document' && /\.(txt|md|csv)$/i.test(source.storage_path || '')) {
        const {data:file,error}=await db.storage.from('lead-uploads').download(source.storage_path); if(error) throw error; if(file.size>10*1024*1024) throw new Error('Maximum document size is 10 MB'); content=await file.text();
      } else if(source.kind==='document') {
        const {data:link,error}=await db.storage.from('lead-uploads').createSignedUrl(source.storage_path,120); if(error || !link) throw new Error('Document is unavailable');
        const key=Deno.env.get('FIRECRAWL_API_KEY'); if(!key) throw new Error('Document parser is unavailable');
        const response=await fetch('https://api.firecrawl.dev/v1/scrape',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({url:link.signedUrl,formats:['markdown']})});
        const result=await response.json(); if(!response.ok || !result.success) throw new Error('PDF could not be read. Upload a text version instead.');
        content=result.data?.markdown || '';
      } else {
        const config=agent.draft as Record<string,unknown>;
        const websiteUrl=source.url || 'https://aihiddenleads.com';
        if(!isPublicUrl(websiteUrl)) throw new Error('Invalid source URL');
        const {data:lead,error}=await db.from('leads').insert({business_name:String(config.businessName),full_name:'Voice knowledge ingestion',website_url:websiteUrl,niche:'general',scan_status:'pending'}).select('id').single(); if(error) throw error;
        const {error:scanError}=await db.functions.invoke('scan-website',{body:{leadId:lead.id,websiteUrl,businessName:config.businessName,crawlDepth:config.crawlDepth,uploadedFiles:source.storage_path?[source.storage_path]:[]}}); if(scanError) throw new Error('Website learning failed; try refreshing the source again.');
        const {data:result}=await db.from('leads').select('website_content,scan_status').eq('id',lead.id).single();
        content=result?.website_content || ''; if(!content || result?.scan_status==='failed') throw new Error('No readable knowledge was found.');
      }
      if(!content.trim()) throw new Error('This source is empty.');
      const {error}=await db.from('voice_agent_sources').update({content:content.slice(0,100000),status:'ready',refreshed_at:new Date().toISOString(),last_error:null}).eq('id',source.id); if(error) throw error;
      return json({success:true});
    } catch(e) { const message=e instanceof Error?e.message:'Learning failed'; await db.from('voice_agent_sources').update({status:'failed',last_error:message}).eq('id',source.id); return json({error:message},400); }
  } catch(e) { console.error('voice-agents:',e); return json({error:e instanceof Error?e.message:'Could not update voice agent'},500); }
});