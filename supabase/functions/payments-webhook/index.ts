import { createClient } from 'npm:@supabase/supabase-js@2';
import { createStripeClient, verifyWebhook } from '../_shared/stripe.ts';
import { syncSubscription, provisionCustomer } from '../_shared/customer-payments.ts';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('POST required',{status:405});const env=new URL(req.url).searchParams.get('env');if(env!=='sandbox'&&env!=='live')return new Response('Invalid environment',{status:400});
 try{
 const event=await verifyWebhook(req,env);const obj=event.data.object;const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');const stripe=createStripeClient(env);
 if(event.type.startsWith('customer.subscription.'))await syncSubscription(db,stripe,obj.id,env);
 if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
  const session=await stripe.checkout.sessions.retrieve(obj.id);if(session.payment_status==='paid'&&session.subscription&&session.metadata?.userId){const sub=await syncSubscription(db,stripe,typeof session.subscription==='string'?session.subscription:session.subscription.id,env);if(sub?.status==='active')await provisionCustomer(db,session.metadata.userId,env);if(session.metadata.custom_avatar==='true'){const {error}=await db.from('custom_avatar_credits').upsert({user_id:session.metadata.userId,environment:env,checkout_session_id:session.id},{onConflict:'checkout_session_id',ignoreDuplicates:true});if(error)throw error;}}
 }
 if(event.type==='invoice.paid'){
  const subscription=obj.parent?.subscription_details?.subscription||obj.subscription;if(subscription)await syncSubscription(db,stripe,typeof subscription==='string'?subscription:subscription.id,env);
 }
 return new Response(JSON.stringify({received:true}),{headers:{'Content-Type':'application/json'}});
 }catch(e){console.error('Payment notification failed',e instanceof Error?e.message:'Unknown error');return new Response('Notification processing failed',{status:400});}
});
