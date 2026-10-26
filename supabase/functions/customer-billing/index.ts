import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { createStripeClient } from '../_shared/stripe.ts';
import { validPaymentPlan, PLAN_CHANGE_PRORATION, CANCEL_AT_PERIOD_END, paidAccess } from '../_shared/payment-rules.ts';
import { syncSubscription, provisionCustomer } from '../_shared/customer-payments.ts';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});if(req.method!=='POST')return json({error:'POST required'},405);
 try{
 const parsed=z.object({action:z.enum(['status','verify','cancel','change']),environment:z.enum(['sandbox','live']),sessionId:z.string().regex(/^cs_[a-zA-Z0-9_]+$/).optional(),priceId:z.string().optional()}).safeParse(await req.json());if(!parsed.success)return json({error:'Invalid billing request'},400);
 const b=parsed.data;const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');const {data:{user}}=await db.auth.getUser(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'');if(!user?.email_confirmed_at)return json({error:'Sign in with a verified account'},401);
 const stripe=createStripeClient(b.environment);
 if(b.action==='verify'){
  if(!b.sessionId)return json({error:'Checkout session required'},400);const session=await stripe.checkout.sessions.retrieve(b.sessionId);
  if(session.metadata?.userId!==user.id)return json({error:'This order belongs to another account'},403);
  if(session.payment_status!=='paid'||session.status!=='complete'||!session.subscription)return json({paid:false,status:session.payment_status});
  const row=await syncSubscription(db,stripe,typeof session.subscription==='string'?session.subscription:session.subscription.id,b.environment);if(!row||!paidAccess(row.status,row.current_period_end))return json({paid:false});
  await provisionCustomer(db,user.id,b.environment);
 }
 const {data:rows,error}=await db.from('subscriptions').select('*').eq('user_id',user.id).eq('environment',b.environment).order('created_at',{ascending:false});if(error)throw error;
 let sub=rows?.find(row=>paidAccess(row.status,row.current_period_end));
 if(b.action==='cancel'||b.action==='change'){
  if(!sub)return json({error:'No paid subscription found'},403);
  const current=await stripe.subscriptions.retrieve(sub.stripe_subscription_id);if(current.metadata.userId!==user.id)return json({error:'Subscription ownership could not be verified'},403);
  if(b.action==='cancel')await stripe.subscriptions.update(current.id,{cancel_at_period_end:CANCEL_AT_PERIOD_END});
  else{
   if(!validPaymentPlan(b.priceId))return json({error:'Choose a supported plan'},400);const prices=await stripe.prices.list({lookup_keys:[b.priceId],active:true});const item=current.items.data[0];if(!prices.data[0]||!item)return json({error:'Plan unavailable'},400);
   await stripe.subscriptions.update(current.id,{items:[{id:item.id,price:prices.data[0].id}],proration_behavior:PLAN_CHANGE_PRORATION,payment_behavior:'error_if_incomplete',metadata:{...current.metadata,plan:b.priceId}});
  }
  sub=await syncSubscription(db,stripe,current.id,b.environment)||undefined;
 }
 const {data:workspace,error:workError}=await db.from('customer_workspaces').select('agent_id,environment').eq('user_id',user.id).eq('environment',b.environment).maybeSingle();if(workError)throw workError;
 return json({paid:Boolean(sub&&workspace),subscription:sub||null,workspace});
 }catch(e){return json({error:e instanceof Error?e.message:'Billing unavailable'},500);}
});