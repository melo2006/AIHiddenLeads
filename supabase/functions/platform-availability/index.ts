import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { platformAvailability } from '../_shared/platform-calendar.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    return json({ slots: await platformAvailability(db), timeZone: 'America/New_York', calendarVerified: true });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Availability could not be checked', slots: [], calendarVerified: false }, 503); }
});