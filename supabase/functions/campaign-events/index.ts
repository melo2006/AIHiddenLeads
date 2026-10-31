import {createClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {z} from 'npm:zod@3';
import {validMilestone} from '../_shared/report-context.ts';
const schema=z.object({visitId:z.string().uuid(),event:z.enum(['page_view','scan_started','voice_started','voice_ended','section_view']),path:z.string().max(100),source:z.string().max(100).regex(/^[\w .-]*$/),campaign:z.string().max(100).regex(/^[\w .-]*$/)}).refine(b=>validMilestone(b.event,b.path));
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method!=='POST')return json({error:'POST required'},405);
 try {const p=schema.safeParse(await req.json());if(!p.success)return json({error:'Invalid milestone'},400);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 const {visitId,...data}=p.data;
 const {error}=await db.from('campaign_visit_events').upsert({...data,visit_id:visitId},{onConflict:'visit_id,event,path',ignoreDuplicates:true});
 if(error)throw error;return json({saved:true});
 }catch{ return json({error:'Milestone could not be saved'},500); }
});