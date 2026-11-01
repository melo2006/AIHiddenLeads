import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TWILIO_CALLER_ID = '+15612755757';

const OPT_OUT = `\n\nWant to keep getting new leads? Great — do nothing! Reply STOP to opt out.`;

const ProspectSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string().min(1).max(500),
  phone: z.string().max(30).nullable().optional(),
  owner_name: z.string().max(500).nullable().optional(),
  website_url: z.string().max(2000).nullable().optional(),
  website_screenshot: z.string().max(4000).nullable().optional(),
  niche: z.string().max(200).nullable().optional(),
});

const BodySchema = z.object({
  prospects: z.array(ProspectSchema).min(1).max(50),
  smsTemplateId: z.string().max(100).optional().default('quick_demo'),
  customMessage: z.string().max(500).optional().default(''),
  baseUrl: z.string().url(),
  testMode: z.boolean().optional().default(false),
  testPhone: z.string().max(30).optional(),
});

// ── Template definitions ──────────────────────
type Prospect = z.infer<typeof ProspectSchema>;

const pName = (p: Prospect) => p.owner_name?.trim() || p.business_name;

const TEMPLATES: Record<string, { mms: boolean; body: (p: Prospect, demoUrl: string) => string }> = {
  quick_demo: {
    mms: false,
    body: (p, url) =>
      `Hi ${pName(p)}! We built a quick AI demo for ${p.business_name} — see Chat AI & Voice AI live on your site.\n\nTry it now, it's totally free:\n${url}\n\n— AI Hidden Leads${OPT_OUT}`,
  },
  quick_demo_mms: {
    mms: true,
    body: (p, url) =>
      `Hi ${pName(p)}! We built a quick AI demo for ${p.business_name} — see Chat AI & Voice AI live on your site.\n\nTry it now, it's totally free:\n${url}\n\n— AI Hidden Leads${OPT_OUT}`,
  },
  missed_calls: {
    mms: false,
    body: (p, url) =>
      `Hey ${pName(p)}, have you missed any leads lately from calls going to voicemail or visitors leaving your site?\n\nI built a Voice AI that talks to your customers, takes notes, books appointments & transfers qualified leads to you live.\n\nCheck out what I set up for ${p.business_name}:\n${url}\n\n— AI Hidden Leads${OPT_OUT}`,
  },
  industry_fomo: {
    mms: false,
    body: (p, url) =>
      `Hi ${pName(p)}, most ${p.niche || 'business'} owners in your area are missing out by not answering calls fast enough.\n\nI built an AI assistant for ${p.business_name} that picks up every call, answers FAQs, and books appointments 24/7.\n\nSee it in action — totally free:\n${url}\n\n— AI Hidden Leads${OPT_OUT}`,
  },
  industry_fomo_mms: {
    mms: true,
    body: (p, url) =>
      `Hi ${pName(p)}, most ${p.niche || 'business'} owners in your area are missing out by not answering calls fast enough.\n\nI built an AI assistant for ${p.business_name} that picks up every call, answers FAQs, and books appointments 24/7.\n\nSee it in action — totally free:\n${url}\n\n— AI Hidden Leads${OPT_OUT}`,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { prospects, smsTemplateId, customMessage, baseUrl, testMode, testPhone } = parsed.data;
    const template = TEMPLATES[smsTemplateId] ?? TEMPLATES['quick_demo'];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check do_not_contact flag
    const prospectIds = prospects.map(p => p.id);
    const { data: dncRows } = await supabase
      .from('prospects')
      .select('id, do_not_contact')
      .in('id', prospectIds)
      .eq('do_not_contact', true);
    const dncSet = new Set((dncRows || []).map(r => r.id));

    const results: { id: string; success: boolean; error?: string; messageSid?: string }[] = [];

    for (const prospect of prospects) {
      if (dncSet.has(prospect.id)) {
        results.push({ id: prospect.id, success: false, error: 'Do-not-contact flagged' });
        continue;
      }

      const phone = prospect.phone;
      if (!phone) {
        results.push({ id: prospect.id, success: false, error: 'No phone number' });
        continue;
      }

      // Normalize phone
      const digits = phone.replace(/\D/g, '');
      let normalizedPhone = phone.trim();
      if (digits.length === 10) normalizedPhone = `+1${digits}`;
      else if (digits.length === 11 && digits.startsWith('1')) normalizedPhone = `+${digits}`;
      else if (!normalizedPhone.startsWith('+')) normalizedPhone = `+${digits}`;

      // In test mode, override the destination number
      const destinationPhone = testMode && testPhone ? testPhone : normalizedPhone;

      const demoUrl = `${baseUrl}/demo?url=${encodeURIComponent(prospect.website_url || '')}&name=${encodeURIComponent(prospect.business_name)}&niche=${encodeURIComponent(prospect.niche || '')}&prospectId=${encodeURIComponent(prospect.id)}`;

      const smsBody = customMessage
        ? `${customMessage}\n\nTry it now:\n${demoUrl}\n\n— AI Hidden Leads${OPT_OUT}`
        : template.body(prospect, demoUrl);

      try {
        const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-sms-status`;
        const params: Record<string, string> = {
          To: destinationPhone,
          From: TWILIO_CALLER_ID,
          Body: smsBody,
          StatusCallback: statusCallbackUrl,
        };

        // Attach screenshot as MMS if template is MMS and screenshot exists
        if (template.mms && prospect.website_screenshot) {
          params.MediaUrl = prospect.website_screenshot;
        }

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(params),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          await supabase.from('sms_delivery_log').insert({
            prospect_id: prospect.id,
            to_phone: destinationPhone,
            from_phone: TWILIO_CALLER_ID,
            body: smsBody,
            template_id: smsTemplateId,
            status: 'failed',
            error_code: data?.code ? String(data.code) : null,
            error_message: data?.message || `Twilio error ${response.status}`,
            is_test: testMode,
          });
          results.push({
            id: prospect.id,
            success: false,
            error: data?.message || `Twilio error ${response.status}`,
          });
          continue;
        }

        console.log(`SMS sent to ${destinationPhone} for ${prospect.business_name}: ${data?.sid}${testMode ? ' [TEST]' : ''}`);

        await supabase.from('sms_delivery_log').insert({
          prospect_id: prospect.id,
          message_sid: data?.sid || null,
          to_phone: destinationPhone,
          from_phone: TWILIO_CALLER_ID,
          body: smsBody,
          template_id: smsTemplateId,
          status: (data?.status || 'queued').toLowerCase(),
          segments: data?.num_segments ? Number(data.num_segments) : null,
          price_usd: data?.price ? Math.abs(Number(data.price)) : null,
          is_test: testMode,
        });

        // Only update prospect in non-test mode
        if (!testMode) {
          await supabase
            .from('prospects')
            .update({
              sms_sent_at: new Date().toISOString(),
              demo_link: demoUrl,
              pipeline_stage: 'contacted',
              last_contacted_at: new Date().toISOString(),
            })
            .eq('id', prospect.id);
        }

        results.push({ id: prospect.id, success: true, messageSid: data?.sid });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'SMS send failed';
        await supabase.from('sms_delivery_log').insert({
          prospect_id: prospect.id,
          to_phone: destinationPhone,
          from_phone: TWILIO_CALLER_ID,
          body: smsBody,
          template_id: smsTemplateId,
          status: 'failed',
          error_message: msg,
          is_test: testMode,
        });
        results.push({ id: prospect.id, success: false, error: msg });
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({ success: true, sent, failed, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Send outreach SMS error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
