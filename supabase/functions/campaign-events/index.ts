import {createClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {campaignEventSchema as schema} from '../_shared/campaign-events-schema.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method!=='POST')return json({error:'POST required'},405);
 try {const p=schema.safeParse(await req.json());if(!p.success)return json({error:'Invalid milestone'},400);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 const {visitId,leadId,...data}=p.data;
 const {error}=await db.from('campaign_visit_events').upsert({...data,visit_id:visitId,lead_id:leadId??null},{onConflict:'visit_id,event,path',ignoreDuplicates:true});
 if(error)throw error;return json({saved:true});
 }catch{ return json({error:'Milestone could not be saved'},500); }
});