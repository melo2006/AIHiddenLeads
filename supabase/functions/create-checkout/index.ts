import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { createStripeClient } from '../_shared/stripe.ts';
import { PAYMENT_PLANS, validPaymentPlan, CUSTOM_AVATAR_PRICE, MINUTE_PACKS, validMinutePack, VIDEO_AVATAR_PRICE, validVideoAvatarPrice, priceMatchesVideoAvatar } from '../_shared/payment-rules.ts';
import { AVATAR_TRIAL_DAYS, avatarStartMode } from '../_shared/avatar-trial.ts';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
async function resolveOrCreateCustomer(stripe: ReturnType<typeof createStripeClient>, options:{email?:string;userId?:string}):Promise<string>{
 if(options.userId&&!/^[a-zA-Z0-9_-]+$/.test(options.userId))throw new Error('Invalid userId');
 if(options.userId){const found=await stripe.customers.search({query:`metadata['userId']:'${options.userId}'`,limit:1});if(found.data.length)return found.data[0].id;}
 if(options.email){const existing=await stripe.customers.list({email:options.email,limit:1});if(existing.data.length){const customer=existing.data[0];if(options.userId&&customer.metadata?.userId!==options.userId)await stripe.customers.update(customer.id,{metadata:{...customer.metadata,userId:options.userId}});return customer.id;}}
 const created=await stripe.customers.create({...(options.email&&{email:options.email}),...(options.userId&&{metadata:{userId:options.userId}})});return created.id;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});if(req.method!=='POST')return json({error:'POST required'},405);
 try{
 const body=z.object({priceId:z.string(),environment:z.enum(['sandbox','live']),returnUrl:z.string().url(),customAvatar:z.boolean().optional(),videoAvatar:z.boolean().optional(),organizationId:z.string().uuid().optional(),organization_id:z.string().uuid().optional()}).safeParse(await req.json());if(!body.success||!(validPaymentPlan(body.data.priceId)||body.data.priceId===CUSTOM_AVATAR_PRICE.id||validMinutePack(body.data.priceId)||validVideoAvatarPrice(body.data.priceId)))return json({error:'Invalid checkout plan'},400);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 const {data:{user}}=await db.auth.getUser(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'');if(!user?.email_confirmed_at)return json({error:'Sign in with a verified account to continue'},401);
 const b=body.data;const target=new URL(b.returnUrl);const origin=req.headers.get('origin');if(!origin||target.origin!==origin||target.pathname!=='/checkout/return')return json({error:'Invalid return destination'},400);
 if(b.priceId===CUSTOM_AVATAR_PRICE.id){
  // Add-later purchase for existing customers: one-time payment, requires an active plan.
  const {data:active}=await db.from('subscriptions').select('id').eq('user_id',user.id).eq('environment',b.environment).in('status',['active','trialing']).limit(1);if(!active?.length)return json({error:'Choose a plan first; you can add the custom avatar at checkout.'},409);
  const stripe=createStripeClient(b.environment);const extra=(await stripe.prices.list({lookup_keys:[CUSTOM_AVATAR_PRICE.id],active:true,expand:['data.product']})).data[0];if(!extra||extra.unit_amount!==CUSTOM_AVATAR_PRICE.amount||extra.currency!=='usd'||extra.recurring)return json({error:'Custom avatar option is unavailable'},400);
  const customer=await resolveOrCreateCustomer(stripe,{userId:user.id,email:user.email});const name=typeof extra.product==='object'&&'name' in extra.product?extra.product.name:'Custom Avatar From Your Photo';
  const session=await stripe.checkout.sessions.create({line_items:[{price:extra.id,quantity:1}],mode:'payment',ui_mode:'embedded_page',return_url:b.returnUrl,customer,automatic_tax:{enabled:true},customer_update:{address:'auto'},payment_intent_data:{description:name},metadata:{userId:user.id,custom_avatar:'true',managed_payments:'false'}});
  return json({clientSecret:session.client_secret});
 }
 if(validVideoAvatarPrice(b.priceId)){
  // Video avatar add-on (pricing cleanup, 2026-11-12): a subscription of
  // its own for existing customers — $79/mo flat on any plan, first month
  // free via a Stripe trial when the business has not used its free month
  // (one per business; see _shared/avatar-trial.ts). Mirrors the
  // minute-pack branch: active plan required, price resolved by lookup
  // key and validated against the code-owned catalog before any session.
  const {data:active}=await db.from('subscriptions').select('id,price_id').eq('user_id',user.id).eq('environment',b.environment).in('status',['active','trialing']).limit(20);const planRow=(active||[]).find(r=>validPaymentPlan(r.price_id));if(!planRow)return json({error:'Choose a plan first; the video avatar is an add-on to a plan.'},409);
  const {data:avatarRows}=await db.from('subscriptions').select('id').eq('user_id',user.id).eq('environment',b.environment).eq('price_id',VIDEO_AVATAR_PRICE.id).in('status',['active','trialing','past_due']).limit(1);if(avatarRows?.length)return json({error:'The video avatar is already on your account.'},409);
  let priorTrials=0;try{const {count}=await db.from('video_avatar_trials').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('environment',b.environment);priorTrials=count||0;}catch{priorTrials=0;}
  const mode=avatarStartMode({hasLiveAvatarSubscription:false,priorTrialCount:priorTrials});
  const stripe=createStripeClient(b.environment);const price=(await stripe.prices.list({lookup_keys:[VIDEO_AVATAR_PRICE.id],active:true})).data[0];if(!priceMatchesVideoAvatar(price))return json({error:'Video avatar option is unavailable'},400);
  const customer=await resolveOrCreateCustomer(stripe,{userId:user.id,email:user.email});
  const session=await stripe.checkout.sessions.create({line_items:[{price:price.id,quantity:1}],mode:'subscription',ui_mode:'embedded_page',return_url:b.returnUrl,customer,automatic_tax:{enabled:true},customer_update:{address:'auto'},metadata:{userId:user.id,kind:'video_avatar',managed_payments:'false'},subscription_data:{...(mode==='trial'?{trial_period_days:AVATAR_TRIAL_DAYS}:{}),metadata:{userId:user.id,kind:'video_avatar',plan:planRow.price_id,source:'addon_checkout'}}});
  return json({clientSecret:session.client_secret});
 }
 if(validMinutePack(b.priceId)){
  // One-time minute pack for existing customers (Usage Reporting Suite):
  // mirrors the custom-avatar branch — active plan required, price resolved
  // by lookup key and validated against the code-owned MINUTE_PACKS catalog.
  const pack=MINUTE_PACKS[b.priceId];const organizationId=b.organizationId||b.organization_id||null;
  const {data:active}=await db.from('subscriptions').select('id').eq('user_id',user.id).eq('environment',b.environment).in('status',['active','trialing']).limit(1);if(!active?.length)return json({error:'Choose a plan first; you can add minute packs at checkout.'},409);
  const stripe=createStripeClient(b.environment);const extra=(await stripe.prices.list({lookup_keys:[b.priceId],active:true,expand:['data.product']})).data[0];if(!extra||extra.unit_amount!==pack.amount||extra.currency!=='usd'||extra.recurring)return json({error:'Minute pack is unavailable'},400);
  const customer=await resolveOrCreateCustomer(stripe,{userId:user.id,email:user.email});const name=typeof extra.product==='object'&&'name' in extra.product?extra.product.name:`${pack.minutes} voice minutes`;
  const session=await stripe.checkout.sessions.create({line_items:[{price:extra.id,quantity:1}],mode:'payment',ui_mode:'embedded_page',return_url:b.returnUrl,customer,automatic_tax:{enabled:true},customer_update:{address:'auto'},payment_intent_data:{description:name},metadata:{userId:user.id,kind:'minute_pack',pack_id:b.priceId,managed_payments:'false',...(organizationId?{organization_id:organizationId}:{})}});
  return json({clientSecret:session.client_secret});
 }
 const {data:existing}=await db.from('subscriptions').select('id').eq('user_id',user.id).eq('environment',b.environment).in('status',['active','past_due','trialing']).limit(1);if(existing?.length)return json({error:'You already have a subscription. Change your plan from customer setup.'},409);
 const stripe=createStripeClient(b.environment);const prices=await stripe.prices.list({lookup_keys:[b.priceId],active:true});const price=prices.data[0];if(!price||price.unit_amount!==PAYMENT_PLANS[b.priceId]||price.currency!=='usd'||price.recurring?.interval!=='month')return json({error:'Plan pricing is unavailable'},400);
 const items=[{price:price.id,quantity:1}];
 if(b.customAvatar){const extra=(await stripe.prices.list({lookup_keys:[CUSTOM_AVATAR_PRICE.id],active:true})).data[0];if(!extra||extra.unit_amount!==CUSTOM_AVATAR_PRICE.amount||extra.currency!=='usd'||extra.recurring)return json({error:'Custom avatar option is unavailable'},400);items.push({price:extra.id,quantity:1});}
 const customer=await resolveOrCreateCustomer(stripe,{userId:user.id,email:user.email});
 const session=await stripe.checkout.sessions.create({line_items:items,mode:'subscription',ui_mode:'embedded_page',return_url:b.returnUrl,customer,automatic_tax:{enabled:true},customer_update:{address:'auto'},metadata:{userId:user.id,plan:b.priceId,managed_payments:'false',custom_avatar:b.customAvatar?'true':'false',video_avatar:b.videoAvatar?'true':'false'},subscription_data:{metadata:{userId:user.id,plan:b.priceId}}});
 return json({clientSecret:session.client_secret});
 }catch(e){return json({error:e instanceof Error?e.message:'Checkout failed'},500);}
});
