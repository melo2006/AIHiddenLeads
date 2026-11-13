import { createClient } from 'npm:@supabase/supabase-js@2';
import { createStripeClient, verifyWebhook } from '../_shared/stripe.ts';
import { syncSubscription, syncAvatarSubscription, provisionCustomer } from '../_shared/customer-payments.ts';
import { startAvatarSubscription } from '../_shared/avatar-billing.ts';
import { maybeSendWelcomeEmail } from '../_shared/welcome.ts';
import { MINUTE_PACKS, validMinutePack } from '../_shared/payment-rules.ts';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('POST required',{status:405});const env=new URL(req.url).searchParams.get('env');if(env!=='sandbox'&&env!=='live')return new Response('Invalid environment',{status:400});
 try{
 const event=await verifyWebhook(req,env);const obj=event.data.object;const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');const stripe=createStripeClient(env);
 if(event.type.startsWith('customer.subscription.')){const planRow=await syncSubscription(db,stripe,obj.id,env);if(!planRow)await syncAvatarSubscription(db,stripe,obj.id,env);}
 if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
  const session=await stripe.checkout.sessions.retrieve(obj.id);if(session.mode==='payment'&&session.payment_status==='paid'&&session.metadata?.kind==='minute_pack'&&session.metadata.userId&&validMinutePack(session.metadata.pack_id)){const pack=MINUTE_PACKS[session.metadata.pack_id];const {data:existingPack}=await db.from('minute_pack_purchases').select('id').eq('stripe_checkout_session_id',session.id).limit(1);if(!existingPack?.length){const {error}=await db.from('minute_pack_purchases').insert({user_id:session.metadata.userId,organization_id:session.metadata.organization_id||null,pack_id:session.metadata.pack_id,minutes:pack.minutes,price_cents:pack.amount,stripe_checkout_session_id:session.id,stripe_payment_intent_id:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null,environment:env,status:env==='sandbox'?'paid_test':'paid'});if(error)throw error;}}if(session.mode==='payment'&&session.payment_status==='paid'&&session.metadata?.custom_avatar==='true'&&session.metadata.userId){const {error}=await db.from('custom_avatar_credits').upsert({user_id:session.metadata.userId,environment:env,checkout_session_id:session.id},{onConflict:'checkout_session_id',ignoreDuplicates:true});if(error)throw error;}if(session.payment_status==='paid'&&session.subscription&&session.metadata?.userId){const sub=await syncSubscription(db,stripe,typeof session.subscription==='string'?session.subscription:session.subscription.id,env);if(sub?.status==='active'){await provisionCustomer(db,session.metadata.userId,env);try{await maybeSendWelcomeEmail(db,session.metadata.userId);}catch(e){console.error('Welcome email failed',e instanceof Error?e.message:'Unknown error');}}if(session.metadata.custom_avatar==='true'){const {error}=await db.from('custom_avatar_credits').upsert({user_id:session.metadata.userId,environment:env,checkout_session_id:session.id},{onConflict:'checkout_session_id',ignoreDuplicates:true});if(error)throw error;}}
  // Avatar free month (pricing cleanup, 2026-11-12): the plan checkout's
  // avatar box sets metadata video_avatar='true'; once the plan payment is
  // verified, start the add-on's own subscription (trial first month).
  // Failure-isolated like the welcome email — a failed avatar start never
  // fails a paid plan's webhook; the dashboard offers the same start.
  if(session.mode==='subscription'&&session.payment_status==='paid'&&session.metadata?.video_avatar==='true'&&session.metadata.userId){try{await startAvatarSubscription(db,stripe,session.metadata.userId,env);}catch(e){console.error('Avatar trial start failed',e instanceof Error?e.message:'Unknown error');}}
 }
 if(event.type==='invoice.paid'){
  const subscription=obj.parent?.subscription_details?.subscription||obj.subscription;if(subscription)await syncSubscription(db,stripe,typeof subscription==='string'?subscription:subscription.id,env);
 }
 return new Response(JSON.stringify({received:true}),{headers:{'Content-Type':'application/json'}});
 }catch(e){console.error('Payment notification failed',e instanceof Error?e.message:'Unknown error');return new Response('Notification processing failed',{status:400});}
});
