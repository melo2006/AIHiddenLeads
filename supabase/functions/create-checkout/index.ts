import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { createStripeClient } from '../_shared/stripe.ts';
import { PAYMENT_PLANS, validPaymentPlan } from '../_shared/payment-rules.ts';
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
 const body=z.object({priceId:z.string(),environment:z.enum(['sandbox','live']),returnUrl:z.string().url()}).safeParse(await req.json());if(!body.success||!validPaymentPlan(body.data.priceId))return json({error:'Invalid checkout plan'},400);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 const {data:{user}}=await db.auth.getUser(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'');if(!user?.email_confirmed_at)return json({error:'Sign in with a verified account to continue'},401);
 const b=body.data;const target=new URL(b.returnUrl);const origin=req.headers.get('origin');if(!origin||target.origin!==origin||target.pathname!=='/checkout/return')return json({error:'Invalid return destination'},400);
 const {data:existing}=await db.from('subscriptions').select('id').eq('user_id',user.id).eq('environment',b.environment).in('status',['active','past_due','trialing']).limit(1);if(existing?.length)return json({error:'You already have a subscription. Change your plan from customer setup.'},409);
 const stripe=createStripeClient(b.environment);const prices=await stripe.prices.list({lookup_keys:[b.priceId],active:true});const price=prices.data[0];if(!price||price.unit_amount!==PAYMENT_PLANS[b.priceId]||price.currency!=='usd'||price.recurring?.interval!=='month')return json({error:'Plan pricing is unavailable'},400);
 const customer=await resolveOrCreateCustomer(stripe,{userId:user.id,email:user.email});
 const session=await stripe.checkout.sessions.create({line_items:[{price:price.id,quantity:1}],mode:'subscription',ui_mode:'embedded_page',return_url:b.returnUrl,customer,automatic_tax:{enabled:true},customer_update:{address:'auto'},metadata:{userId:user.id,plan:b.priceId,managed_payments:'false'},subscription_data:{metadata:{userId:user.id,plan:b.priceId}}});
 return json({clientSecret:session.client_secret});
 }catch(e){return json({error:e instanceof Error?e.message:'Checkout failed'},500);}
});
