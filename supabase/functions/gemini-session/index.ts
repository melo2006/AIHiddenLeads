import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { DEFAULT_AGENT, VOICES, openingFor, businessDemoConfig } from '../_shared/voice-config.ts';
import { DEFAULT_LIVE_MODEL, officialLivePricing } from '../_shared/live-models.ts';
import { voiceQuotaClass, voiceLimitResponse } from '../_shared/voice-session-limit.ts';
import { transferDestination } from '../_shared/browser-handoff.ts';
import { transcriptAllowed } from '../_shared/transcript-consent.ts';
import { workspaceAccess } from '../_shared/customer-payments.ts';
import { resolveDemoShare } from '../_shared/demo-share.ts';
import { DEMO_INVITE_GREETING, DEMO_INVITE_OPENING, DEMO_VERIFICATION_ACT1, DEMO_VERIFICATION_GREETING } from '../_shared/demo-sales.ts';
import { alexGuideConfig, alexDemoGuestConfig } from '../_shared/alex-guide.ts';
import { avatarSwapEnabled, personaFor, personaSegmentPrompt } from '../_shared/personas.ts';
import { PUBLIC_PATHS } from '../_shared/report-context.ts';
const personaSegmentSchema=z.object({persona:z.enum(['aspen','sara','alex']),boundary:z.enum(['doorway','stepout','meet-alex','return']),parentSessionId:z.string().uuid(),swapRecap:z.string().max(2400),drops:z.number().int().min(0).max(99).default(0),dropRecovery:z.boolean().default(false),swap:z.boolean().default(false)});
const schema=z.object({ visitorKey:z.string().min(16).max(100), model:z.string().max(100).optional(), agentId:z.string().uuid().optional(), leadId:z.string().uuid().optional(), prospectId:z.string().uuid().optional(), draft:z.boolean().default(false), preview:z.boolean().default(false), voice:z.enum(VOICES as [string,...string[]]).optional(), hour:z.number().int().min(0).max(23).optional(), visitorName:z.string().max(100).default(''), timeZone:z.string().max(100).default('UTC'), campaign:z.object({visitId:z.string().uuid(),source:z.string().max(100),campaign:z.string().max(100),entryPath:z.enum(PUBLIC_PATHS).optional()}).nullable().optional(), consent:z.boolean().default(false), verification:z.enum(['pending','verified']).optional(), invite:z.boolean().optional(), guide:z.enum(['alex']).optional(), share:z.string().max(100).optional(), resumeContext:z.string().max(1600).optional(), reconnect:z.boolean().default(false), prewarm:z.boolean().default(false), personaSegment:personaSegmentSchema.optional() });
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
export async function hash(value:string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join(''); }
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 // Warm-up only: wakes this function on page load without issuing any session or capability.
 if(req.method==='GET' && new URL(req.url).searchParams.get('ping')==='1') return json({ok:true});
 if(req.method!=='POST') return json({error:'POST required'},405);
 try {
  const parsed=schema.safeParse(await req.json()); if(!parsed.success) return json({error:'Invalid voice session request'},400); const b=parsed.data;
  const db=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const bearer=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'') || '';
  const {data:{user}}=await db.auth.getUser(bearer);
  const {data:role}=user ? await db.from('voice_platform_roles').select('role').eq('user_id',user.id).maybeSingle() : {data:null};
  let config:Record<string,unknown>, agentId=null, orgId=null;
  // Avatar-swap master flag (Stage 1 lands dark): server env, same pattern
  // as DEMO_VERIFICATION_SMS_ENABLED. Read once per request; the parent
  // demo authorization below stamps it into the session config + response.
  const swapEnabled=avatarSwapEnabled((n)=>Deno.env.get(n));
  let segmentParentId: string | null = null;
  if(b.personaSegment) {
    // PERSONA SEGMENT (avatar swap Stage 1): a continuation of an existing
    // demo session under a (possibly different) persona. Honored ONLY when
    // the flag is on AND parentSessionId names a session row owned by this
    // same visitor hash — the segment inherits its business context
    // (knowledge, contact, campaign, verification/invite flags, recording
    // consent) from the parent's stored config, never from the client, and
    // any client-supplied voice/face is ignored (the persona registry
    // decides both). A demo-guest Alex segment is authorized by this parent
    // chain, NOT by a user JWT; the wizard guide branch below stays
    // signed-in only. Segments are for business demos: the parent must be
    // a simulation session.
    if(!swapEnabled) return json({error:'Persona segments are not enabled'},404);
    const visitorHash=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:parentRow}=await db.from('gemini_voice_sessions').select('id,config,lead_id,prospect_id,agent_id,organization_id').eq('id',b.personaSegment.parentSessionId).eq('visitor_hash',visitorHash).maybeSingle();
    var parentRowRef = parentRow;
    const parent=parentRow?.config as Record<string,unknown>|undefined;
    if(!parentRow || !parent || parent.simulation!==true) return json({error:'Persona segment parent session not found'},404);
    const persona=personaFor(b.personaSegment.persona);
    const businessName=String(parent.businessName || '');
    const built=personaSegmentPrompt(b.personaSegment.persona,b.personaSegment.boundary,businessName,String(parent.systemPrompt || ''),b.personaSegment.persona==='alex'?alexDemoGuestConfig(businessName):undefined);
    config={
      ...parent,
      name:persona.displayName,
      voice:persona.voiceName,
      systemPrompt:built.systemPrompt,
      greeting:built.greeting || parent.greeting,
      knowledge:parent.knowledge ?? '',
      sourceKnowledge:parent.sourceKnowledge ?? '',
      simulation:true,
      platformFollowup:parent.platformFollowup===true,
      platformGuide:false,
      homepageSales:false,
      personaSwapEnabled:true,
      persona:{id:persona.id,displayName:persona.displayName,faceId:persona.faceId},
      // The boundary marker decides the proxy opening: a PLANNED swap gets
      // the swap opening (no apology, no re-greeting); a DROP recovery
      // gets the same-persona rotating-apology opening. Exactly one is set.
      ...(b.personaSegment.swap?{personaSwap:{to:persona.id,boundary:b.personaSegment.boundary},personaDrop:null}:{personaSwap:null,personaDrop:{persona:persona.id,drops:b.personaSegment.drops}}),
      personaSegment:{persona:persona.id,boundary:b.personaSegment.boundary,parentSessionId:parentRow.id,dropRecovery:b.personaSegment.dropRecovery},
      // Consent/recording inheritance (spec Q8): the segment records
      // exactly what the parent recorded — the flags are recomputed from
      // the parent's stored values in the final assembly below, never
      // from this request's consent field.
      recordTranscript:parent.recordTranscript===true,
      recordAudio:parent.recordAudio===true,
      resumeContext:b.personaSegment.swapRecap,
    };
    agentId=parentRow.agent_id; orgId=parentRow.organization_id; segmentParentId=parentRow.id;
  } else if(b.guide==='alex') {
    // Platform guide (Alex, the setup-wizard support specialist). He is not a
    // tenant agent, so the workspaceAccess subscription gate does not apply —
    // but a guide session is NEVER anonymous: a signed-in user is required,
    // and the standard visitor quota class below still caps usage. The
    // config carries no transferPhone, so no handoff token is issued.
    if(!user) return json({error:'Sign in to use the setup guide'},401);
    config=alexGuideConfig();
  } else if(b.share) {
    const agent=await resolveDemoShare(db,b.share); if(!agent) return json({error:'This demo link has expired or was turned off.'},404);
    const {data:sources}=await db.from('voice_agent_sources').select('content').eq('agent_id',agent.id).eq('status','ready');
    config={...(agent.draft as Record<string,unknown>),sourceKnowledge:(sources || []).map(s=>s.content || '').join('\n').slice(0,100000),sharedDemo:true}; agentId=agent.id; orgId=agent.organization_id;
  } else if(b.draft || b.preview) {
    if(!user) return json({error:'Sign in to preview voices'},401);
    if(!b.agentId) { if(role?.role!=='admin') return json({error:'Administrator access required'},403); config={...DEFAULT_AGENT}; }
    else {
      const {data:agent}=await db.from('voice_agents').select('*').eq('id',b.agentId).maybeSingle(); if(!agent) return json({error:'Agent not found'},404);
      if(role?.role!=='admin' && !(await workspaceAccess(db,agent.organization_id))) return json({error:'This assistant subscription is not active'},403);
      const {data:member}=await db.from('voice_memberships').select('id').eq('organization_id',agent.organization_id).eq('user_id',user.id).eq('role','editor').maybeSingle(); if(role?.role!=='admin' && !member) return json({error:'Access denied'},403);
      const {data:sources}=await db.from('voice_agent_sources').select('content').eq('agent_id',agent.id).eq('status','ready');
      config={...(agent.draft as Record<string,unknown>),sourceKnowledge:(sources || []).map(s=>s.content || '').join('\n').slice(0,100000)}; agentId=agent.id; orgId=agent.organization_id;
    }
    if(b.voice) config.voice=b.voice;
  } else if(b.leadId || b.prospectId) {
    if(b.leadId && b.prospectId) { const {data:p}=await db.from('prospects').select('website_url').eq('id',b.prospectId).maybeSingle(); const {data:l}=await db.from('leads').select('website_url').eq('id',b.leadId).maybeSingle(); if(!p || !l || p.website_url!==l.website_url) return json({error:'Prospect and demo website do not match'},400); }
    let knowledge='', businessName=''; let visitorContact: Record<string,unknown> = {}; let leadInviteArrivedAt: unknown = null;
    if(b.leadId) { const {data:lead}=await db.from('leads').select('business_name,website_url,website_content,scan_status,full_name,email,phone,invite_arrived_at').eq('id',b.leadId).maybeSingle(); if(!lead || !lead.website_content || !['completed','enriched','scanning'].includes(lead.scan_status) || lead.website_content.length<200) return json({error:'This business demo has not finished learning its website. Please wait for the scan.'},409); knowledge=lead.website_content; businessName=lead.business_name; visitorContact={name:lead.full_name,email:lead.email || '',phone:lead.phone || ''}; leadInviteArrivedAt=lead.invite_arrived_at; }
    else { const {data:p}=await db.from('prospects').select('business_name,business_data,ai_analysis').eq('id',b.prospectId).maybeSingle(); if(!p) return json({error:'Demo business not found'},404); knowledge=JSON.stringify(p.business_data || {}); businessName=p.business_name; if(knowledge.length<20) return json({error:'Prepare this prospect website demo before starting a call.'},409); }
    const {data:aspen}=await db.from('voice_agents').select('published').eq('slug','aspen-homepage').maybeSingle();
    const published=aspen?.published as Record<string,unknown>|undefined;
    config={...businessDemoConfig(businessName,knowledge,published), visitorContact, platformFollowup:true};
    if(b.verification==='pending') { config.greeting=DEMO_VERIFICATION_GREETING; config.systemPrompt=`${DEMO_VERIFICATION_ACT1}\n\n${String(config.systemPrompt)}`; config.verificationGate=true; }
    // Invite arrivals (cold-email personal link): the host phase replaces
    // the code gate. Honored ONLY when the demo-invite resolve stamped the
    // lead's arrival server-side — a client flag alone never earns it.
    else if(b.invite===true && leadInviteArrivedAt) { config.greeting=DEMO_INVITE_GREETING; config.systemPrompt=`${DEMO_INVITE_OPENING}\n\n${String(config.systemPrompt)}`; config.inviteArrival=true; }
  } else {
    let query=db.from('voice_agents').select('*'); query=b.agentId?query.eq('id',b.agentId):query.eq('slug','aspen-homepage');
    const {data:agent}=await query.maybeSingle(); if(!agent?.published) return json({error:'Voice agent is not published yet'},409);
    if(!(await workspaceAccess(db,agent.organization_id))) return json({error:'This assistant subscription is not active'},403);
    config={...(agent.published as Record<string,unknown>), homepageSales:agent.slug==='aspen-homepage'}; agentId=agent.id; orgId=agent.organization_id;
  }
  const requestedModel = b.model;
  if (!b.personaSegment && !b.preview && !b.consent && !b.prewarm) return json({error:'Agree to the recording notice before starting.'},400);
  if(requestedModel && (b.share || !(b.draft || b.preview) || !officialLivePricing(requestedModel))) return json({error:'Model comparison is available only for authorized draft tests and previews.'},400);
  // Avatar swap (Stage 1): the parent demo authorization carries the flag
  // so the client starts the swap state machine only when the server says
  // so. Segment configs already carry personaSwapEnabled:true from their
  // branch; every other session shape is untouched when the flag is off.
  if(!b.personaSegment && swapEnabled && (b.leadId || b.prospectId) && !b.draft && !b.preview) config.personaSwapEnabled=true;
  config={...config,timeZone:b.timeZone,quotaClass:segmentParentId?'persona_segment':b.share?'visitor':voiceQuotaClass(role?.role==='admin',b.preview),model:requestedModel || DEFAULT_LIVE_MODEL,opening:openingFor(config,b.hour,b.visitorName || String((config.visitorContact as Record<string,unknown>|undefined)?.name || '')),preview:b.preview,resumeContext:b.preview?undefined:(segmentParentId?String(config.resumeContext || ''):b.resumeContext),reconnect:segmentParentId?false:!b.preview&&b.reconnect,campaign:b.campaign || (segmentParentId?(config.campaign ?? null):null),recordTranscript:segmentParentId?config.recordTranscript===true:!b.preview && transcriptAllowed(false,false,b.consent),recordAudio:segmentParentId?config.recordAudio===true:!b.preview && b.consent};
  const token=crypto.randomUUID()+crypto.randomUUID();
  const visitor=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
  const {data:id,error}=await db.rpc('authorize_gemini_session',{_visitor:visitor,_token:await hash(token),_config:config,_agent:agentId,_org:orgId,_lead:segmentParentId?(parentRowRef?.lead_id ?? null):b.leadId || null,_prospect:segmentParentId?(parentRowRef?.prospect_id ?? null):b.prospectId || null});
  if(error) {
    const limit=voiceLimitResponse(error.message);
    if(limit) return json(limit);
    console.error('gemini-session authorization failed',error.code);
    return json({error:'Could not authorize the voice session. Please try again.'},500);
  }
  const {data:s}=await db.from('gemini_voice_sessions').select('max_seconds').eq('id',id).single();
  let avatarUrl=''; if(config.avatarPath) { const {data}=await db.storage.from('lead-uploads').createSignedUrl(String(config.avatarPath),3600); avatarUrl=data?.signedUrl || ''; }
  let handoffToken: string | undefined;
  const destination=transferDestination(config);
  if(destination && !b.preview && !b.share) {
    const {data:history,error:historyError}=await db.from('call_history').upsert({retell_call_id:`gemini_${id}`,lead_id:b.leadId||null,prospect_id:b.prospectId||null,business_name:String(config.businessName),call_status:'connecting',caller_name:b.visitorName||null,metadata:{provider:'gemini',session_id:id,agent_id:agentId,transcript_consent:config.recordTranscript}},{onConflict:'retell_call_id'}).select('id').single();
    if(historyError)throw historyError;
    if(history){
      const capability=crypto.randomUUID()+crypto.randomUUID();
      const {error:handoffError}=await db.from('browser_voice_handoffs').insert({session_id:id,call_history_id:history.id,organization_id:orgId,token_hash:await hash(capability),target_phone:destination,manager_name:String(config.transferManagerName||'the manager'),expires_at:new Date(Date.now()+((s?.max_seconds||300)+600)*1000).toISOString()});
      if(handoffError)throw handoffError;
      handoffToken=capability;
    }
  }
  const parentPersona = segmentParentId ? personaFor(b.personaSegment!.persona) : null;
  return json({token,sessionId:id,maxSeconds:s?.max_seconds,homepageSales:config.homepageSales===true,idleChecks:config.homepageSales===true || config.simulation===true,name:config.name,businessName:config.businessName,voice:config.voice,avatarUrl,handoffToken,personaSwapEnabled:config.personaSwapEnabled===true,persona:parentPersona?{id:parentPersona.id,displayName:parentPersona.displayName,faceId:parentPersona.faceId}:undefined});
 } catch(e) {console.error('gemini-session',e);return json({error:'Could not authorize the voice session'},500);}
});