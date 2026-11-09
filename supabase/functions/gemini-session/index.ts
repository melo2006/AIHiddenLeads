import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { DEFAULT_AGENT, VOICES, openingFor, businessDemoConfig, SIMULATION_GREETING_LEGACY_SLIM } from '../_shared/voice-config.ts';
import { DEFAULT_LIVE_MODEL, officialLivePricing } from '../_shared/live-models.ts';
import { voiceQuotaClass, voiceLimitResponse } from '../_shared/voice-session-limit.ts';
import { transferDestination } from '../_shared/browser-handoff.ts';
import { transcriptAllowed } from '../_shared/transcript-consent.ts';
import { workspaceAccess } from '../_shared/customer-payments.ts';
import { resolveDemoShare } from '../_shared/demo-share.ts';
import { DEMO_INVITE_GREETING, DEMO_INVITE_GREETING_LEGACY_SLIM, DEMO_INVITE_GREETING_VARIANTS, DEMO_INVITE_OPENING, DEMO_VERIFICATION_ACT1, DEMO_VERIFICATION_GREETING } from '../_shared/demo-sales.ts';
import { alexGuideConfig, alexDemoGuestConfig } from '../_shared/alex-guide.ts';
import { avatarSwapEnabled, teamIntroEnabled, personaFor, personaSegmentPrompt } from '../_shared/personas.ts';
import { TEAM_INTRO_TEACHING, isIntroBoundary, teamIntroGreetingFor } from '../_shared/team-intro.ts';
import { PUBLIC_PATHS } from '../_shared/report-context.ts';
import { normalizeUiLocale, startingLanguageForUiLocale } from '../_shared/conversation-language.ts';
const personaSegmentSchema=z.object({persona:z.enum(['aspen','sara','alex']),boundary:z.enum(['doorway','stepout','meet-alex','return','intro-sara','intro-return-1','intro-alex','intro-return-2']),parentSessionId:z.string().uuid(),swapRecap:z.string().max(2400),drops:z.number().int().min(0).max(99).default(0),dropRecovery:z.boolean().default(false),manualResume:z.boolean().default(false),swap:z.boolean().default(false),teamIntroSeen:z.boolean().default(false)});
const schema=z.object({ visitorKey:z.string().min(16).max(100), model:z.string().max(100).optional(), agentId:z.string().uuid().optional(), leadId:z.string().uuid().optional(), prospectId:z.string().uuid().optional(), draft:z.boolean().default(false), preview:z.boolean().default(false), voice:z.enum(VOICES as [string,...string[]]).optional(), hour:z.number().int().min(0).max(23).optional(), visitorName:z.string().max(100).default(''), timeZone:z.string().max(100).default('UTC'), locale:z.string().max(10).optional(), campaign:z.object({visitId:z.string().uuid(),source:z.string().max(100),campaign:z.string().max(100),entryPath:z.enum(PUBLIC_PATHS).optional()}).nullable().optional(), consent:z.boolean().default(false), verification:z.enum(['pending','verified']).optional(), invite:z.boolean().optional(), guide:z.enum(['alex']).optional(), share:z.string().max(100).optional(), resumeContext:z.string().max(1600).optional(), reconnect:z.boolean().default(false), prewarm:z.boolean().default(false), personaSegment:personaSegmentSchema.optional() });
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
  // Team intro sub-flag: TEAM_INTRO_ENABLED under the master flag (both in
  // personas.ts). The /demo parent stamp is applied in the homepage branch
  // below; intro segment requests are refused unless the parent carries it.
  const teamIntroOn=teamIntroEnabled((n)=>Deno.env.get(n));
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
    // signed-in only. Two disjoint parent classes, cross-family refused:
    // simulation boundaries require a business-demo parent
    // (config.simulation === true); intro boundaries require a homepage
    // parent stamped teamIntroEnabled (the /demo explainer — design
    // team-intro-design-2026-11-09.md §4.2).
    if(!swapEnabled) return json({error:'Persona segments are not enabled'},404);
    const visitorHash=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:parentRow}=await db.from('gemini_voice_sessions').select('id,config,lead_id,prospect_id,agent_id,organization_id').eq('id',b.personaSegment.parentSessionId).eq('visitor_hash',visitorHash).maybeSingle();
    var parentRowRef = parentRow;
    const parent=parentRow?.config as Record<string,unknown>|undefined;
    const introRequest=isIntroBoundary(b.personaSegment.boundary);
    const introParentOk=!!parent && parent.teamIntroEnabled===true && parent.homepageSales===true && parent.simulation!==true;
    if(!parentRow || !parent || (introRequest ? !introParentOk : parent.simulation!==true)) return json({error:'Persona segment parent session not found'},404);
    const persona=personaFor(b.personaSegment.persona);
    const businessName=String(parent.businessName || '');
    if(introRequest) {
      // TEAM INTRO SEGMENT: the prompt pack lives in team-intro.ts via
      // personaSegmentPrompt's intro branch. The segment inherits the
      // parent's reference knowledge (read as data by the cameo/host
      // rules), visitor contact, campaign and recording settings — and
      // NEVER any tenant business material: this parent has none (its
      // sourceKnowledge slot stays empty by construction).
      const builtIntro=personaSegmentPrompt(b.personaSegment.persona,b.personaSegment.boundary,businessName,String(parent.systemPrompt || ''),undefined,false,{parentPrompt:String(parent.systemPrompt || '')});
      config={
        ...parent,
        name:persona.displayName,
        voice:persona.voiceName,
        systemPrompt:builtIntro.systemPrompt,
        greeting:builtIntro.greeting || parent.greeting,
        knowledge:parent.knowledge ?? '',
        sourceKnowledge:'',
        simulation:false,
        platformFollowup:false,
        platformGuide:false,
        homepageSales:false,
        teamIntroEnabled:true,
        teamIntroSegment:true,
        personaSwapEnabled:true,
        persona:{id:persona.id,displayName:persona.displayName,faceId:persona.faceId},
        ...(b.personaSegment.swap?{personaSwap:{to:persona.id,boundary:b.personaSegment.boundary},personaDrop:null,personaResume:null}:b.personaSegment.manualResume?{personaSwap:null,personaDrop:null,personaResume:{persona:persona.id}}:{personaSwap:null,personaDrop:{persona:persona.id,drops:b.personaSegment.drops},personaResume:null}),
        personaSegment:{persona:persona.id,boundary:b.personaSegment.boundary,parentSessionId:parentRow.id,dropRecovery:b.personaSegment.dropRecovery,manualResume:b.personaSegment.manualResume},
        recordTranscript:parent.recordTranscript===true,
        recordAudio:parent.recordAudio===true,
        resumeContext:b.personaSegment.swapRecap,
      };
      agentId=parentRow.agent_id; orgId=parentRow.organization_id; segmentParentId=parentRow.id;
    } else {
    // §5.1 callback signal: the demo parent carries teamIntroSeen ONLY
    // from a stamped explainer session of the SAME visitor (verified
    // above by row id + visitor hash — never from the request body
    // alone; see the lookup right after the segment branch).
    const built=personaSegmentPrompt(b.personaSegment.persona,b.personaSegment.boundary,businessName,String(parent.systemPrompt || ''),b.personaSegment.persona==='alex'?alexDemoGuestConfig(businessName):undefined,parent.teamIntroSeen===true);
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
      ...(b.personaSegment.swap?{personaSwap:{to:persona.id,boundary:b.personaSegment.boundary},personaDrop:null,personaResume:null}:b.personaSegment.manualResume?{personaSwap:null,personaDrop:null,personaResume:{persona:persona.id}}:{personaSwap:null,personaDrop:{persona:persona.id,drops:b.personaSegment.drops},personaResume:null}),
      personaSegment:{persona:persona.id,boundary:b.personaSegment.boundary,parentSessionId:parentRow.id,dropRecovery:b.personaSegment.dropRecovery,manualResume:b.personaSegment.manualResume},
      // Consent/recording inheritance (spec Q8): the segment records
      // exactly what the parent recorded — the flags are recomputed from
      // the parent's stored values in the final assembly below, never
      // from this request's consent field.
      recordTranscript:parent.recordTranscript===true,
      recordAudio:parent.recordAudio===true,
      resumeContext:b.personaSegment.swapRecap,
    };
    agentId=parentRow.agent_id; orgId=parentRow.organization_id; segmentParentId=parentRow.id;
    }
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
    if(b.verification==='pending') { config.greeting=DEMO_VERIFICATION_GREETING; config.greetings=[]; config.systemPrompt=`${DEMO_VERIFICATION_ACT1}\n\n${String(config.systemPrompt)}`; config.verificationGate=true; }
    // Invite arrivals (cold-email personal link): the host phase replaces
    // the code gate. Honored ONLY when the demo-invite resolve stamped the
    // lead's arrival server-side — a client flag alone never earns it.
    else if(b.invite===true && leadInviteArrivedAt) { config.greeting=DEMO_INVITE_GREETING; config.greetings=DEMO_INVITE_GREETING_VARIANTS; config.systemPrompt=`${DEMO_INVITE_OPENING}\n\n${String(config.systemPrompt)}`; config.inviteArrival=true; }
    // DEMO-SITE OPENING GATING (owner revision, 2026-11-09 — replaces
    // the brief assembly-time intro beat): businessDemoConfig and the
    // invite branch above serve the NEW demo-site opening (personalized
    // welcome → partner pitch with a rotated statistic → Alex comfort
    // line → Sara introduction; Sara owns the spoken disclaimer at the
    // simulation entry). That opening promises a Sara handoff, which
    // only the SWAP family can keep — so it is served whenever the swap
    // family is armed (swapEnabled), independent of the team-intro
    // sub-flag: TEAM_INTRO_ENABLED gates ONLY the /demo explainer cameo
    // chain, never this business-demo opening (hardening, 2026-11-09:
    // with TEAM_INTRO_ENABLED alone off, every business demo silently
    // ran solo on the legacy greeting — no Sara, no Alex, no error).
    // With the swap family OFF the demo-site opening falls back to
    // tonight's live greeting shapes (byte-identical legacy) and the
    // rotation array is cleared. The verification-pending greeting is
    // never touched here: the code gate owns that opening in both
    // worlds (and its greetings array was already cleared above so
    // openingFor cannot serve a pitch variant into Act 1).
    if(!swapEnabled && b.verification!=='pending') {
      config.greetings=[];
      config.greeting=(b.invite===true && leadInviteArrivedAt) ? DEMO_INVITE_GREETING_LEGACY_SLIM : SIMULATION_GREETING_LEGACY_SLIM;
    }
  } else {
    let query=db.from('voice_agents').select('*'); query=b.agentId?query.eq('id',b.agentId):query.eq('slug','aspen-homepage');
    const {data:agent}=await query.maybeSingle(); if(!agent?.published) return json({error:'Voice agent is not published yet'},409);
    if(!(await workspaceAccess(db,agent.organization_id))) return json({error:'This assistant subscription is not active'},403);
    config={...(agent.published as Record<string,unknown>), homepageSales:agent.slug==='aspen-homepage'}; agentId=agent.id; orgId=agent.organization_id;
    // TEAM INTRO PARENT STAMP (design §4.2/§7): the homepage agent's
    // explainer session earns the team-intro parent class ONLY when both
    // flags are on AND the request's page context is the demo page —
    // server-derived from the campaign entryPath ('/demo' is a member of
    // PUBLIC_PATHS); the client flag alone never earns it (same trust
    // pattern as the invite flag above). The homepage (entryPath '/'),
    // agentId-addressed tenants, drafts and shares never carry the stamp.
    // Stamping switches the served greeting to the name-ask-deferred
    // variant (greeting AND every greetings[] rotation) and appends the
    // cameo teaching block to the sales prompt; with the flags off this
    // whole block is skipped and the config is byte-identical to today.
    if(teamIntroOn && !b.agentId && agent.slug==='aspen-homepage' && b.campaign?.entryPath==='/demo') {
      config.teamIntroEnabled=true;
      config.systemPrompt=`${String(config.systemPrompt || '')}\n${TEAM_INTRO_TEACHING}`;
      config.greeting=teamIntroGreetingFor(String(config.greeting || ''));
      if(Array.isArray(config.greetings)) config.greetings=(config.greetings as unknown[]).map(g=>teamIntroGreetingFor(String(g || '')));
    }
  }
  const requestedModel = b.model;
  // TEAM INTRO callbacks (§5.1): a business-demo parent authorization
  // inherits teamIntroSeen from a stamped explainer session belonging
  // to THIS visitor (the /demo visit that ran the show earlier in the
  // same page journey — the client carries only the claim in its recap
  // facts; the fact itself is verified here against the stored
  // explainer config, stamped server-side at its own authorization).
  if(!b.personaSegment && (b.leadId || b.prospectId) && b.resumeContext?.includes('teamIntroSeen')) {
    const visitorHashForFacts=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:explainerRow}=await db.from('gemini_voice_sessions').select('config').eq('visitor_hash',visitorHashForFacts).filter('config->>teamIntroEnabled','eq','true').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(explainerRow && (explainerRow.config as Record<string,unknown>)?.teamIntroSeen===true) config.teamIntroSeen=true;
  }
  if (!b.personaSegment && !b.preview && !b.consent && !b.prewarm) return json({error:'Agree to the recording notice before starting.'},400);
  if(requestedModel && (b.share || !(b.draft || b.preview) || !officialLivePricing(requestedModel))) return json({error:'Model comparison is available only for authorized draft tests and previews.'},400);
  // Avatar swap (Stage 1): the parent demo authorization carries the flag
  // so the client starts the swap state machine only when the server says
  // so. Segment configs already carry personaSwapEnabled:true from their
  // branch; every other session shape is untouched when the flag is off.
  if(!b.personaSegment && swapEnabled && (b.leadId || b.prospectId) && !b.draft && !b.preview) config.personaSwapEnabled=true;
  // Website UI locale → authorized starting language (Ron, 2026-11-09).
  // The client sends ONLY the visitor's explicit site-language selection;
  // it is validated here against the supported set (en / es / pt-BR) and
  // anything else is ignored — never browser detection. Persona segments
  // skip this: they inherit uiLocale/startLanguage from the parent's
  // stored config via the segment branch's spread. Phone/telephony
  // sessions never pass through this function, so they never carry a
  // locale and keep the English start.
  const uiLocale = b.personaSegment ? null : normalizeUiLocale(b.locale);
  config={...config,timeZone:b.timeZone,...(uiLocale ? {uiLocale, startLanguage: startingLanguageForUiLocale(uiLocale)} : {}),quotaClass:segmentParentId?'persona_segment':b.share?'visitor':voiceQuotaClass(role?.role==='admin',b.preview),model:requestedModel || DEFAULT_LIVE_MODEL,opening:openingFor(config,b.hour,b.visitorName || String((config.visitorContact as Record<string,unknown>|undefined)?.name || '')),preview:b.preview,resumeContext:b.preview?undefined:(segmentParentId?String(config.resumeContext || ''):b.resumeContext),reconnect:segmentParentId?false:!b.preview&&b.reconnect,campaign:b.campaign || (segmentParentId?(config.campaign ?? null):null),recordTranscript:segmentParentId?config.recordTranscript===true:!b.preview && transcriptAllowed(false,false,b.consent),recordAudio:segmentParentId?config.recordAudio===true:!b.preview && b.consent};
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
  // TEAM INTRO SEEN STAMP: the FIRST intro segment authorization against
  // a stamped explainer parent records, on the PARENT's stored config,
  // that this visitor saw the show. The /demo-site demo parent reads it
  // back through the verified facts channel above (same visitor hash),
  // which is what makes the §5.1 doorway/close callbacks provable
  // server-side instead of trusting the client. Fire-and-forget: a
  // failed stamp loses only the callback clause, never the session.
  if(segmentParentId && parentRowRef && isIntroBoundary(b.personaSegment!.boundary)) {
    const parentConfig=(parentRowRef as {config?:Record<string,unknown>}).config;
    if(parentConfig && parentConfig.teamIntroEnabled===true && parentConfig.teamIntroSeen!==true) {
      void db.from('gemini_voice_sessions').update({config:{...parentConfig,teamIntroSeen:true}}).eq('id',segmentParentId).then(()=>{},()=>{});
    }
  }
  return json({token,sessionId:id,maxSeconds:s?.max_seconds,homepageSales:config.homepageSales===true,idleChecks:config.homepageSales===true || config.simulation===true,name:config.name,businessName:config.businessName,voice:config.voice,avatarUrl,handoffToken,startLanguage:typeof config.startLanguage==='string'?config.startLanguage:undefined,personaSwapEnabled:config.personaSwapEnabled===true,teamIntroEnabled:config.teamIntroEnabled===true,persona:parentPersona?{id:parentPersona.id,displayName:parentPersona.displayName,faceId:parentPersona.faceId}:undefined});
 } catch(e) {console.error('gemini-session',e);return json({error:'Could not authorize the voice session'},500);}
});