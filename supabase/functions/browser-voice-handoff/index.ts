import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import twilio from 'npm:twilio@5';
import { acceptsManager, escapeXml, ownerOutcome, sha256 } from '../_shared/browser-handoff.ts';

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
    return xml(`<Say>Please stay here while I connect you with the manager.</Say><Dial><Conference startConferenceOnEnter="false" endConferenceOnExit="true" beep="false" statusCallback="${escapeXml(callback('conference',handoff.id))}" statusCallbackEvent="join leave end">${conference}</Conference></Dial>`);
   }
   if(!id.success)return xml('<Hangup/>');
   const {data}=await db.from('browser_voice_handoffs').select('*').eq('id',id.data).maybeSingle();handoff=data;
   if(!handoff)return xml('<Hangup/>');
   if(action==='conference'){
    if(params.StatusCallbackEvent==='participant-join'&&params.CallSid===handoff.browser_call_sid){
     if(await advance(handoff.id,['queued'],'dialing_owner')){
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
    const briefing=`Hello ${handoff.manager_name}. A website visitor is waiting. This is an automated handoff. ${handoff.summary||'The visitor has requested to speak with your team.'} Press 1 to accept and connect. Press any other key to decline.`;
    return xml(`<Gather input="dtmf" numDigits="1" timeout="15" actionOnEmptyResult="true" action="${escapeXml(callback('accept',handoff.id))}" method="POST"><Say>${escapeXml(briefing)}</Say></Gather><Hangup/>`);
   }
   if(action==='accept'){
    if(params.CallSid!==handoff.owner_call_sid||handoff.status!=='awaiting_owner')return xml('<Hangup/>');
    if(!acceptsManager(params.Digits||'')){await advance(handoff.id,['awaiting_owner'],'failed','Manager did not accept');await stopLegs({browser_call_sid:handoff.browser_call_sid,owner_call_sid:null});return xml('<Hangup/>');}
    return xml(`<Say>Connecting you now.</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">browser-handoff-${handoff.id}</Conference></Dial>`);
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
  return json({token:token.toJwt()});
 }catch(e){console.error('browser handoff',e instanceof Error?e.message:'error');return json({error:'Could not connect the manager. You can continue with Aspen.'},500);}
});