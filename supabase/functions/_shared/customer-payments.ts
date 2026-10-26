import { createStripeClient, type StripeEnv } from './stripe.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_AGENT } from './voice-config.ts';
import { validPaymentPlan, paidAccess } from './payment-rules.ts';
export async function syncSubscription(db:ReturnType<typeof createClient>, stripe:ReturnType<typeof createStripeClient>, id:string, env:StripeEnv) {
 const sub=await stripe.subscriptions.retrieve(id);const userId=sub.metadata.userId;if(!userId)return null;
 const item=sub.items.data[0];const priceId=item?.price.lookup_key||item?.price.metadata?.lovable_external_id;if(!validPaymentPlan(priceId))return null;
 const row={user_id:userId,stripe_subscription_id:sub.id,stripe_customer_id:typeof sub.customer==='string'?sub.customer:sub.customer.id,product_id:typeof item.price.product==='string'?item.price.product:item.price.product.id,price_id:priceId,status:sub.status,current_period_start:item.current_period_start?new Date(item.current_period_start*1000).toISOString():null,current_period_end:item.current_period_end?new Date(item.current_period_end*1000).toISOString():null,cancel_at_period_end:sub.cancel_at_period_end,environment:env,updated_at:new Date().toISOString()};
 const {error}=await db.from('subscriptions').upsert(row,{onConflict:'stripe_subscription_id'});if(error)throw error;return row;
}
export async function provisionCustomer(db:ReturnType<typeof createClient>, userId:string, env:StripeEnv){
 const {data,error}=await db.rpc('provision_paid_workspace',{_user:userId,_env:env,_config:{...DEFAULT_AGENT,businessName:'Your business',systemPrompt:'You are the business customer-service assistant. Answer only from approved business knowledge. If a fact is missing, say so. Never invent prices, appointments or actions. Calendar and telephone actions require separately connected services.'}});if(error)throw error;return data;
}
export async function workspaceAccess(db:ReturnType<typeof createClient>, org:string){
 const {data:workspace,error}=await db.from('customer_workspaces').select('user_id,environment').eq('organization_id',org).maybeSingle();if(error)throw error;if(!workspace)return true;
 const {data:subs,error:subError}=await db.from('subscriptions').select('status,current_period_end').eq('user_id',workspace.user_id).eq('environment',workspace.environment);if(subError)throw subError;return subs?.some(s=>paidAccess(s.status,s.current_period_end))||false;
}