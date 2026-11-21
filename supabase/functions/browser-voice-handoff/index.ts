import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import twilio from 'npm:twilio@5';
import { acceptsManager, escapeXml, ownerOutcome, sha256 } from '../_shared/browser-handoff.ts';
import { briefingLanguageFrom, briefingSayLanguage, HANDOFF_BRIEFING_BUCKET, handoffBriefingPath, handoffConnectingPath, handoffStayPath, handoffConnectingLine, handoffStayLine, managerBriefingText, pollForBriefingUrl, storeHandoffBriefing, type BriefingLanguage } from '../_shared/handoff-briefing-voice.ts';

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const xml=(body:string)=>new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,{headers:{...corsHeaders,'Content-Type':'text/xml'}});
const bodySchema=z.object({action:z.enum(['token','status','cancel']),handoffToken:z.string().min(32).max(200)});
const terminal=['failed','cancelled','completed'];
const active=['queued','dialing_owner','awaiting_owner','joined'];

Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 const url=new URL(req.url);
 const base=`${Deno.env.get('SUPABASE_URL')}/functions/v1/browser-voice-handoff`;
 const apikey=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
 const callback=(action:string,id:string)=>`${base}?action=${action}&id=${id}&apikey=${encodeURIComponent(apikey)}`;
 async function api(path:string,body?:URLSearchParams){
  const accountSid=Deno.env.get('TWILIO_ACCOUNT_SID'), authToken=Deno.env.get('TWILIO_AUTH_TOKEN');
  if(!accountSid||!authToken) throw new Error('Twilio connection is unavailable');
  const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Basic ${btoa(`${accountSid}:${authToken}`)}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body});
  if(!r.ok){const detail=await r.text();console.error('Twilio handoff request failed',r.status,detail);throw new Error(`Twilio request failed (${r.status})`);}
  return r.json();
 }
 async function advance(id:string,expected:string[],next:string,error:string|null=null){
  const {data,error:err}=await db.rpc('advance_browser_handoff',{_id:id,_expected:expected,_next:next,_error:error});
  if(err) throw err;return data;
 }
 async function sessionBriefingLanguage(h:{session_id?:string|null}): Promise<BriefingLanguage>{
  // The whisper language = the voice session's own language
  // (startLanguage / uiLocale stamped into its config by
  // gemini-session). English on any miss.
  try{
   if(!h?.session_id)return 'en';
   const {data}=await db.from('gemini_voice_sessions').select('config').eq('id',h.session_id).maybeSingle();
   const cfg=(data?.config??{}) as Record<string,unknown>;
   return briefingLanguageFrom({startLanguage:cfg.startLanguage,uiLocale:cfg.uiLocale});
  }catch{return 'en';}
 }
 async function briefingUpload(path:string,wav:Uint8Array){
  const {error}=await db.storage.from(HANDOFF_BRIEFING_BUCKET).upload(path,wav,{contentType:'audio/wav',upsert:true});
  return {error:error?{message:error.message}:null};
 }
 async function signedBriefingUrl(path:string):Promise<{url:string|null;error:string|null}>{
  try{const {data,error}=await db.storage.from(HANDOFF_BRIEFING_BUCKET).createSignedUrl(path,600);if(data?.signedUrl)return {url:data.signedUrl,error:null};return {url:null,error:error?.message||'not found'};}catch(e){return {url:null,error:e instanceof Error?e.message:'error'};}
 }
 // Arm-time Aspen-voice synthesis (Item 11 fix, 2026-11-21): the
 // briefing used to be synthesized only when the visitor leg
 // joined — in parallel with the owner dial — so a fast answer
 // beat it and the owner leg's single lookup silently fell back
 // to Twilio <Say>. Now ALL THREE spoken lines (the press-1
 // briefing, the connecting line, the visitor stay line) are
 // synthesized when the handoff is ARMED — at token issuance,
 // before the browser leg is even placed — so the audio is
 // already in storage when the owner answers. Every line's
 // outcome is logged with its reason by storeHandoffBriefing.
 async function armBriefingVoice(handoff:{id:string;session_id?:string|null;manager_name?:unknown;summary?:unknown},source:string){
  try{
   const apiKey=Deno.env.get('GOOGLE_API_KEY')||'';
   const briefingText=managerBriefingText(handoff,await sessionBriefingLanguage(handoff));
   const language=await sessionBriefingLanguage(handoff);
   const lines=[
    {line:'briefing',path:handoffBriefingPath(handoff.id),text:briefingText},
    {line:'connecting',path:handoffConnectingPath(handoff.id),text:handoffConnectingLine(language)},
    {line:'stay',path:handoffStayPath(handoff.id),text:handoffStayLine(language)},
   ];
   const stored=await Promise.all(lines.map(l=>storeHandoffBriefing({handoffId:handoff.id,line:l.line,path:l.path,text:l.text,apiKey,upload:briefingUpload})));
   console.info('handoff_briefing_armed',JSON.stringify({handoffId:handoff.id,source,briefing:stored[0],connecting:stored[1],stay:stored[2]}));
  }catch(e){console.error('handoff briefing arm failed',e instanceof Error?e.message:'error');}
 }
 async function stopLegs(h:{browser_call_sid:string|null;owner_call_sid:string|null}){
  await Promise.all([h.browser_call_sid,h.owner_call_sid].filter((sid):sid is string=>Boolean(sid)).map(async sid=>{try{await api(`/Calls/${encodeURIComponent(sid)}.json`,new URLSearchParams({Status:'completed'}));}catch(e){console.error('Could not end transfer leg',e instanceof Error?e.message:'error');}}));
 }
 try {
  const action=url.searchParams.get('action');
  if(action){
   if(req.method!=='POST')return json({error:'POST required'},405);
   if(!req.headers.get('content-type')?.includes('application/x-www-form-urlencoded'))return json({error:'Invalid Twilio callback'},400);
   const form=await req.formData();
   const params:Record<string,string>={};for(const [key,value] of form)if(typeof value==='string')params[key]=value;
   const authToken=Deno.env.get('TWILIO_AUTH_TOKEN');
   // Validate the exact public URL, including all query parameters; apikey is not authorization.
   const publicUrl=`${base}${url.search}`;
   if(!authToken||!twilio.validateRequest(authToken,req.headers.get('x-twilio-signature')||'',publicUrl,params))return json({error:'Invalid Twilio signature'},403);
   const id=z.string().uuid().safeParse(url.searchParams.get('id'));
   let handoff;
   if(action==='browser'){
    const token=z.string().min(32).max(200).safeParse(params.handoffToken);
    if(!token.success)return xml('<Hangup/>');
    const {data}=await db.from('browser_voice_handoffs').select('*').eq('token_hash',await sha256(token.data)).gt('expires_at',new Date().toISOString()).maybeSingle();
    handoff=data;
    if(!handoff||params.From!==`client:handoff_${handoff.id}`||!/^CA[a-f0-9]{32}$/i.test(params.CallSid||''))return xml('<Hangup/>');
    if(!await advance(handoff.id,['not_requested'],'queued'))return xml('<Hangup/>');
    const {error}=await db.from('browser_voice_handoffs').update({browser_call_sid:params.CallSid}).eq('id',handoff.id);if(error)throw error;
    const conference=`browser-handoff-${handoff.id}`;
    const stayLang=await sessionBriefingLanguage(handoff);
    // Aspen-voice stay line (Item 11 fix, 2026-11-21): synthesized
    // at arm time (token issuance, just before this leg was
    // placed); <Play> it when present, else the <Say> line.
    const stayLookup=await signedBriefingUrl(handoffStayPath(handoff.id));
    console.info('handoff_briefing_leg_lookup',JSON.stringify({handoffId:handoff.id,line:'stay',found:Boolean(stayLookup.url)}));
    const stayInner=stayLookup.url?`<Play>${escapeXml(stayLookup.url)}</Play>`:`<Say language="${briefingSayLanguage(stayLang)}">${escapeXml(handoffStayLine(stayLang))}</Say>`;
    return xml(`${stayInner}<Dial><Conference startConferenceOnEnter="false" endConferenceOnExit="true" beep="false" statusCallback="${escapeXml(callback('conference',handoff.id))}" statusCallbackEvent="join leave end">${conference}</Conference></Dial>`);
   }
   if(!id.success)return xml('<Hangup/>');
   const {data}=await db.from('browser_voice_handoffs').select('*').eq('id',id.data).maybeSingle();handoff=data;
   if(!handoff)return xml('<Hangup/>');
   if(action==='conference'){
    if(params.StatusCallbackEvent==='participant-join'&&params.CallSid===handoff.browser_call_sid){
     if(await advance(handoff.id,['queued'],'dialing_owner')){
      // Aspen-voice briefing — BACKUP pass only (Item 11 fix,
      // 2026-11-21): synthesis normally already ran at arm time
      // (token issuance), before this leg was placed. If the
      // briefing WAV is somehow not in storage yet — the arm
      // attempt failed or is still running — re-arm here, in
      // parallel with the owner dial below, while the phone is
      // still ringing; the owner action then polls for it before
      // falling back. The check itself is logged either way, so
      // a missing whisper is never silent again.
      EdgeRuntime.waitUntil((async()=>{
       const existing=await signedBriefingUrl(handoffBriefingPath(handoff.id));
       console.info('handoff_briefing_join_check',JSON.stringify({handoffId:handoff.id,stored:Boolean(existing.url),...(existing.url?{}:{signError:existing.error})}));
       if(!existing.url)await armBriefingVoice(handoff,'join');
      })());
      try{
       const owner=await api('/Calls.json',new URLSearchParams({To:handoff.target_phone,From:'+15612755757',Url:callback('owner',handoff.id),Method:'POST',StatusCallback:callback('owner-status',handoff.id),StatusCallbackMethod:'POST',StatusCallbackEvent:'initiated ringing answered completed',Timeout:'30'}));
       await db.from('browser_voice_handoffs').update({owner_call_sid:owner.sid}).eq('id',handoff.id);
       const {data:latest}=await db.from('browser_voice_handoffs').select('status').eq('id',handoff.id).single();
       if(latest&&terminal.includes(latest.status))await api(`/Calls/${owner.sid}.json`,new URLSearchParams({Status:'completed'}));
      }catch(e){await advance(handoff.id,['dialing_owner'],'failed',e instanceof Error?e.message:'Could not reach manager');await stopLegs(handoff);}
     }
    }else if(params.StatusCallbackEvent==='participant-join'&&params.CallSid===handoff.owner_call_sid){
     await advance(handoff.id,['awaiting_owner'],'joined');
    }else if(params.StatusCallbackEvent==='participant-leave'||params.StatusCallbackEvent==='conference-end'){
     if(params.CallSid===handoff.browser_call_sid||params.CallSid===handoff.owner_call_sid||params.StatusCallbackEvent==='conference-end'){
      const changed=await advance(handoff.id,active,handoff.status==='joined'?'completed':'cancelled');if(changed)await stopLegs(handoff);
     }
    }
    return json({ok:true});
   }
   if(action==='owner'){
    if(terminal.includes(handoff.status))return xml('<Hangup/>');
    if(handoff.owner_call_sid&&params.CallSid!==handoff.owner_call_sid)return xml('<Hangup/>');
    await db.from('browser_voice_handoffs').update({owner_call_sid:params.CallSid}).eq('id',handoff.id);
    await advance(handoff.id,['dialing_owner'],'awaiting_owner');
    const briefingLang=await sessionBriefingLanguage(handoff);
    const briefing=managerBriefingText(handoff,briefingLang);
    // Aspen-voice briefing (Handoff improvement batch, 2026-11-12;
    // Item 11 fix, 2026-11-21): the briefing was synthesized at
    // arm time, so the manager hears Aspen's own voice inside the
    // same press-1 Gather. The lookup POLLS briefly (bounded,
    // ~4 s — see pollForBriefingUrl) instead of the old single
    // shot, so a briefing still landing when a fast answer comes
    // in still wins; only a genuine miss after the full poll
    // falls back to the Twilio <Say> briefing — and the outcome
    // is logged either way, never silent.
    const briefingPoll=await pollForBriefingUrl({lookup:()=>signedBriefingUrl(handoffBriefingPath(handoff.id))});
    const briefingAudio=briefingPoll.url||'';
    console.info('handoff_briefing_owner_lookup',JSON.stringify({handoffId:handoff.id,found:Boolean(briefingAudio),attempts:briefingPoll.attempts,waitedMs:briefingPoll.waitedMs,...(briefingAudio?{}:{signError:briefingPoll.lastError})}));
    if(!briefingAudio)console.info('handoff_briefing_fallback_say',JSON.stringify({handoffId:handoff.id,line:'briefing',reason:'not_stored_after_poll'}));
    const gatherInner=briefingAudio?`<Play>${escapeXml(briefingAudio)}</Play>`:`<Say language="${briefingSayLanguage(briefingLang)}">${escapeXml(briefing)}</Say>`;
    return xml(`<Gather input="dtmf" numDigits="1" timeout="15" actionOnEmptyResult="true" action="${escapeXml(callback('accept',handoff.id))}" method="POST">${gatherInner}</Gather><Hangup/>`);
   }
   if(action==='accept'){
    if(params.CallSid!==handoff.owner_call_sid||handoff.status!=='awaiting_owner')return xml('<Hangup/>');
    if(!acceptsManager(params.Digits||'')){await advance(handoff.id,['awaiting_owner'],'failed','Manager did not accept');await stopLegs({browser_call_sid:handoff.browser_call_sid,owner_call_sid:null});return xml('<Hangup/>');}
    const acceptLang=await sessionBriefingLanguage(handoff);
    // Aspen-voice connecting line (Item 11 fix, 2026-11-21):
    // synthesized at arm time alongside the briefing; <Play> it
    // when present so the manager never hears the carrier voice
    // on this leg either, else the <Say> line.
    const connectingLookup=await signedBriefingUrl(handoffConnectingPath(handoff.id));
    console.info('handoff_briefing_leg_lookup',JSON.stringify({handoffId:handoff.id,line:'connecting',found:Boolean(connectingLookup.url)}));
    const connectingInner=connectingLookup.url?`<Play>${escapeXml(connectingLookup.url)}</Play>`:`<Say language="${briefingSayLanguage(acceptLang)}">${escapeXml(handoffConnectingLine(acceptLang))}</Say>`;
    return xml(`${connectingInner}<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">browser-handoff-${handoff.id}</Conference></Dial>`);
   }
   if(action==='owner-status'){
    if(handoff.owner_call_sid&&params.CallSid!==handoff.owner_call_sid)return json({ok:true});
    const outcome=ownerOutcome(params.CallStatus||'',handoff.status==='joined');
    if(outcome&&await advance(handoff.id,active,outcome,outcome==='failed'?`Manager call ${params.CallStatus}`:null))await stopLegs({browser_call_sid:handoff.browser_call_sid,owner_call_sid:null});
    return json({ok:true});
   }
   return json({error:'Unknown callback'},400);
  }
  if(req.method!=='POST')return json({error:'POST required'},405);
  const parsed=bodySchema.safeParse(await req.json());if(!parsed.success)return json({error:'Invalid handoff request'},400);
  // This scoped capability was issued only by gemini-session. It cannot choose a number, tenant or summary.
  const {data:h}=await db.from('browser_voice_handoffs').select('*').eq('token_hash',await sha256(parsed.data.handoffToken)).gt('expires_at',new Date().toISOString()).maybeSingle();
  if(!h)return json({error:'A valid browser voice session is required'},401);
  if(parsed.data.action==='cancel'){
   if(await advance(h.id,active,'cancelled','Visitor returned to Aspen'))await stopLegs(h);
   return json({status:'cancelled'});
  }
  if(parsed.data.action==='status'){
   if(['queued','dialing_owner','awaiting_owner'].includes(h.status)&&Date.now()-new Date(h.updated_at).getTime()>120000){await advance(h.id,active.filter(s=>s!=='joined'),'failed','Manager did not answer in time');await stopLegs(h);return json({status:'failed',message:'No one answered. Returning to Aspen.'});}
   return json({status:h.status,message:h.last_error});
  }
  if(h.status!=='not_requested')return json({error:'This handoff has already been used'},409);
  const account=Deno.env.get('TWILIO_ACCOUNT_SID'), keySid=Deno.env.get('TWILIO_VOICE_API_KEY_SID'), keySecret=Deno.env.get('TWILIO_VOICE_API_KEY_SECRET');
  if(!account||!keySid||!keySecret||!Deno.env.get('TWILIO_AUTH_TOKEN'))return json({error:'Browser calling is waiting for the Twilio Voice signing keys.'},503);
  // Reuse one TwiML application. Never create keys or change the existing telephone application.
  const apps=await api('/Applications.json');
  const voiceUrl=`${base}?action=browser&apikey=${encodeURIComponent(apikey)}`;
  let app=apps.applications?.find((a:{friendly_name:string;voice_url:string})=>a.friendly_name==='AI Hidden Leads Browser Handoff'&&a.voice_url===voiceUrl);
  if(!app)app=await api('/Applications.json',new URLSearchParams({FriendlyName:'AI Hidden Leads Browser Handoff',VoiceUrl:voiceUrl,VoiceMethod:'POST'}));
  const AccessToken=twilio.jwt.AccessToken;
  const token=new AccessToken(account,keySid,keySecret,{identity:`handoff_${h.id}`,ttl:120});
  token.addGrant(new AccessToken.VoiceGrant({outgoingApplicationSid:app.sid,incomingAllow:false}));
  // ARM the Aspen-voice lines (Item 11 fix, 2026-11-21): token
  // issuance is the commit point — the visitor is placing the
  // browser leg now, and the whole connect + join + dial + ring
  // window is ahead of the owner answer. Synthesizing here (not
  // at visitor-join, as before) means the briefing WAV is
  // already stored when the owner picks up, however fast.
  EdgeRuntime.waitUntil(armBriefingVoice(h,'token'));
  return json({token:token.toJwt()});
 }catch(e){console.error('browser handoff',e instanceof Error?e.message:'error');return json({error:'Could not connect the manager. You can continue with Aspen.'},500);}
});