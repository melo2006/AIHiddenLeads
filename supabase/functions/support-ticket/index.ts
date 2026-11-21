import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { sendOwnerMail, supportTicketAlert } from '../_shared/hostinger-mail.ts';

// Support ticket intake for the /help page form (Ron's order,
// 2026-11-21). A submission is a REAL ticket: validated here, stored
// in public.support_tickets by the service role (the table is
// service-role only — browsers never touch it directly), and emailed
// to the owner mailbox via the shared Hostinger path. The visitor
// gets the ticket reference back for follow-ups. Public endpoint
// (verify_jwt = false in config.toml): it accepts no caller-supplied
// ids or destinations, and the only writes are the ticket row and
// the owner email.
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  businessName: z.string().trim().max(150).default(''),
  email: z.string().trim().email().max(255),
  topic: z.enum(['Setup', 'Installation', 'CRM & integrations', 'Billing', 'Technical problem', 'Other']),
  urgency: z.enum(['Low', 'Normal', 'High', 'Urgent']).default('Normal'),
  message: z.string().trim().min(10).max(5000),
});

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Please add your name, a valid email, a topic and a few words about the problem.' }, 400);
    const t = parsed.data;
    const id = crypto.randomUUID();
    const reference = `AHL-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const { error } = await db.from('support_tickets').insert({
      id,
      reference,
      name: t.name,
      business_name: t.businessName,
      email: t.email,
      topic: t.topic,
      urgency: t.urgency,
      message: t.message,
    });
    if (error) throw new Error(`Ticket could not be saved: ${error.message}`);
    // The ticket exists from here on; the owner email is the second
    // half of the promise, but a mail hiccup must not tell the visitor
    // their saved ticket failed. Log it and still return the reference.
    try {
      await sendOwnerMail(supportTicketAlert({ reference, name: t.name, businessName: t.businessName, email: t.email, topic: t.topic, urgency: t.urgency, message: t.message }));
    } catch (mailError) {
      console.error('support-ticket: owner email failed', mailError);
    }
    return json({ ok: true, reference });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Ticket could not be sent' }, 500);
  }
});
