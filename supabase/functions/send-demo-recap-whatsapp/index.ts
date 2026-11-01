// Send a demo recap message to a lead via WhatsApp (Twilio).
//
// Twilio WhatsApp uses `whatsapp:+<E164>` addressing.
// Set TWILIO_WHATSAPP_FROM to your approved WhatsApp business sender
// (or use the Twilio sandbox number `+14155238886` for testing — the
// recipient must first opt in by texting the sandbox join code).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEFAULT_WHATSAPP_FROM = '+14155238886'; // Twilio sandbox; override with TWILIO_WHATSAPP_FROM secret

const BodySchema = z.object({
  leadId: z.string().uuid().optional(),
  phone: z.string().trim().min(7).max(30),
  fullName: z.string().trim().max(200).optional().default(''),
  businessName: z.string().trim().max(300).optional().default(''),
  websiteUrl: z.string().trim().max(2000).optional().default(''),
  demoUrl: z.string().trim().max(2000).optional().default(''),
  bookingUrl: z.string().trim().max(2000).optional().default(''),
  customMessage: z.string().trim().max(1200).optional().default(''),
});

const toE164 = (raw: string): string | null => {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  // Default to US country code for 10-digit numbers; otherwise prepend +
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
};

const buildBody = (b: z.infer<typeof BodySchema>) => {
  if (b.customMessage) return b.customMessage;
  const name = b.fullName?.split(' ')[0] || 'there';
  const biz = b.businessName || 'your business';
  const lines = [
    `Hi ${name}! 👋 Thanks for trying the AI demo for ${biz}.`,
    '',
    `Here's the recap & live demo link:`,
    b.demoUrl || b.websiteUrl,
  ].filter(Boolean);
  if (b.bookingUrl) {
    lines.push('', `Want to deploy it on your own site? Book a 15-min call:`, b.bookingUrl);
  }
  lines.push('', '— AI Hidden Leads', '(Reply STOP to opt out)');
  return lines.join('\n');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Twilio connector is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const body = parsed.data;

    const to = toE164(body.phone);
    if (!to) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Respect opt-outs
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: optOut } = await supabase
      .from('sms_opt_outs')
      .select('phone')
      .eq('phone', to)
      .maybeSingle();
    if (optOut) {
      return new Response(
        JSON.stringify({ success: false, error: 'Recipient has opted out' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const configuredFrom = Deno.env.get('TWILIO_WHATSAPP_FROM');
    if (!configuredFrom) {
      console.warn('TWILIO_WHATSAPP_FROM is not configured; skipping WhatsApp recap');
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: 'whatsapp_sender_not_configured',
          error:
            'WhatsApp recaps are not enabled yet: no approved WhatsApp sender number is configured (TWILIO_WHATSAPP_FROM).',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const from = toE164(configuredFrom) || DEFAULT_WHATSAPP_FROM;
    const messageBody = buildBody(body);

    const twilioResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${from}`,
        Body: messageBody,
      }),
    });

    const twilioData = await twilioResp.json();
    if (!twilioResp.ok) {
      console.error('Twilio WhatsApp error', twilioResp.status, twilioData);
      const senderNotEnabled = twilioData?.code === 63007;
      return new Response(
        JSON.stringify({
          success: false,
          skipped: senderNotEnabled,
          reason: senderNotEnabled ? 'whatsapp_sender_not_enabled' : undefined,
          error: senderNotEnabled
            ? `The WhatsApp sender ${from} is not an approved WhatsApp channel on the connected Twilio account.`
            : twilioData?.message || 'Twilio send failed',
          code: twilioData?.code,
        }),
        {
          status: senderNotEnabled ? 200 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Log delivery
    try {
      await supabase.from('sms_delivery_log').insert({
        lead_id: body.leadId ?? null,
        phone: to,
        message: messageBody,
        provider: 'twilio_whatsapp',
        provider_message_id: twilioData?.sid ?? null,
        status: twilioData?.status ?? 'queued',
        channel: 'whatsapp',
      });
    } catch (logErr) {
      console.warn('sms_delivery_log insert failed (non-fatal):', logErr);
    }

    return new Response(
      JSON.stringify({ success: true, sid: twilioData.sid, status: twilioData.status, to, from }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('send-demo-recap-whatsapp fatal:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
