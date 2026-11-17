import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { DEFAULT_AGENT, VOICES, openingFor, renderOpeningTemplate, businessDemoConfig, businessDemoConfigSwapParent, SIMULATION_GREETING_LEGACY_SLIM, hourInTimeZone, sanitizeVisitorName, segmentTimeZone } from '../_shared/voice-config.ts';
import { DEFAULT_LIVE_MODEL, officialLivePricing } from '../_shared/live-models.ts';
import { voiceQuotaClass, voiceLimitResponse } from '../_shared/voice-session-limit.ts';
import { transferDestination } from '../_shared/browser-handoff.ts';
import { transcriptAllowed } from '../_shared/transcript-consent.ts';
import { workspaceAccess } from '../_shared/customer-payments.ts';
import { resolveDemoShare } from '../_shared/demo-share.ts';
import { DEMO_INVITE_GREETING, DEMO_INVITE_GREETING_LEGACY_SLIM, DEMO_INVITE_GREETING_VARIANTS, DEMO_INVITE_OPENING, DEMO_INVITE_OPENING_SWAP, DEMO_VERIFICATION_ACT1, DEMO_VERIFICATION_GREETING } from '../_shared/demo-sales.ts';
import { alexGuideConfig, alexDemoGuestConfig } from '../_shared/alex-guide.ts';
import { avatarSwapEnabled, teamIntroEnabled, isPresenterPersona, personaFor, personaSegmentPrompt, presenterAlexGuestPrompt, presenterSimulationPrompt, type PersonaId } from '../_shared/personas.ts';
import { fetchPersonaVoiceOverride, resolvePersonaVoice } from '../_shared/persona-voice-overrides.ts';
import { examplePresenterForSlug } from '../_shared/realtor-example-pinned-leads.ts';
import { TEAM_INTRO_TEACHING, isIntroBoundary, teamIntroGreetingFor } from '../_shared/team-intro.ts';
import { realtorLandingApplies, stampHomepageSales, stampRealtorLanding } from '../_shared/homepage-knowledge.ts';
import { buildExampleListingsLayer, examplePackBySlug, examplePackForSiteUrl, stampExampleListings } from '../_shared/realtor-example-listings.ts';
import { PUBLIC_PATHS } from '../_shared/report-context.ts';
import { normalizeUiLocale, resolveDemoStartLocale, startingLanguageForUiLocale, type UiLocale } from '../_shared/conversation-language.ts';
import { voiceForLocaleSession } from '../_shared/locale-voices.ts';
import { buildTranscriptRecap } from '../_shared/recap-builder.ts';
import { capturedContactFromConfig, type CapturedContact } from '../_shared/captured-contact.ts';
import { composeSessionKnowledge } from '../_shared/kb-distill.ts';
const personaSegmentSchema=z.object({persona:z.enum(['aspen','sara','alex','frank','latina','black-professional-lady','james','diego']),boundary:z.enum(['doorway','stepout','meet-alex','return','summon-aspen','intro-sara','intro-return-1','intro-alex','intro-return-2']),parentSessionId:z.string().uuid(),swapRecap:z.string().max(8000),drops:z.number().int().min(0).max(99).default(0),dropRecovery:z.boolean().default(false),manualResume:z.boolean().default(false),swap:z.boolean().default(false),teamIntroSeen:z.boolean().default(false)});
// SWAP DIAG (voice-first batch, 2026-11-10): the client posts a doorway
// attempt's RESOLUTION (gate-abort, fallback, forced-execute,
// voice-first cut-over, face takeover, watchdog action…) against the
// attempt's OWN session row id; the handler below appends it to that
// row's config.personaSwapDiag and stamps last_error on failure-class
// resolutions of never-consumed rows. Before this, attempt outcomes
// existed only in the page (a 100-entry ring buffer that died with
// it) or as prose inside a successor's resumeContext — the final
// attempt of a boundary left no server record at all (retest #4).
const swapDiagSchema=z.object({sessionId:z.string().uuid(),event:z.enum(['gate-abort','fallback','retry-scheduled','token-stale','stage-watchdog','forced-execute','cutover','voice-first-cutover','face-takeover','face-attach-failed']),boundary:z.enum(['doorway','stepout','meet-alex','return','summon-aspen','intro-sara','intro-return-1','intro-alex','intro-return-2']),persona:z.enum(['aspen','sara','alex','frank','latina','black-professional-lady','james','diego']).optional(),attempt:z.number().int().min(0).max(99).optional(),reason:z.string().max(200).optional(),faceState:z.string().max(100).optional(),at:z.number().optional()});
const SWAP_DIAG_FAILURE_EVENTS: ReadonlySet<string> = new Set(['gate-abort','fallback','token-stale']);
const playoutDiagSchema=z.object({sessionId:z.string().uuid(),path:z.enum(['local','tap','direct','none']),detail:z.string().max(400),at:z.number().optional()});
// MIC DIAG (mic zero-input guard, 2026-11-14): the INPUT mirror of
// playoutDiag — the client stamps the microphone path's state
// (permission, track state, first-flow timing, total input, whether
// the zero-input watchdog fired) so a dead-mic session explains
// itself from the record. Same channel, same ownership, same shape.
const micDiagSchema=z.object({sessionId:z.string().uuid(),detail:z.string().max(400),at:z.number().optional()});
// HANDOFF DIAG (handoff-leg recovery, 2026-11-14): the client stamps
// the browser-handoff leg's lifecycle (announced, leg started, leg
// outcome, return started / return failed, mic state on return) so
// whether the manager's phone rang, connected, or the return even
// started is readable from the record — tonight's failed returns
// left no handoff trace at all. Same channel, same ownership, same
// shape as micDiag; sessions with no handoff never stamp.
const handoffDiagSchema=z.object({sessionId:z.string().uuid(),detail:z.string().max(400),at:z.number().optional()});
// STARTUP DIAG (playout startup guard, chat-fix3 2026-11-16): the
// client stamps the playout STARTUP window (engine selected + why,
// context state and terminal element state at first audio, whether
// the terminal clock advanced within 2s, and the blocked/healed
// verdicts) so a session where Aspen spoke but the visitor heard
// nothing — b21b5884: 32s of server-side speech, zero heard —
// explains itself from the record. Same channel, same ownership,
// same shape as micDiag; sessions whose startup was never watched
// (previews) simply never stamp.
const startupDiagSchema=z.object({sessionId:z.string().uuid(),detail:z.string().max(400),at:z.number().optional()});
const schema=z.object({ visitorKey:z.string().min(16).max(100), model:z.string().max(100).optional(), agentId:z.string().uuid().optional(), leadId:z.string().uuid().optional(), prospectId:z.string().uuid().optional(), draft:z.boolean().default(false), preview:z.boolean().default(false), voice:z.enum(VOICES as [string,...string[]]).optional(), hour:z.number().int().min(0).max(23).optional(), visitorName:z.string().max(100).default(''), timeZone:z.string().max(100).default('UTC'), locale:z.string().max(10).optional(), campaign:z.object({visitId:z.string().uuid(),source:z.string().max(100),campaign:z.string().max(100),entryPath:z.enum(PUBLIC_PATHS).optional()}).nullable().optional(), consent:z.boolean().default(false), verification:z.enum(['pending','verified']).optional(), invite:z.boolean().optional(), sample:z.boolean().optional(), guide:z.enum(['alex']).optional(), share:z.string().max(100).optional(), resumeContext:z.string().max(16000).optional(), reconnect:z.boolean().default(false), prewarm:z.boolean().default(false), personaSegment:personaSegmentSchema.optional(), swapDiag:swapDiagSchema.optional(), playoutDiag:playoutDiagSchema.optional(), micDiag:micDiagSchema.optional(), handoffDiag:handoffDiagSchema.optional(), startupDiag:startupDiagSchema.optional() });
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
  // SWAP DIAG WRITE (voice-first batch): a doorway attempt's resolution
  // lands on the attempt's OWN session row — never an authorization, so
  // it is handled before every session-issuing branch. Ownership is the
  // same visitor-hash proof the segment branch uses: the row must
  // belong to this visitor. The entry is APPENDED to
  // config.personaSwapDiag (bounded — the last 30 resolutions) so a
  // post-mortem is one SELECT, and failure-class resolutions
  // (SWAP_DIAG_FAILURE_EVENTS) additionally stamp last_error on a row
  // that was never consumed (started_at NULL) and carries none — the
  // proxy owns last_error for consumed sessions and is never
  // overwritten. Best-effort by design: the client fires and forgets,
  // and a failed stamp loses only the trace, never the call.
  if(b.swapDiag) {
    const diagVisitor=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:diagRow}=await db.from('gemini_voice_sessions').select('id,config,visitor_hash,started_at,last_error').eq('id',b.swapDiag.sessionId).maybeSingle();
    if(!diagRow || diagRow.visitor_hash!==diagVisitor) return json({error:'Session not found'},404);
    const diagConfig=(diagRow.config ?? {}) as Record<string,unknown>;
    const priorDiag=Array.isArray(diagConfig.personaSwapDiag) ? diagConfig.personaSwapDiag : [];
    const diagEntry={event:b.swapDiag.event,boundary:b.swapDiag.boundary,...(b.swapDiag.persona?{persona:b.swapDiag.persona}:{}),...(b.swapDiag.attempt!==undefined?{attempt:b.swapDiag.attempt}:{}),...(b.swapDiag.reason?{reason:b.swapDiag.reason}:{}),...(b.swapDiag.faceState?{faceState:b.swapDiag.faceState}:{}),at:b.swapDiag.at ?? Date.now()};
    await db.from('gemini_voice_sessions').update({config:{...diagConfig,personaSwapDiag:[...priorDiag,diagEntry].slice(-30)}}).eq('id',diagRow.id);
    if(SWAP_DIAG_FAILURE_EVENTS.has(b.swapDiag.event) && !diagRow.started_at && !diagRow.last_error) {
      await db.from('gemini_voice_sessions').update({last_error:{reason:'client_swap_failure',detail:`${b.swapDiag.event}${b.swapDiag.reason?`: ${b.swapDiag.reason}`:''} (attempt ${b.swapDiag.attempt ?? '?'})`}}).eq('id',diagRow.id).is('last_error',null);
    }
    return json({ok:true});
  }
  // Playout telemetry (volume-stream fix, 2026-11-14): the client
  // snapshots the paired audio graph at settle points (which path was
  // audible, whether the media tap engaged and if not which gate
  // refused it, whether Simli's returned audio was unsubscribed).
  // Appended to the PARENT session row at config.playoutDiag
  // (bounded — the last 30), same visitor-hash ownership as swapDiag,
  // so a phone test is read from the record instead of guessed.
  // Best-effort: a failed stamp loses only the trace, never the call.
  if(b.playoutDiag) {
    const playoutVisitor=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:playoutRow}=await db.from('gemini_voice_sessions').select('id,config,visitor_hash').eq('id',b.playoutDiag.sessionId).maybeSingle();
    if(!playoutRow || playoutRow.visitor_hash!==playoutVisitor) return json({error:'Session not found'},404);
    const playoutConfig=(playoutRow.config ?? {}) as Record<string,unknown>;
    const priorPlayout=Array.isArray(playoutConfig.playoutDiag) ? playoutConfig.playoutDiag : [];
    const playoutEntry={path:b.playoutDiag.path,detail:b.playoutDiag.detail,at:b.playoutDiag.at ?? Date.now()};
    await db.from('gemini_voice_sessions').update({config:{...playoutConfig,playoutDiag:[...priorPlayout,playoutEntry].slice(-30)}}).eq('id',playoutRow.id);
    return json({ok:true});
  }
  // Mic telemetry (mic zero-input guard, 2026-11-14): appended to
  // the PARENT session row at config.micDiag (bounded — the last
  // 30), same visitor-hash ownership as playoutDiag. Best-effort:
  // a failed stamp loses only the trace, never the call.
  if(b.micDiag) {
    const micVisitor=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:micRow}=await db.from('gemini_voice_sessions').select('id,config,visitor_hash').eq('id',b.micDiag.sessionId).maybeSingle();
    if(!micRow || micRow.visitor_hash!==micVisitor) return json({error:'Session not found'},404);
    const micConfig=(micRow.config ?? {}) as Record<string,unknown>;
    const priorMic=Array.isArray(micConfig.micDiag) ? micConfig.micDiag : [];
    const micEntry={detail:b.micDiag.detail,at:b.micDiag.at ?? Date.now()};
    await db.from('gemini_voice_sessions').update({config:{...micConfig,micDiag:[...priorMic,micEntry].slice(-30)}}).eq('id',micRow.id);
    return json({ok:true});
  }
  // Handoff telemetry (handoff-leg recovery, 2026-11-14): appended
  // to the session row at config.handoffDiag (bounded — the last
  // 30), same visitor-hash ownership as micDiag. Best-effort: a
  // failed stamp loses only the trace, never the call.
  if(b.handoffDiag) {
    const handoffVisitor=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:handoffRow}=await db.from('gemini_voice_sessions').select('id,config,visitor_hash').eq('id',b.handoffDiag.sessionId).maybeSingle();
    if(!handoffRow || handoffRow.visitor_hash!==handoffVisitor) return json({error:'Session not found'},404);
    const handoffConfig=(handoffRow.config ?? {}) as Record<string,unknown>;
    const priorHandoff=Array.isArray(handoffConfig.handoffDiag) ? handoffConfig.handoffDiag : [];
    const handoffEntry={detail:b.handoffDiag.detail,at:b.handoffDiag.at ?? Date.now()};
    await db.from('gemini_voice_sessions').update({config:{...handoffConfig,handoffDiag:[...priorHandoff,handoffEntry].slice(-30)}}).eq('id',handoffRow.id);
    return json({ok:true});
  }
  // Playout startup telemetry (chat-fix3, 2026-11-16): appended to
  // the session row at config.startupDiag (bounded — the last 30),
  // same visitor-hash ownership as micDiag. Best-effort: a failed
  // stamp loses only the trace, never the call.
  if(b.startupDiag) {
    const startupVisitor=await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
    const {data:startupRow}=await db.from('gemini_voice_sessions').select('id,config,visitor_hash').eq('id',b.startupDiag.sessionId).maybeSingle();
    if(!startupRow || startupRow.visitor_hash!==startupVisitor) return json({error:'Session not found'},404);
    const startupConfig=(startupRow.config ?? {}) as Record<string,unknown>;
    const priorStartup=Array.isArray(startupConfig.startupDiag) ? startupConfig.startupDiag : [];
    const startupEntry={detail:b.startupDiag.detail,at:b.startupDiag.at ?? Date.now()};
    await db.from('gemini_voice_sessions').update({config:{...startupConfig,startupDiag:[...priorStartup,startupEntry].slice(-30)}}).eq('id',startupRow.id);
    return json({ok:true});
  }
  const bearer=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'') || '';
  const {data:{user}}=await db.auth.getUser(bearer);
  const {data:role}=user ? await db.from('voice_platform_roles').select('role').eq('user_id',user.id).maybeSingle() : {data:null};
  let config:Record<string,unknown>, agentId=null, orgId=null;
  // ELEVENLABS LIVE VOICE stamp (2026-11-17): when the agent row holds a
  // READY cloned voice (voice_agents.cloned_voice_id — created in the
  // panel or imported from the ElevenLabs library; same column either
  // way) AND the config being authorized carries the per-agent toggle
  // elevenLabsLiveVoice === true, stamp the voice id into the session
  // config. The Live proxy reads ONLY this stamp: with it, Gemini still
  // listens/thinks but ElevenLabs speaks; without it the session is
  // byte-identical to before. Default is Gemini — the toggle ships off,
  // and a config that never heard of it stamps nothing.
  const stampElevenLabsVoice=(target:Record<string,unknown>,agentRow:Record<string,unknown>|null|undefined)=>{
    const id=typeof agentRow?.cloned_voice_id==='string'?agentRow.cloned_voice_id:'';
    const status=typeof agentRow?.cloned_voice_status==='string'?agentRow.cloned_voice_status:'';
    if(id && status==='ready' && target.elevenLabsLiveVoice===true) target.elevenLabsVoiceId=id;
    else delete target.elevenLabsVoiceId;
  };
  // Avatar-swap master flag (Stage 1 lands dark): server env, same pattern
  // as DEMO_VERIFICATION_SMS_ENABLED. Read once per request; the parent
  // demo authorization below stamps it into the session config + response.
  const swapEnabled=avatarSwapEnabled((n)=>Deno.env.get(n));
  // Team intro sub-flag: TEAM_INTRO_ENABLED under the master flag (both in
  // personas.ts). The /demo parent stamp is applied in the homepage branch
  // below; intro segment requests are refused unless the parent carries it.
  const teamIntroOn=teamIntroEnabled((n)=>Deno.env.get(n));
  let segmentParentId: string | null = null;
  // DETECTED SITE LOCALE (Publish #66): set by the lead/prospect branch
  // when the demo's own website language (leads.website_language, written
  // by scan-website) supplies the session start because the visitor made
  // NO explicit language-switch pick. The final assembly stamps it as the
  // session uiLocale with languageSource 'detected'; an explicit pick
  // always outranks it (resolveDemoStartLocale).
  let detectedSiteLocale: UiLocale | null = null;
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
    // PRESENTER SEGMENT GATE (presenter-owns-close, 2026-11-14): a
    // presenter parent (its config carries the demoPresenter stamp)
    // serves EXACTLY two segment shapes — Alex's meet-alex cameo and
    // the presenter's own re-entry (Alex's hand-back 'return', plus
    // 'stepout' for drop/stash re-entry into the close). Every other
    // request under it is refused, so no client state can ever arm
    // an Aspen or Sara segment on a presenter demo: the Aspen
    // handoff Ron removed from the presenter script has no server
    // side either. Symmetrically, a presenter persona is refused
    // under any parent that is not its own presenter parent. (The
    // segment schema's persona enum now admits the presenter ids —
    // before this, the client's presenter return request failed
    // validation outright and Alex's hand-back could never land.)
    const parentPresenter=parent.demoPresenter==='frank' || parent.demoPresenter==='latina' || parent.demoPresenter==='black-professional-lady' || parent.demoPresenter==='james' || parent.demoPresenter==='diego' ? parent.demoPresenter : null;
    const segPersona=b.personaSegment.persona; const segBoundary=b.personaSegment.boundary;
    if(isPresenterPersona(segPersona) && parentPresenter!==segPersona) return json({error:'Persona segment not available for this demo'},404);
    if(parentPresenter && !((segPersona==='alex' && segBoundary==='meet-alex') || (segPersona===parentPresenter && (segBoundary==='return' || segBoundary==='stepout')))) return json({error:'Persona segment not available for this demo'},404);
    const persona=personaFor(b.personaSegment.persona);
    // ADMIN VOICE OVERRIDE (2026-11-14): a persona_voice_overrides row
    // (admin Demo Voices tab) wins over the registry voice for segment
    // sessions too; no row / any read problem → persona.voiceName,
    // byte-identical to before. Fail-safe inside the resolver.
    const segVoiceResolved=(await resolvePersonaVoice(db, persona.id)).voice;
    // SEGMENT LOCALE VOICE (Publish #66): a segment inherits the parent's
    // session language (its stamped uiLocale — explicit pick or detected
    // site language); a non-English parent means the segment persona also
    // speaks with its voice from that language's curated set.
    const segParentLocale=normalizeUiLocale(parent.uiLocale);
    const segVoice=segParentLocale && segParentLocale!=='en' ? voiceForLocaleSession(segVoiceResolved, persona.id, segParentLocale) : segVoiceResolved;
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
        voice:segVoice,
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
    // EXAMPLE LISTINGS → SARA (Scalone batch Item 1 — forensics F4):
    // a sample parent's stamped exampleListings marker names the pack
    // (server-stored at the parent's own authorization — never a
    // client-supplied value in this request). Rebuild the layer from
    // it and hand it to the SARA build only: her segment prompt is
    // built fresh in personas.ts and otherwise discards the layer the
    // parent stamp appended to Aspen's prompt, which is exactly how
    // the listings demos broke on the Sara leg. Aspen/Alex builds
    // never receive it; a parent without the marker passes nothing
    // and its segment builds stay byte-identical.
    const examplePack=b.personaSegment.persona==='sara'?examplePackBySlug((parent.exampleListings as {slug?:unknown}|undefined)?.slug):null;
    // PRESENTER PARENT (Alex handoff fix, 2026-11-14): when the parent
    // is a whole-demo presenter (its config carries the demoPresenter
    // stamp from its own authorization), Alex's guest prompt names
    // the PRESENTER as his host — his hand-back line brings HER/HIM
    // back, and the client's presenter matcher arms the return on
    // that phrase. Aspen parents pass undefined and keep the stock
    // guest prompt byte-identical.
    const built=personaSegmentPrompt(b.personaSegment.persona,b.personaSegment.boundary,businessName,String(parent.systemPrompt || ''),b.personaSegment.persona==='alex'?alexDemoGuestConfig(businessName,parent.demoPresenter?presenterAlexGuestPrompt(parent.demoPresenter as PersonaId):undefined):undefined,parent.teamIntroSeen===true,undefined,examplePack?{layer:buildExampleListingsLayer(examplePack)}:undefined);
    config={
      ...parent,
      name:persona.displayName,
      voice:segVoice,
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
    // Platform guide (Alex, the setup-wizard onboarding engineer). He is not a
    // tenant agent, so the workspaceAccess subscription gate does not apply —
    // but a guide session is NEVER anonymous: a signed-in user is required,
    // and the standard visitor quota class below still caps usage. The
    // config carries no transferPhone, so no handoff token is issued.
    if(!user) return json({error:'Sign in to use the setup guide'},401);
    config=alexGuideConfig();
    // ADMIN VOICE OVERRIDE (2026-11-14): Alex is one persona with one
    // voice — an admin override for 'alex' covers his guide sessions
    // as well as his demo segments. Override-only: with no row the
    // guide config stays byte-identical (ALEX_VOICE).
    const guideVoiceOverride=await fetchPersonaVoiceOverride(db,'alex');
    if(guideVoiceOverride) config.voice=guideVoiceOverride;
  } else if(b.share) {
    const agent=await resolveDemoShare(db,b.share); if(!agent) return json({error:'This demo link has expired or was turned off.'},404);
    const {data:sources}=await db.from('voice_agent_sources').select('content').eq('agent_id',agent.id).eq('status','ready');
    config={...(agent.draft as Record<string,unknown>),sourceKnowledge:(sources || []).map(s=>s.content || '').join('\n').slice(0,100000),sharedDemo:true}; agentId=agent.id; orgId=agent.organization_id;
    stampElevenLabsVoice(config, agent as Record<string,unknown>);
  } else if(b.draft || b.preview) {
    if(!user) return json({error:'Sign in to preview voices'},401);
    if(!b.agentId) { if(role?.role!=='admin') return json({error:'Administrator access required'},403); config={...DEFAULT_AGENT}; }
    else {
      const {data:agent}=await db.from('voice_agents').select('*').eq('id',b.agentId).maybeSingle(); if(!agent) return json({error:'Agent not found'},404);
      if(role?.role!=='admin' && !(await workspaceAccess(db,agent.organization_id))) return json({error:'This assistant subscription is not active'},403);
      const {data:member}=await db.from('voice_memberships').select('id').eq('organization_id',agent.organization_id).eq('user_id',user.id).eq('role','editor').maybeSingle(); if(role?.role!=='admin' && !member) return json({error:'Access denied'},403);
      const {data:sources}=await db.from('voice_agent_sources').select('content').eq('agent_id',agent.id).eq('status','ready');
      config={...(agent.draft as Record<string,unknown>),sourceKnowledge:(sources || []).map(s=>s.content || '').join('\n').slice(0,100000)}; agentId=agent.id; orgId=agent.organization_id;
      stampElevenLabsVoice(config, agent as Record<string,unknown>);
    }
    if(b.voice) config.voice=b.voice;
  } else if(b.leadId || b.prospectId) {
    if(b.leadId && b.prospectId) { const {data:p}=await db.from('prospects').select('website_url').eq('id',b.prospectId).maybeSingle(); const {data:l}=await db.from('leads').select('website_url').eq('id',b.leadId).maybeSingle(); if(!p || !l || p.website_url!==l.website_url) return json({error:'Prospect and demo website do not match'},400); }
    let knowledge='', businessName=''; let visitorContact: Record<string,unknown> = {}; let leadInviteArrivedAt: unknown = null; let siteUrl=''; let leadWebsiteLanguage: unknown = null;
    // Publish #74: visitorContact carries the lead's NAME only. The
    // lead row's email/phone are the demo-form submitter's contact
    // (the lead owner's), NOT the current visitor's captured facts —
    // copying them here composed them into every session on the
    // lead, and the #70 verification caught the presenter reciting
    // the owner's own email as the visitor's address "on file".
    // A visitor's on-file facts come only from their own captured-
    // contact store (#68) and their own transcript; the name stays
    // because the greeting/invite personalization addresses the
    // person the demo was made for (and the invite flow asks them
    // to confirm it), never as an asserted captured fact.
    if(b.leadId) { const {data:lead}=await db.from('leads').select('business_name,website_url,website_content,scan_status,full_name,email,phone,invite_arrived_at').eq('id',b.leadId).maybeSingle(); if(!lead || !lead.website_content || !['completed','enriched','scanning'].includes(lead.scan_status) || lead.website_content.length<200) return json({error:'This business demo has not finished learning its website. Please wait for the scan.'},409); knowledge=lead.website_content; businessName=lead.business_name; siteUrl=lead.website_url || ''; visitorContact={name:sanitizeVisitorName(lead.full_name)}; leadInviteArrivedAt=lead.invite_arrived_at; const {data:langRow}=await db.from('leads').select('website_language').eq('id',b.leadId).maybeSingle(); leadWebsiteLanguage=langRow?.website_language ?? null; }
    else { const {data:p}=await db.from('prospects').select('business_name,business_data,ai_analysis,website_url').eq('id',b.prospectId).maybeSingle(); if(!p) return json({error:'Demo business not found'},404); knowledge=JSON.stringify(p.business_data || {}); businessName=p.business_name; siteUrl=p.website_url || ''; if(knowledge.length<20) return json({error:'Prepare this prospect website demo before starting a call.'},409); }
    // KB SLIM (Publish #85b): behind KB_SLIM_BRIEF_ENABLED, the
    // session prompt carries a distilled brief of the stored KB
    // instead of the raw page dumps, and the full text rides in the
    // config (outside the prompt) for the proxy's
    // lookup_business_detail tool. Flag off → sessionKnowledge IS
    // knowledge and no config keys are added below, so the composed
    // config stays byte-identical to pre-#85b.
    const kbSlim=composeSessionKnowledge(knowledge,(n)=>Deno.env.get(n));
    const {data:aspen}=await db.from('voice_agents').select('published').eq('slug','aspen-homepage').maybeSingle();
    const published=aspen?.published as Record<string,unknown>|undefined;
    // EXAMPLE PRESENTER (Frank batch, 2026-11-13): a marked sample
    // whose stored site URL matches an example WITH a presenter in
    // the server-known map (realtor-example-pinned-leads.ts) is
    // fronted SOLO by that persona — the presenter greets AND runs
    // the simulation in one session, so the parent is composed from
    // the LEGACY whole-demo config bound to the presenter (name,
    // voice, presenter-rewritten prompt) instead of the swap-parent
    // host composition. The presenter fronts the DEMO solo — no Sara
    // segment ever arms on a presenter demo — but since the Alex
    // handoff fix (2026-11-14) the parent DOES earn the swap stamp
    // (lead path only; see the stamp below): the client runs the
    // presenter chain, whose only boundaries are the close's MEET
    // ALEX cameo and Alex's hand-back to the presenter. The flag alone
    // earns nothing and a URL match alone earns nothing — both, plus
    // the map entry, exactly like the listings stamp's trust pattern.
    const examplePack=b.sample===true?examplePackForSiteUrl(siteUrl):null;
    const presenterId=examplePack?examplePresenterForSlug(examplePack.slug):null;
    const presenter=presenterId?personaFor(presenterId):null;
    // ADMIN VOICE OVERRIDE (2026-11-14): a presenter parent stamps the
    // RESOLVED voice — persona_voice_overrides (admin Demo Voices tab)
    // wins over the registry default; no row → presenter.voiceName,
    // byte-identical to before. Fail-safe inside the resolver.
    const presenterVoice=presenter?(await resolvePersonaVoice(db, presenter.id)).voice:null;
    // SWAP-PARENT COMPOSITION (handover fix, 2026-11-10): a
    // swap-enabled demo parent is composed HOST-ONLY — its prompt
    // excludes the simulation host entry beats and the receptionist
    // segment (Sara owns them via her segment prompt), and the invite
    // branch below prepends the swap variant of the invite opening,
    // whose script ENDS at the Sara introduction instead of ordering
    // Aspen to confirm, ask to continue, and enter the simulation
    // herself (the retest #3 prompt collision). The flags-off path is
    // untouched: businessDemoConfig + DEMO_INVITE_OPENING, byte-
    // identical to before. The verification branch composes from
    // whichever base applies — Act 1's own text is unchanged either
    // way, and its session still ends at the code gate.
    config={...(presenter ? businessDemoConfig(businessName,kbSlim.sessionKnowledge,{...(published ?? {}),name:presenter.displayName,voice:presenterVoice ?? presenter.voiceName,simulationPrompt:presenterSimulationPrompt(presenter, sanitizeVisitorName(b.visitorName || String(visitorContact.name || '')))}) : swapEnabled ? businessDemoConfigSwapParent(businessName,kbSlim.sessionKnowledge,published) : businessDemoConfig(businessName,kbSlim.sessionKnowledge,published)), visitorContact, platformFollowup:true};
    // KB SLIM (Publish #85b): only a distilled session carries the
    // lookup stamp — the full text rides OUTSIDE the prompt (never
    // in sourceKnowledge) so the proxy can answer
    // lookup_business_detail from it. Persona segments inherit both
    // keys from this parent config via their ...parent spread.
    if(kbSlim.kbLookup && kbSlim.kbFullText) { config.kbFullText=kbSlim.kbFullText; config.kbLookup=true; }
    if(presenter) config.demoPresenter=presenter.id;
    // ADMIN VOICE OVERRIDE (2026-11-14): the non-presenter demo parent
    // IS Aspen — her composed voice otherwise comes from the published
    // homepage snapshot, so the override applies ONLY when a row
    // exists; with no row this branch stays byte-identical. (The
    // homepage/agent branch is untouched: that voice stays the Voice
    // Agents editor's published snapshot.)
    if(!presenter) { const aspenVoiceOverride=await fetchPersonaVoiceOverride(db,'aspen'); if(aspenVoiceOverride) config.voice=aspenVoiceOverride; }
    if(b.verification==='pending') { config.greeting=DEMO_VERIFICATION_GREETING; config.greetings=[]; config.systemPrompt=`${DEMO_VERIFICATION_ACT1}\n\n${String(config.systemPrompt)}`; config.verificationGate=true; }
    // Invite arrivals (cold-email personal link): the host phase replaces
    // the code gate. Honored ONLY when the demo-invite resolve stamped the
    // lead's arrival server-side — a client flag alone never earns it.
    else if(b.invite===true && leadInviteArrivedAt) { config.greeting=DEMO_INVITE_GREETING; config.greetings=DEMO_INVITE_GREETING_VARIANTS; config.systemPrompt=`${swapEnabled ? DEMO_INVITE_OPENING_SWAP : DEMO_INVITE_OPENING}\n\n${String(config.systemPrompt)}`; config.inviteArrival=true; }
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
    if((!swapEnabled || presenter) && b.verification!=='pending') {
      // Presenter parents take the slim opening too (even with the
      // swap family globally on): the rotation variants end in the
      // Sara introduction, a promise only the swap family can keep —
      // a presenter demo has no Sara to introduce.
      config.greetings=[];
      config.greeting=(b.invite===true && leadInviteArrivedAt) ? DEMO_INVITE_GREETING_LEGACY_SLIM : SIMULATION_GREETING_LEGACY_SLIM;
    }
    // EXAMPLE LISTINGS STAMP (Batch 2, 2026-11-12): a session that the
    // client marked as a one-click EXAMPLE sample (the /agents/realtors
    // examples grid/dropdown sends sample=1 through /demo to /demo-site)
    // AND whose simulated business is one of the 14 known example sites
    // — matched here against the site URL stored on the lead/prospect
    // row THIS function fetched, never a client-supplied URL, the same
    // trust pattern as the invite stamp — additionally carries that
    // example's listings pack in its system prompt, so the simulated
    // receptionist can answer "what listings do you have?" with the
    // agent's own listings first. The flag alone earns nothing, a URL
    // match alone earns nothing, and every non-sample simulation stays
    // byte-identical.
    if(examplePack) stampExampleListings(config, examplePack, presenter ? { presenter: true } : undefined);
    // DEMO START LANGUAGE (Publish #66): explicit site pick > the scanned
    // site's own detected language > English. A detected start is recorded
    // on detectedSiteLocale so the final assembly stamps it (with
    // languageSource 'detected'); either way, a non-English demo start
    // speaks with the persona's voice from that language's curated set
    // (Brazilian Portuguese set for pt-BR — never a European variant).
    const demoStart=resolveDemoStartLocale(b.locale, leadWebsiteLanguage);
    if(demoStart?.source==='detected') detectedSiteLocale=demoStart.locale;
    if(demoStart && demoStart.locale!=='en') config.voice=voiceForLocaleSession(String(config.voice || ''), presenter ? presenter.id : 'aspen', demoStart.locale);
  } else {
    let query=db.from('voice_agents').select('*'); query=b.agentId?query.eq('id',b.agentId):query.eq('slug','aspen-homepage');
    const {data:agent}=await query.maybeSingle(); if(!agent?.published) return json({error:'Voice agent is not published yet'},409);
    if(!(await workspaceAccess(db,agent.organization_id))) return json({error:'This assistant subscription is not active'},403);
    // PLATFORM FOLLOW-UP STAMP (booking-gate fix, 2026-11-14): the
    // homepage agent's sessions ARE the platform sales sessions, and
    // the proxy declares the platform booking/follow-up tools only
    // when config.platformFollowup is true — but the published
    // snapshot never carried it, so homepage Aspen was told by the
    // proxy's injected booking policy that she could book while
    // holding no booking tools (live proof: session 19b82691, where
    // she deflected a booking ask to the /book page). Stamp it
    // code-side for the homepage agent only, mirroring the
    // business-demo stamp on the lead/prospect path above; tenant
    // agents addressed by id on this same path keep exactly the
    // snapshot they published.
    config={...(agent.published as Record<string,unknown>), homepageSales:agent.slug==='aspen-homepage', ...(agent.slug==='aspen-homepage' ? {platformFollowup:true} : {})}; agentId=agent.id; orgId=agent.organization_id;
    stampElevenLabsVoice(config, agent as Record<string,unknown>);
    // HOMEPAGE SALES STAMP (owner-approved sales-script rebuild,
    // 2026-11-15): the homepage agent opens with the three-opener
    // greeting rotation and carries the SALES CONVERSATION ARC layer
    // (pain discovery → cost in their numbers → fit → price → close,
    // plus the silence protocol and gated implementation answers) —
    // same assembly-time pattern as the realtor stamp below: the
    // stored snapshot is never edited, tenant agents addressed by id
    // keep exactly the snapshot they published, and a re-authorization
    // re-applies the stamp to a fresh config so nothing stacks. Runs
    // BEFORE the team-intro and realtor stamps: team-intro still maps
    // every rotated greeting, and the realtor stamp still replaces
    // the rotation wholesale for realtor-landing sessions.
    if(agent.slug==='aspen-homepage') stampHomepageSales(config);
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
    // REALTOR LANDING STAMP (owner-approved 2026-11-11; conversation
    // layer + reachability fix 2026-11-11): a session that STARTS on
    // /agents/realtors opens with the realtor greeting rotation
    // (REALTOR_GREETING_VARIANTS) instead of the standard homepage
    // greeting AND carries the realtor conversation layer
    // (REALTOR_CONVERSATION_LAYER — talk their lingo, qualify on
    // closings/listings/farm, map answers to the realtor-relevant
    // help) appended to its system prompt — same trust pattern as the
    // team-intro stamp above: server-derived from the campaign
    // entryPath ('/agents/realtors' is a member of PUBLIC_PATHS), never
    // from a client flag alone. The stored snapshot is never edited:
    // sessions starting on any other page keep the standard opening and
    // prompt byte-for-byte, and a session that starts elsewhere keeps
    // its own opening even if the visitor later navigates to the
    // realtor page (the opening is fixed at authorization, in the final
    // assembly below). stampRealtorLanding REPLACES the rotation —
    // greeting AND greetings — exactly like businessDemoConfig fills a
    // demo config, so openingFor rotates the three realtor variants
    // per session, and appends the layer (idempotently) to the prompt.
    // REACHABILITY FIX (diagnosed 2026-11-11, owner's live test): the
    // stamp previously ALSO required !b.agentId — and never fired in
    // production. The public widget resolves the homepage agent's
    // public identity (voice-agent-public returns the agent row id)
    // and GeminiAgentWidget addresses the conversation by that id, so
    // EVERY genuine widget session — homepage, /demo, /agents/realtors
    // alike — arrives agentId-addressed, and the old condition silently
    // excluded them all. Tenancy is decided by the RESOLVED slug, not
    // by the absence of an id: an agentId naming a tenant agent
    // resolves to that tenant's slug and never reaches this line, and
    // drafts, previews, shares, guides and demo parents are separate
    // branches above. So the decision is the slug + the entryPath,
    // factored as realtorLandingApplies so the production request
    // shape is regression-tested directly.
    if(realtorLandingApplies(agent.slug, b.campaign)) {
      stampRealtorLanding(config);
    }
  }
  // ELEVENLABS LIVE VOICE strip (2026-11-17): persona segments inherit
  // the parent config by spread — a parent's stamped ElevenLabs voice
  // must never leak into a segment, or Sara/Alex would speak in the
  // host agent's cloned voice. Segments always speak Gemini.
  if (b.personaSegment) delete config.elevenLabsVoiceId;
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
  // PRESENTER PARENTS (Alex handoff fix, 2026-11-14): a demoPresenter
  // parent now earns the stamp too — but only on the LEAD path, where
  // the client derives the same presenter from the lead id and runs
  // the presenter chain (meet-alex + return only; its matcher has no
  // doorway, so no Sara segment can ever arm on a presenter demo).
  // Before this fix the stamp was withheld from presenter parents
  // while their prompt kept the close's MEET ALEX beat: the presenter
  // spoke the introduction, yielded — and no swap ever executed
  // (Ron's Latina/Aurelia test, 2026-11-14). A prospect-path presenter
  // parent still earns nothing: the client cannot name its presenter,
  // so it must stay inert rather than run the Aspen chain.
  if(!b.personaSegment && swapEnabled && (b.leadId || b.prospectId) && !b.draft && !b.preview && (!config.demoPresenter || b.leadId)) config.personaSwapEnabled=true;
  // Website UI locale → authorized starting language (Ron, 2026-11-09).
  // The client sends ONLY the visitor's explicit site-language selection;
  // it is validated here against the supported set (en / es / pt-BR) and
  // anything else is ignored — never browser detection. Persona segments
  // skip this: they inherit uiLocale/startLanguage from the parent's
  // stored config via the segment branch's spread. Phone/telephony
  // sessions never pass through this function, so they never carry a
  // locale and keep the English start.
  const uiLocale = b.personaSegment ? null : normalizeUiLocale(b.locale);
  // GREETING CLOCK + NAME + SEGMENT TIMEZONE (Scalone batch,
  // 2026-11-12 — forensics F7/F6 + row-pull addendum): the opening's
  // time-of-day derives from the session's configured timezone —
  // never the authorizing browser's local clock hour. The
  // client-supplied hour survives only as the fallback for a
  // missing/invalid zone. The spoken name is sanitized: placeholder
  // sentinels ("CRM Prospect" — the literal name /demo creates its
  // lead with) are NO name, so the greeting stays generic. PERSONA
  // SEGMENTS inherit the PARENT session's configured timezone
  // (segmentTimeZone): segment requests carry no zone of their own,
  // and the old unconditional b.timeZone stamp dropped every segment
  // to the 'UTC' schema default — the proxy then told Sara's model
  // "Visitor time zone: UTC" and she said "Good morning" at 19:32
  // EST (00:32 UTC). The segment's greeting hour derives from the
  // propagated zone the same way.
  const effectiveTimeZone=segmentParentId?segmentTimeZone((parentRowRef as {config?:Record<string,unknown>}|undefined)?.config,b.timeZone):b.timeZone;
  const greetingHour=hourInTimeZone(new Date(),effectiveTimeZone) ?? b.hour;
  const greetingName=sanitizeVisitorName(b.visitorName || String((config.visitorContact as Record<string,unknown>|undefined)?.name || ''));
  // SERVER-SIDE RECAP SYNTHESIS (Publish #63, 2026-11-15): the
  // client-side recap lives in the page's visit memory; a reload (or
  // a dropped call that reopens the demo) arrives with NO recap at
  // all, or with only the fragment since the reload — while the
  // session is still authorized as a resume and the opening still
  // offers to pick up where the visitor left off. When that happens
  // on a NON-segment authorization, rebuild the recap here from the
  // PRIOR session's stored transcript (same visitor_hash, same
  // lead/prospect — or the same homepage agent — created within the
  // last 30 minutes) with the shared first+last windowing, and use
  // it when it is the fuller record. Only a transcript the prior
  // session actually stored is read: recordTranscript/consent
  // already decided whether one exists, so a session that stored
  // nothing synthesizes nothing. Never for previews, drafts, shares
  // or guides; never for persona segments (they carry swapRecap).
  // Publish #64: when the visitor_hash lookup finds no usable prior
  // (the forwarded address rotated), an identical second lookup
  // matches on the IP-free visitorKeyHash stamped in the prior row
  // config instead.
  // IP-FREE VISITOR KEY HASH (Publish #64, 2026-11-15): visitor_hash
  // mixes in the first x-forwarded-for entry, and that address rotates
  // between requests behind the hosting proxy — three authorizations
  // with the same visitorKey seconds apart produced three different
  // visitor_hash values live, so the synthesis lookup below almost
  // never matched the prior row. visitorKeyHash is the bare key hash:
  // stable across requests from the same browser. It is stamped into
  // every stored session config (see the config assembly below) and
  // used ONLY as the synthesis fallback match; visitor_hash and all
  // of its other uses (rate limiting, diag ownership, RPC stamping)
  // are untouched.
  const visitorKeyHash = await hash(b.visitorKey);
  let effectiveResumeContext = b.resumeContext;
  // DURABLE CAPTURED FACTS (Publish #68): the same prior-row lookup
  // that synthesizes the recap also recovers the captured-contact
  // stamp (see _shared/captured-contact.ts) — contact facts are
  // recovered independently of the transcript, because a capture is
  // a fact, not a transcript line: a prior session whose transcript
  // was never stored (or whose recap window elided the capture turn)
  // still hands its captured name/email/mobile/consent forward.
  // Unlike the recap, segment rows are legitimate sources here (a
  // capture taken inside Sara's segment is stamped on HER row), so
  // the scan takes the newest stamped row from either lookup,
  // segment or not. The stamp lands on the new config in the final
  // assembly below; persona segments inherit it from the parent
  // row's config spread instead.
  let priorCaptured: CapturedContact | null = null;
  if (!b.personaSegment && !b.preview && !b.draft && !b.share && !b.guide
    && (b.reconnect === true || !b.resumeContext || b.resumeContext.trim().length < 200)) {
    try {
      const scanCaptured = (rows: unknown[] | null | undefined) => {
        if (priorCaptured) return;
        for (const row of rows || []) {
          const found = capturedContactFromConfig((row as { config?: unknown }).config);
          if (found) { priorCaptured = found; return; }
        }
      };
      const priorSince = new Date(Date.now() - 30 * 60_000).toISOString();
      const priorVisitorHash = await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
      let priorQuery = db.from('gemini_voice_sessions')
        .select('config,transcript,created_at')
        .eq('visitor_hash', priorVisitorHash)
        .gte('created_at', priorSince)
        .order('created_at', { ascending: false })
        .limit(5);
      if (b.leadId) priorQuery = priorQuery.eq('lead_id', b.leadId);
      else if (b.prospectId) priorQuery = priorQuery.eq('prospect_id', b.prospectId);
      else priorQuery = priorQuery.eq('agent_id', agentId);
      const { data: priorRows } = await priorQuery;
      scanCaptured(priorRows);
      const usablePrior = (row: unknown) => {
        const priorConfig = (row as { config?: Record<string, unknown> }).config || {};
        return !priorConfig.personaSegment && priorConfig.preview !== true
          && Array.isArray((row as { transcript?: unknown }).transcript)
          && ((row as { transcript?: unknown[] }).transcript as unknown[]).length > 0;
      };
      let prior = (priorRows || []).find(usablePrior);
      if (!prior) {
        // FALLBACK (Publish #64): the visitor_hash match above misses
        // whenever the forwarded address rotated between the prior
        // session and this one. Retry the identical lookup — same
        // scoping, same 30-minute window, same usable-row criteria —
        // matched on the IP-free key hash in the prior row config.
        let fallbackQuery = db.from('gemini_voice_sessions')
          .select('config,transcript,created_at')
          .eq('config->>visitorKeyHash', visitorKeyHash)
          .gte('created_at', priorSince)
          .order('created_at', { ascending: false })
          .limit(5);
        if (b.leadId) fallbackQuery = fallbackQuery.eq('lead_id', b.leadId);
        else if (b.prospectId) fallbackQuery = fallbackQuery.eq('prospect_id', b.prospectId);
        else fallbackQuery = fallbackQuery.eq('agent_id', agentId);
        const { data: fallbackRows } = await fallbackQuery;
        scanCaptured(fallbackRows);
        prior = (fallbackRows || []).find(usablePrior);
      }
      const synthesized = prior ? buildTranscriptRecap((prior as { transcript?: unknown }).transcript) : undefined;
      if (synthesized && synthesized.length > (effectiveResumeContext || '').length) {
        effectiveResumeContext = synthesized;
      }
    } catch { /* synthesis is best-effort: the client's recap stands */ }
  }
  // Publish #68, second chance: a reconnect carrying a FULL client
  // recap skips the synthesis block above (its gate is recap-shaped),
  // but captured facts are not recap-shaped — the capture turn can
  // sit in the recap's elided middle while the fact itself must
  // survive. On a reconnect with no stamp recovered yet, run the
  // same two lookups config-only and take the newest stamp.
  if (!priorCaptured && !b.personaSegment && !b.preview && !b.draft && !b.share && !b.guide && b.reconnect === true) {
    try {
      const capturedSince = new Date(Date.now() - 30 * 60_000).toISOString();
      const capturedHash = await hash(`${b.visitorKey}|${req.headers.get('x-forwarded-for')?.split(',')[0] || ''}`);
      const scanRows = (rows: unknown[] | null | undefined) => {
        for (const row of rows || []) {
          const found = capturedContactFromConfig((row as { config?: unknown }).config);
          if (found) return found;
        }
        return null;
      };
      let capturedQuery = db.from('gemini_voice_sessions')
        .select('config,created_at')
        .eq('visitor_hash', capturedHash)
        .gte('created_at', capturedSince)
        .order('created_at', { ascending: false })
        .limit(5);
      if (b.leadId) capturedQuery = capturedQuery.eq('lead_id', b.leadId);
      else if (b.prospectId) capturedQuery = capturedQuery.eq('prospect_id', b.prospectId);
      else capturedQuery = capturedQuery.eq('agent_id', agentId);
      const { data: capturedRows } = await capturedQuery;
      priorCaptured = scanRows(capturedRows);
      if (!priorCaptured) {
        let capturedFallback = db.from('gemini_voice_sessions')
          .select('config,created_at')
          .eq('config->>visitorKeyHash', visitorKeyHash)
          .gte('created_at', capturedSince)
          .order('created_at', { ascending: false })
          .limit(5);
        if (b.leadId) capturedFallback = capturedFallback.eq('lead_id', b.leadId);
        else if (b.prospectId) capturedFallback = capturedFallback.eq('prospect_id', b.prospectId);
        else capturedFallback = capturedFallback.eq('agent_id', agentId);
        const { data: capturedFallbackRows } = await capturedFallback;
        priorCaptured = scanRows(capturedFallbackRows);
      }
    } catch { /* captured recovery is best-effort, like the synthesis */ }
  }

  config={...config,visitorKeyHash,timeZone:effectiveTimeZone,...(uiLocale ? {uiLocale, startLanguage: startingLanguageForUiLocale(uiLocale)} : detectedSiteLocale ? {uiLocale: detectedSiteLocale, startLanguage: startingLanguageForUiLocale(detectedSiteLocale), languageSource: 'detected'} : {}),quotaClass:segmentParentId?'persona_segment':b.share?'visitor':voiceQuotaClass(role?.role==='admin',b.preview),model:requestedModel || DEFAULT_LIVE_MODEL,opening:openingFor(config,greetingHour,greetingName),preview:b.preview,resumeContext:b.preview?undefined:(segmentParentId?String(config.resumeContext || ''):effectiveResumeContext),reconnect:segmentParentId?false:!b.preview&&b.reconnect,campaign:b.campaign || (segmentParentId?(config.campaign ?? null):null),recordTranscript:segmentParentId?config.recordTranscript===true:!b.preview && transcriptAllowed(false,false,b.consent),recordAudio:segmentParentId?config.recordAudio===true:!b.preview && b.consent};
  // Publish #68: the recovered captured-contact stamp lands on the
  // assembled config (kept out of the assembly line itself, which is
  // pinned byte-exact by the #64 tests). Segments never reach this:
  // priorCaptured is only set by the non-segment synthesis above,
  // and a segment's own inheritance rides the parent spread.
  if (priorCaptured) config.capturedContact = priorCaptured;
  // DEMO-SITE OPENING RENDER (2026-11-12 late — live retest of the
  // Scalone batch, session 96d54121): openingFor returned the picked
  // demo rotation variant VERBATIM, and the demo-site variants are
  // TEMPLATES ({timeGreeting} / {visitorFirstName} / {agentName} /
  // {businessName}, invite variants also {nameConfirm}). The stored
  // opening was the bare template and the model improvised the
  // substitution at speak time — from the raw visitorContact in its
  // prompt ("Good morning, CRM Prospect" at 21:30 America/New_York),
  // bypassing the sanitized greetingName and the timezone-derived
  // greetingHour computed above. Render the picked opening NOW, with
  // those same two values, for DEMO PARENTS ONLY (lead/prospect
  // branch, non-segment): the stored opening is the fully rendered
  // text the proxy serves verbatim. Homepage, realtor-landing,
  // segment, share, draft and preview openings keep the exact shapes
  // openingFor has always produced (their variants are
  // placeholder-free prose or pinned raw); the verification and
  // legacy-slim demo shapes pass through greeting() already rendered,
  // so for them this render is a no-op.
  if(!segmentParentId && (b.leadId || b.prospectId)) {
    config.opening=renderOpeningTemplate(config.opening,config,greetingHour,greetingName);
  }
  // SEGMENT FIRST-LINE RENDER (2026-11-13 — Ron's Andriot retest): the
  // same hygiene pattern, applied to Sara's SEGMENT entry. Her in-role
  // greeting was model-improvised from beat 4 of the segment prompt and
  // intermittently skipped entirely — one live run opened with the
  // host's 78% pitch statistic instead of any greeting. Render her
  // first line HERE, server-side: for a planned doorway swap, the
  // beat-4 greeting template from the segment build (config.greeting),
  // rendered with the segment's effective-timezone hour; for a manual
  // resume inside her segment, a scripted in-role welcome-back line.
  // The proxy's swap/resume openings serve config.segmentGreeting
  // verbatim as her first utterance. Drop recoveries keep the
  // no-re-greeting law (apology + continuation, no stamp). A segment
  // whose business name is unknown gets no stamp — the proxy's prose
  // fallback covers it.
  const segMeta=config.personaSegment as {persona?:unknown;boundary?:unknown}|undefined;
  if(segmentParentId && segMeta?.persona==='sara' && segMeta?.boundary==='doorway' && String(config.businessName || '').trim()) {
    if(config.personaSwap) {
      config.segmentGreeting=renderOpeningTemplate(String(config.greeting || ''),config,greetingHour,greetingName);
      // ROOT-CAUSE FIX (2026-11-13 forensics — the proven Bug 2 cause):
      // the segment's config.opening otherwise stays the RAW,
      // UNSUBSTITUTED Aspen sales template openingFor rotated from the
      // inherited greetings array — placeholders intact, 78% statistic,
      // ending "Now, meet Sara…" — because the parent render above is
      // guarded !segmentParentId. A segment's opening config is its
      // OWN in-role line, never the parent's sales template: stamp the
      // rendered segment greeting AS the opening.
      config.opening=config.segmentGreeting;
    } else if(config.personaResume) {
      config.segmentGreeting=renderOpeningTemplate(`Welcome back — this is Sara, {businessName}'s receptionist. Let's pick up right where we left off.`,config,greetingHour,greetingName);
      config.opening=config.segmentGreeting;
    } else if(config.personaDrop) {
      // Drop recovery serves no opening (apology + continuation), but
      // the stored opening config gets the same hygiene: her rendered
      // in-role greeting, never the raw parent sales template.
      config.opening=renderOpeningTemplate(String(config.greeting || ''),config,greetingHour,greetingName);
    }
  }
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