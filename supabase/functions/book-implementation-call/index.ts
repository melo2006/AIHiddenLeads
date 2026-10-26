import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { bookPlatformCall } from '../_shared/platform-calendar.ts';
const schema = z.object({ name:z.string().trim().min(1).max(100), email:z.string().trim().email().max(255), phone:z.string().trim().max(30).default(''), businessName:z.string().trim().max(150).default(''), notes:z.string().trim().max(1000).default(''), slotStart:z.string().datetime(), confirmed:z.literal(true) });
Deno.serve(async req => {
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'POST required'},405);
 try {
  const parsed=schema.safeParse(await req.json()); if(!parsed.success)return json({error:'Confirm your name, email and selected appointment time.'},400);
  const db=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  return json(await bookPlatformCall(db,parsed.data));
 } catch(e){return json({error:e instanceof Error?e.message:'Booking could not be confirmed'},409);}
});
