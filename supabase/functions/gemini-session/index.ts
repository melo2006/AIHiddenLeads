import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { DEFAULT_AGENT, VOICES, greeting } from '../_shared/voice-config.ts';
const schema=z.object({ visitorKey:z.string().min(16).max(100), agentId:z.string().uuid().optional(), leadId:z.string().uuid().optional(), prospectId:z.string().uuid().optional(), draft:z.boolean().default(false), preview:z.boolean().default(false), voice:z.enum(VOICES as [string,...string[]]).optional(), hour:z.number().int().min(0).max(23).optional(), visitorName:z.string().max(100).default(''), consent:z.boolean().default(false) });
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
export async function hash(value:string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join(''); }
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return json({error:'POST required'},405);
 try {
  const parsed=schema.safeParse(await req.json()); if(!parsed.success) return json({error:'Invalid voice session request'},400); const b=parsed.data;
  const db=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  let config:Record<string,unknown>, agentId=null, orgId=null;
  if(b.draft || b.preview) {
    const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'') || '';
    const {data:{user}}=await db.auth.getUser(token); if(!user) return json({error:'Sign in to preview voices'},401);
    const {data:role}=await db.from('voice_platform_roles').select('role').eq('user_id',user.id).maybeSingle();
    if(!b.agentId) { if(role?.role!=='admin') return json({error:'Administrator access required'},403); config={...DEFAULT_AGENT}; }
    else {
      const {data:agent}=await db.from('voice_agents').select('*').eq('id',b.agentId).maybeSingle(); if(!agent) return json({error:'Agent not found'},404);
      const {data:member}=await db.from('voice_memberships').select('id').eq('organization_id',agent.organization_id).eq('user_id',user.id).eq('role','editor').maybeSingle(); if(role?.role!=='admin' && !member) return json({error:'Access denied'},403);
      const {data:sources}=await db.from('voice_agent_sources').select('content').eq('agent_id',agent.id).eq('status','ready');
      config={...(agent.draft as Record<string,unknown>),sourceKnowledge:(sources || []).map(s=>s.content || '').join('\n').slice(0,100000)}; agentId=agent.id; orgId=agent.organization_id;
    }
    if(b.voice) config.voice=b.voice;
  } else if(b.leadId || b.prospectId) {
    let knowledge='', businessName='';
    if(b.leadId) { const {data:lead}=await db.from('leads').select('business_name,website_url,website_content,scan_status').eq('id',b.leadId).maybeSingle(); if(!lead || !lead.website_content || !['completed','enriched'].includes(lead.scan_status)) return json({error:'This business demo has not finished learning its website. Please wait for the scan.'},409); knowledge=lead.website_content; businessName=lead.business_name; }
    else { const {data:p}=await db.from('prospects').select('business_name,business_data,ai_analysis').eq('id',b.prospectId).maybeSingle(); if(!p) return json({error:'Demo business not found'},404); knowledge=JSON.stringify(p.business_data || {}); businessName=p.business_name; if(knowledge.length<20) return json({error:'Prepare this prospect website demo before starting a call.'},409); }
    config={...DEFAULT_AGENT,businessName,sourceKnowledge:knowledge.slice(0,100000),systemPrompt:'You are demonstrating the voice assistant for this business to its owner. Briefly explain this is a simulation, then act as its front desk or sales assistant. Answer using only this exact business reference. Keep the introduction under 8 seconds. Offer to demonstrate a typical customer enquiry. Any calendar check or appointment suggestion must be explicitly hypothetical. At the end invite the owner to ask AI Hidden Leads about setting this up. Never speak as AI Hidden Leads during the business roleplay.'};
  } else {
    let query=db.from('voice_agents').select('*'); query=b.agentId?query.eq('id',b.agentId):query.eq('slug','aspen-homepage');
    const {data:agent}=await query.maybeSingle(); if(!agent?.published) return json({error:'Voice agent is not published yet'},409);
    config=agent.published as Record<string,unknown>; agentId=agent.id; orgId=agent.organization_id;
  }
  config={...config,opening:greeting(config,b.hour,b.visitorName),preview:b.preview,recordTranscript:Boolean(config.recordTranscript)&&b.consent};
  const token=crypto.randomUUID()+crypto.randomUUID();
  const visitor=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
  const {data:id,error}=await db.rpc('authorize_gemini_session',{_visitor:visitor,_token:await hash(token),_config:config,_agent:agentId,_org:orgId,_lead:b.leadId || null,_prospect:b.prospectId || null});
  if(error) return json({error:error.message},429);
  const {data:s}=await db.from('gemini_voice_sessions').select('max_seconds').eq('id',id).single();
  let avatarUrl=''; if(config.avatarPath) { const {data}=await db.storage.from('lead-uploads').createSignedUrl(String(config.avatarPath),3600); avatarUrl=data?.signedUrl || ''; }
  return json({token,sessionId:id,maxSeconds:s?.max_seconds,name:config.name,businessName:config.businessName,voice:config.voice,avatarUrl});
 } catch(e) {console.error('gemini-session',e);return json({error:'Could not authorize the voice session'},500);}
});