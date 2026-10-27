import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { OWNER_MAILBOX, sendOwnerMail } from '../_shared/hostinger-mail.ts';

// Sends a fixed test message only to the owner's own inbox; no caller input is used.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    await sendOwnerMail({
      to: OWNER_MAILBOX,
      subject: 'AI Hidden Leads – mailbox test',
      text: `This is a test from your AI Hidden Leads app, sent through your Hostinger mailbox at ${new Date().toISOString()}.`,
    });
    return new Response(JSON.stringify({ sent: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ sent: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
