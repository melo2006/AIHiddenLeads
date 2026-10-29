import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { digest, finalizeRecord } from '../_shared/conversation-records.ts';
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list')}),z.object({action:z.literal('read'),id:z.string().uuid()}),
 z.object({action:z.literal('summarize'),id:z.string().uuid()}),
 z.object({action:z.literal('copy'),token:z.string().min(50).max(100)}),
 z.object({action:z.literal('chat'),capability:z.string().min(32).max(100),businessName:z.string().max(200),role:z.enum(['user','assistant']),content:z.string().min(1).max(20000),agreed:z.literal(true)}),
 z.object({action:z.literal('chatCopy'),capability:z.string().min(32).max(100),email:z.string().email().max(255),consent:z.literal(true)}),
]);
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'POST required'},405);
 try{
  const p=schema.safeParse(await req.json());if(!p.success)return json({error:'Invalid request'},400);const b=p.data;
  const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
  if(b.action==='copy'){
   const {data:link}=await db.from('conversation_copy_links').select('record_id').eq('token_hash',await digest(b.token)).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
   if(!link)return json({error:'This private link has expired or was revoked.'},404);
   const {data:r}=await db.from('conversation_records').select('business_name,transcript,summary,summary_status,created_at').eq('id',link.record_id).single();
   return r?json({record:{...r,summary:r.summary?{summary:r.summary.summary,needs:r.summary.needs,nextSteps:r.summary.nextSteps}:null}}):json({error:'Conversation unavailable'},404);
  }
  if(b.action==='chatCopy'){
   const {data:r}=await db.from('conversation_records').select('id,copy_requested_at').eq('session_ref',`chat_${await digest(b.capability)}`).maybeSingle();
   if(!r)return json({error:'Start a conversation before requesting a copy'},404);
   if(r.copy_requested_at)return json({error:'A copy has already been requested'},409);
   const {error}=await db.from('conversation_records').update({recipient_email:b.email,copy_requested_at:new Date().toISOString(),status:'ended'}).eq('id',r.id);
   if(error)return json({error:'Could not save the copy request'},500);
   EdgeRuntime.waitUntil(finalizeRecord(db,r.id));return json({requested:true});
  }
  if(b.action==='chat'){
   const {count}=await db.from('conversation_records').select('id',{count:'exact',head:true}).eq('channel','chat').gte('created_at',new Date(Date.now()-3600000).toISOString());
   if((count||0)>100)return json({error:'Chat record capacity reached. Try later.'},429);
   const ref=`chat_${await digest(b.capability)}`;
   const {data:r}=await db.from('conversation_records').select('id,transcript').eq('session_ref',ref).maybeSingle();
   if(r?.transcript?.length>=300)return json({error:'Chat record limit reached'},429);
   const transcript=[...(r?.transcript||[]),{role:b.role,text:b.content}];
   const {error}=await db.from('conversation_records').upsert({session_ref:ref,channel:'chat',business_name:b.businessName,transcript,recording_agreed_at:new Date().toISOString(),status:'ended',ended_at:new Date().toISOString()},{onConflict:'session_ref'});
   return error?json({error:'Chat record could not be saved'},500):json({saved:true});
  }
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
  const {data:{user}}=await db.auth.getUser(jwt);const {data:role}=user?await db.from('voice_platform_roles').select('role').eq('user_id',user.id).maybeSingle():{data:null};
  if(role?.role!=='admin')return json({error:'Administrator access required'},403);
  if(b.action==='list'){const {data,error}=await db.from('conversation_records').select('id,channel,business_name,status,summary,summary_status,summary_error,recipient_name,recipient_email,copy_requested_at,copy_sent_at,created_at,ended_at').order('created_at',{ascending:false}).limit(100);return error?json({error:'Could not load records'},500):json({records:data});}
  const {data:r}=await db.from('conversation_records').select('*').eq('id',b.id).single();if(!r)return json({error:'Record not found'},404);
  if(b.action==='summarize'){await finalizeRecord(db,r.id);const {data:updated}=await db.from('conversation_records').select('*').eq('id',r.id).single();return json({record:updated});}
  const audio=[];for(const part of (r.audio_paths||[])){const {data}=await db.storage.from('conversation-recordings').createSignedUrl(part.path,300);if(data)audio.push({...part,url:data.signedUrl});}
  return json({record:{...r,audio}});
 }catch{return json({error:'Conversation record unavailable'},500);}
});