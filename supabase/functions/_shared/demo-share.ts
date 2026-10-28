import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
export async function sha256(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export const validShareToken=(t:unknown):t is string=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
/** Resolves an unexpired, unrevoked client-demo link to its agent; never accepts agent ids from the visitor. */
export async function resolveDemoShare(db:SupabaseClient,token:string){
  if(!validShareToken(token))return null;
  const {data}=await db.from('voice_demo_shares').select('agent_id,expires_at,revoked_at').eq('token_hash',await sha256(token)).maybeSingle();
  if(!data||data.revoked_at||new Date(data.expires_at).getTime()<Date.now())return null;
  const {data:agent}=await db.from('voice_agents').select('*').eq('id',data.agent_id).maybeSingle();
  return agent;
}
