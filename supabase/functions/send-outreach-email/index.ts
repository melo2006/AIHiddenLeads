import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ProspectSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string().min(1).max(500),
  email: z.string().email().nullable().optional(),
  owner_email: z.string().email().nullable().optional(),
  owner_name: z.string().max(500).nullable().optional(),
  website_url: z.string().max(2000).nullable().optional(),
  website_screenshot: z.string().max(5000).nullable().optional(),
  niche: z.string().max(200).nullable().optional(),
});

const BodySchema = z.object({
  prospects: z.array(ProspectSchema).min(1).max(50),
  subject: z.string().min(1).max(500),
  customMessage: z.string().max(2000).optional().default(''),
  templateStyle: z.enum(['phone_mockup', 'clean_card', 'browser_mockup']),
  senderName: z.string().max(200).optional().default('AgentFlow AI'),
  baseUrl: z.string().url(),
});

function buildEmailHtml(
  prospect: z.infer<typeof ProspectSchema>,
  subject: string,
  customMessage: string,
  templateStyle: string,
  demoUrl: string,
): string {
  const name = prospect.owner_name || prospect.business_name;
  const screenshotHtml = prospect.website_screenshot
    ? `<img src="${prospect.website_screenshot}" alt="${prospect.business_name} website" style="width:100%;max-height:200px;object-fit:cover;object-position:top;border-radius:8px 8px 0 0;" />`
    : '';

  if (templateStyle === 'browser_mockup') {
    const hostname = prospect.website_url ? (() => { try { const u = new URL(prospect.website_url.startsWith('http') ? prospect.website_url : `https://${prospect.website_url}`); return u.host; } catch { return prospect.website_url; } })() : prospect.business_name;

    // Dynamic screenshot: use actual website screenshot if available, otherwise a branded placeholder
    const screenshotArea = prospect.website_screenshot
      ? `<img src="${prospect.website_screenshot}" alt="${prospect.business_name} website" style="width:100%;height:280px;object-fit:cover;object-position:top;display:block;" />`
      : `<div style="height:280px;background:linear-gradient(135deg,#f8fafc,#e2e8f0);text-align:center;padding-top:100px;"><p style="font-size:20px;font-weight:700;color:#64748b;margin:0;">${prospect.business_name}</p><p style="font-size:13px;color:#94a3b8;margin:8px 0 0;">Your website, powered by AI</p></div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,0.06);">

  <!-- Greeting -->
  <tr><td style="padding:36px 36px 0;">
    <p style="margin:0;font-size:16px;color:#1f2937;line-height:1.6;">Hi ${name},</p>
    <p style="margin:14px 0 0;font-size:15px;color:#374151;line-height:1.7;">I came across <strong>${prospect.business_name}</strong> and was genuinely impressed. I had a thought — what if every visitor to your website could instantly get answers, book appointments, or speak to your team… even after hours, on weekends, or during holidays?</p>
    <p style="margin:14px 0 0;font-size:15px;color:#374151;line-height:1.7;">We built a quick mockup using <strong>your actual website</strong>. Take a look — the two AI buttons at the bottom are fully functional:</p>
  </td></tr>

  <!-- Browser Mockup with REAL website screenshot -->
  <tr><td align="center" style="padding:16px 36px 20px;">
    <div style="width:100%;max-width:520px;border-radius:12px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.14);border:1px solid #e5e7eb;">
      <!-- macOS title bar -->
      <div style="background:#f3f4f6;padding:10px 16px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td><div style="width:12px;height:12px;border-radius:50%;background:#ef4444;display:inline-block;"></div></td>
          <td style="padding-left:6px;"><div style="width:12px;height:12px;border-radius:50%;background:#f59e0b;display:inline-block;"></div></td>
          <td style="padding-left:6px;"><div style="width:12px;height:12px;border-radius:50%;background:#22c55e;display:inline-block;"></div></td>
          <td style="padding-left:12px;"><div style="background:#ffffff;border:1px solid #d1d5db;border-radius:6px;padding:4px 14px;font-size:11px;color:#6b7280;display:inline-block;">${hostname}</div></td>
        </tr></table>
      </div>
      <!-- Website screenshot with AI buttons overlaid -->
      <div style="position:relative;background:#ffffff;">
        ${screenshotArea}
        <!-- Chat AI widget - bottom left -->
        <div style="position:absolute;bottom:12px;left:12px;">
          <a href="${demoUrl}" style="display:inline-block;background:#1f2937;color:#ffffff;font-size:12px;font-weight:700;padding:9px 16px;border-radius:12px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,0.25);letter-spacing:0.3px;">💬 Chat AI</a>
        </div>
        <!-- Voice AI widget - bottom right -->
        <div style="position:absolute;bottom:12px;right:12px;">
          <a href="${demoUrl}" style="display:inline-block;background:#059669;color:#ffffff;font-size:12px;font-weight:700;padding:9px 16px;border-radius:12px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,0.25);letter-spacing:0.3px;">🎙 Voice AI</a>
        </div>
      </div>
    </div>
    <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;text-align:center;font-style:italic;">↑ This is ${prospect.business_name}'s website with AI assistants added</p>
  </td></tr>

  <!-- Benefit Bullets -->
  <tr><td style="padding:4px 36px 0;">
    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Here's what this means for ${prospect.business_name}:</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.5;">
        <span style="color:#059669;font-weight:700;font-size:16px;">✓</span>&nbsp;&nbsp;<strong>Never miss another call or lead</strong> — Your AI answers every inquiry 24/7, even holidays and weekends. No voicemail, no missed opportunities.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.5;">
        <span style="color:#059669;font-weight:700;font-size:16px;">✓</span>&nbsp;&nbsp;<strong>Book &amp; manage appointments automatically</strong> — Visitors schedule, reschedule, or cancel right from the chat or voice assistant. Zero staff time needed.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.5;">
        <span style="color:#059669;font-weight:700;font-size:16px;">✓</span>&nbsp;&nbsp;<strong>Answer complex questions instantly</strong> — Pricing, services, hours, FAQs — your AI knows your business inside and out and responds in seconds.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.5;">
        <span style="color:#059669;font-weight:700;font-size:16px;">✓</span>&nbsp;&nbsp;<strong>Warm transfer to your team when it matters</strong> — The AI qualifies callers first, then seamlessly connects high-value leads to a real person. No cold transfers, no wasted time.
      </td></tr>
    </table>
  </td></tr>

  ${customMessage ? `<tr><td style="padding:16px 36px 0;"><p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;font-style:italic;">${customMessage}</p></td></tr>` : ''}

  <!-- CTA Section -->
  <tr><td style="padding:24px 36px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">We've already set this up on a preview of <strong>your website</strong>. Click below to see it live — you can actually chat with it and even have a voice conversation about your own business. It takes 30 seconds, no signup needed.</p>
    <div style="text-align:center;">
      <a href="${demoUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#047857);color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;box-shadow:0 4px 16px rgba(5,150,105,0.35);letter-spacing:0.3px;">See Your Live AI Demo →</a>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">This personalized demo was built specifically for ${prospect.business_name}.<br/>Simple plans start at an affordable monthly rate.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 36px;border-top:1px solid #f3f4f6;">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">AgentFlow AI · Helping businesses never miss a customer again<br/><a href="mailto:unsubscribe@agentflow.ai" style="color:#9ca3af;">Unsubscribe</a></p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
  }

  if (templateStyle === 'phone_mockup') {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="padding:30px 30px 10px;text-align:center;">
    <h1 style="margin:0;font-size:24px;color:#111;">Meet Your <span style="color:#059669;">AI Employee</span></h1>
    <p style="margin:8px 0 0;font-size:14px;color:#6b7280;"><strong style="color:#059669;">Chat</strong> with it. <strong style="color:#059669;">Talk</strong> to it. Built for ${prospect.business_name}.</p>
    ${customMessage ? `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;font-style:italic;">${customMessage}</p>` : ''}
  </td></tr>
  <tr><td align="center" style="padding:20px 30px;">
    <div style="width:240px;border-radius:32px;border:6px solid #1f2937;background:#000;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.25);">
      <div style="height:24px;background:#000;"></div>
      <div style="background:#fff;min-height:300px;">
        ${screenshotHtml || `<div style="height:260px;background:linear-gradient(180deg,#f3f4f6,#e5e7eb);display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;"><p style="font-size:12px;color:#9ca3af;">${prospect.business_name}</p></div>`}
        <div style="background:linear-gradient(to top,rgba(0,0,0,0.85),transparent);padding:16px 12px 12px;">
          <a href="${demoUrl}" style="display:block;background:#059669;color:#fff;font-size:13px;font-weight:bold;padding:10px 16px;border-radius:10px;text-align:center;text-decoration:none;">Try Your AI Demo →</a>
        </div>
      </div>
      <div style="height:18px;background:#000;"></div>
    </div>
  </td></tr>
  <tr><td style="padding:10px 30px 20px;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0 0 16px;">Tap to chat or talk with your AI employee — built specifically for ${prospect.business_name}.</p>
    <a href="${demoUrl}" style="display:inline-block;background:#059669;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Try Your Personalized Demo →</a>
  </td></tr>
  <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Powered by AgentFlow AI</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  }

  // clean_card
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="padding:30px;">
    <p style="font-size:15px;color:#374151;margin:0 0 12px;">Hi ${name},</p>
    ${customMessage ? `<p style="font-size:14px;color:#6b7280;margin:0 0 12px;">${customMessage}</p>` : ''}
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">We built a quick, personalized AI demo specifically for your business. It shows how an AI receptionist could handle your calls 24/7, book appointments, and never miss a lead.</p>
  </td></tr>
  <tr><td style="padding:0 30px 20px;">
    <div style="border:2px solid #a7f3d0;border-radius:12px;overflow:hidden;background:#ecfdf5;">
      ${screenshotHtml}
      <div style="padding:20px;">
        <p style="font-size:16px;font-weight:bold;color:#111;margin:0 0 4px;">${prospect.business_name}</p>
        <p style="font-size:12px;color:#6b7280;margin:0 0 16px;">Personalized AI Demo Ready</p>
        <table width="100%" cellpadding="0" cellspacing="8"><tr>
          <td style="background:#fff;border:1px solid #d1fae5;border-radius:8px;padding:8px;text-align:center;"><strong style="font-size:14px;">24/7</strong><br><span style="font-size:10px;color:#6b7280;">Coverage</span></td>
          <td style="background:#fff;border:1px solid #d1fae5;border-radius:8px;padding:8px;text-align:center;"><strong style="font-size:14px;">Chat+Voice</strong><br><span style="font-size:10px;color:#6b7280;">AI Agents</span></td>
          <td style="background:#fff;border:1px solid #d1fae5;border-radius:8px;padding:8px;text-align:center;"><strong style="font-size:14px;">Live</strong><br><span style="font-size:10px;color:#6b7280;">Demo</span></td>
        </tr></table>
        <div style="text-align:center;margin-top:16px;">
          <a href="${demoUrl}" style="display:inline-block;background:#059669;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Watch Your Demo →</a>
        </div>
      </div>
    </div>
  </td></tr>
  <tr><td style="padding:10px 30px 20px;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Powered by AgentFlow AI</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'RESEND_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { prospects, subject, customMessage, templateStyle, senderName, baseUrl } = parsed.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // RBAC Phase 1 (2026-11-20, rbac-admin-design.md §4): campaign
    // SEND is a permission (campaigns:send), enforced here at the
    // server boundary — this function previously accepted calls with
    // no caller check at all. The decision comes from the database
    // has_permission(); while that migration is not yet applied, the
    // pre-RBAC platform-admin signals (a voice_platform_roles row, or
    // the is_admin_email allowlist) decide instead, so the rollout
    // cannot lock out the people who send campaigns today.
    const authHeader = req.headers.get('Authorization') ?? '';
    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sign in required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    let sendAllowed = false;
    try {
      const { data, error } = await supabase.rpc('has_permission', {
        _user: user.id, _area: 'campaigns', _action: 'send', _scope_type: 'platform', _scope_id: null,
      });
      if (error) throw error;
      sendAllowed = data === true;
    } catch {
      const [{ data: roleRow }, { data: isAdmin }] = await Promise.all([
        supabase.from('voice_platform_roles').select('role').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('is_admin_email', { _email: user.email ?? '' }),
      ]);
      sendAllowed = Boolean(roleRow) || isAdmin === true;
    }
    if (!sendAllowed) {
      return new Response(
        JSON.stringify({ success: false, error: 'You do not have permission to send campaigns' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const prospect of prospects) {
      const recipientEmail = prospect.owner_email || prospect.email;
      if (!recipientEmail) {
        results.push({ id: prospect.id, success: false, error: 'No email address' });
        continue;
      }

      const rawDemoUrl = `${baseUrl}/demo?url=${encodeURIComponent(prospect.website_url || '')}&name=${encodeURIComponent(prospect.business_name)}&niche=${encodeURIComponent(prospect.niche || '')}&prospectId=${encodeURIComponent(prospect.id)}`;
      // Wrap demo link through tracking endpoint for speed-to-lead
      const trackingBase = `${supabaseUrl}/functions/v1/track-engagement`;
      const demoUrl = `${trackingBase}?pid=${prospect.id}&event=demo_view&redirect=${encodeURIComponent(rawDemoUrl)}`;
      let html = buildEmailHtml(prospect, subject, customMessage, templateStyle, demoUrl);
      // Inject open-tracking pixel at end of email body
      const openPixelUrl = `${trackingBase}?pid=${prospect.id}&event=open`;
      html = html.replace('</body>', `<img src="${openPixelUrl}" width="1" height="1" style="display:none" alt="" /></body>`);

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${senderName} <onboarding@resend.dev>`,
            to: [recipientEmail],
            subject: subject,
            html: html,
          }),
        });

        const emailData = await emailRes.json();

        if (!emailRes.ok) {
          results.push({ id: prospect.id, success: false, error: emailData?.message || `Resend error ${emailRes.status}` });
          continue;
        }

        // Update prospect with sent timestamp and demo link
        await supabase
          .from('prospects')
          .update({
            email_sent_at: new Date().toISOString(),
            demo_link: demoUrl,
            pipeline_stage: 'contacted',
            last_contacted_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);

        results.push({ id: prospect.id, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        results.push({ id: prospect.id, success: false, error: msg });
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    // RBAC audit (best-effort): every campaign send lands in the
    // audit log the Team page reads. A missing audit table (migration
    // not applied yet) never fails a send that already happened.
    try {
      await supabase.from('audit_log').insert({
        actor_user_id: user.id,
        action: 'campaign.sent',
        area: 'campaigns',
        target_type: 'campaign',
        target_id: null,
        scope_type: 'platform',
        summary: { recipients: prospects.length, sent, failed, subject },
      });
    } catch { /* audit is a record, not a gate */ }

    return new Response(
      JSON.stringify({ success: true, sent, failed, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Send outreach error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
