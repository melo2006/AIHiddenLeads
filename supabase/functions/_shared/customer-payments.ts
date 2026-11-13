import { createStripeClient, type StripeEnv } from './stripe.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_AGENT } from './voice-config.ts';
import { validPaymentPlan, paidAccess, VIDEO_AVATAR_PRICE } from './payment-rules.ts';
export async function syncSubscription(db:ReturnType<typeof createClient>, stripe:ReturnType<typeof createStripeClient>, id:string, env:StripeEnv) {
 const sub=await stripe.subscriptions.retrieve(id);const userId=sub.metadata.userId;if(!userId)return null;
 const item=sub.items.data[0];const priceId=item?.price.lookup_key||item?.price.metadata?.lovable_external_id;if(!validPaymentPlan(priceId))return null;
 const row={user_id:userId,stripe_subscription_id:sub.id,stripe_customer_id:typeof sub.customer==='string'?sub.customer:sub.customer.id,product_id:typeof item.price.product==='string'?item.price.product:item.price.product.id,price_id:priceId,status:sub.status,current_period_start:item.current_period_start?new Date(item.current_period_start*1000).toISOString():null,current_period_end:item.current_period_end?new Date(item.current_period_end*1000).toISOString():null,cancel_at_period_end:sub.cancel_at_period_end,environment:env,updated_at:new Date().toISOString()};
 const {error}=await db.from('subscriptions').upsert(row,{onConflict:'stripe_subscription_id'});if(error)throw error;return row;
}
/**
 * Mirror a VIDEO AVATAR add-on subscription into public.subscriptions
 * (price_id = video_avatar_monthly) plus its trial bookkeeping row in
 * public.video_avatar_trials. Deliberately separate from syncSubscription
 * above, which accepts plan subscriptions only and returns null for this
 * one — the webhook routes by which sync claims the subscription.
 *
 * Default-off arming: a trialing avatar subscription is armed with
 * cancel_at_period_end = true (once, stamped in default_off_armed_at),
 * so an untouched free month ends at trial end with no charge; keeping
 * the avatar is the customer's active choice (customer-billing
 * avatar_keep disarms it). Trial-table writes are failure-isolated: the
 * trials table lands with drizzle migration 0021, and a missing table
 * must never fail the webhook — the subscriptions row is the record
 * Stripe events can always rebuild from.
 */
export async function syncAvatarSubscription(db:ReturnType<typeof createClient>, stripe:ReturnType<typeof createStripeClient>, id:string, env:StripeEnv) {
 const sub=await stripe.subscriptions.retrieve(id);const userId=sub.metadata.userId;if(!userId)return null;
 const item=sub.items.data[0];const priceId=item?.price.lookup_key||item?.price.metadata?.lovable_external_id;if(priceId!==VIDEO_AVATAR_PRICE.id)return null;
 const row={user_id:userId,stripe_subscription_id:sub.id,stripe_customer_id:typeof sub.customer==='string'?sub.customer:sub.customer.id,product_id:typeof item.price.product==='string'?item.price.product:item.price.product.id,price_id:VIDEO_AVATAR_PRICE.id,status:sub.status,current_period_start:item.current_period_start?new Date(item.current_period_start*1000).toISOString():null,current_period_end:item.current_period_end?new Date(item.current_period_end*1000).toISOString():null,cancel_at_period_end:sub.cancel_at_period_end,environment:env,updated_at:new Date().toISOString()};
 const {error}=await db.from('subscriptions').upsert(row,{onConflict:'stripe_subscription_id'});if(error)throw error;
 if(sub.status==='trialing'){
  const trialEnd=sub.trial_end?new Date(sub.trial_end*1000).toISOString():row.current_period_end;
  let armedAt:string|null=null;
  try{
   const {data:trialRow}=await db.from('video_avatar_trials').select('default_off_armed_at,kept_at').eq('stripe_subscription_id',sub.id).maybeSingle();
   armedAt=trialRow?.default_off_armed_at??null;
   if(!armedAt&&!trialRow?.kept_at&&!sub.cancel_at_period_end){
    await stripe.subscriptions.update(sub.id,{cancel_at_period_end:true});
    armedAt=new Date().toISOString();row.cancel_at_period_end=true;
    const {error:reErr}=await db.from('subscriptions').update({cancel_at_period_end:true,updated_at:new Date().toISOString()}).eq('stripe_subscription_id',sub.id);if(reErr)throw reErr;
   }
   const {error:tErr}=await db.from('video_avatar_trials').upsert({user_id:userId,environment:env,stripe_subscription_id:sub.id,trial_end:trialEnd,...(armedAt?{default_off_armed_at:armedAt}:{})},{onConflict:'stripe_subscription_id'});
   if(tErr)console.error('avatar trial bookkeeping failed',tErr.message);
  }catch(e){console.error('avatar trial bookkeeping failed',e instanceof Error?e.message:'unknown');}
 }
 return row;
}
export async function provisionCustomer(db:ReturnType<typeof createClient>, userId:string, env:StripeEnv){
 const {data,error}=await db.rpc('provision_paid_workspace',{_user:userId,_env:env,_config:{...DEFAULT_AGENT,businessName:'Your business',systemPrompt:'You are the business customer-service assistant. Answer only from approved business knowledge. If a fact is missing, say so. Never invent prices, appointments or actions. Calendar and telephone actions require separately connected services.'}});if(error)throw error;return data;
}
export async function workspaceAccess(db:ReturnType<typeof createClient>, org:string){
 const {data:workspace,error}=await db.from('customer_workspaces').select('user_id,environment').eq('organization_id',org).maybeSingle();if(error)throw error;if(!workspace)return true;
 const {data:subs,error:subError}=await db.from('subscriptions').select('status,current_period_end').eq('user_id',workspace.user_id).eq('environment',workspace.environment);if(subError)throw subError;return subs?.some(s=>paidAccess(s.status,s.current_period_end))||false;
}