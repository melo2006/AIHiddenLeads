import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!resendKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find all enrollments that are active and due to send
    const { data: dueEnrollments, error: fetchErr } = await supabase
      .from('prospect_sequence_enrollments')
      .select('*')
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString());

    if (fetchErr) throw fetchErr;
    if (!dueEnrollments || dueEnrollments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No emails due' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sent = 0;
    let failed = 0;
    let completed = 0;

    for (const enrollment of dueEnrollments) {
      try {
        // Get the current step
        const { data: step } = await supabase
          .from('campaign_sequence_steps')
          .select('*')
          .eq('sequence_id', enrollment.sequence_id)
          .eq('step_number', enrollment.current_step)
          .single();

        if (!step) {
          // No more steps — mark enrollment as completed
          await supabase
            .from('prospect_sequence_enrollments')
            .update({ status: 'completed' })
            .eq('id', enrollment.id);
          completed++;
          continue;
        }

        // Get the sequence to check if it's still active
        const { data: sequence } = await supabase
          .from('campaign_sequences')
          .select('*, campaigns(*)')
          .eq('id', enrollment.sequence_id)
          .single();

        if (!sequence || sequence.status !== 'active') {
          continue; // Skip paused/draft sequences
        }

        // Get prospect data
        const { data: prospect } = await supabase
          .from('prospects')
          .select('*')
          .eq('id', enrollment.prospect_id)
          .single();

        if (!prospect) {
          await supabase
            .from('prospect_sequence_enrollments')
            .update({ status: 'completed' })
            .eq('id', enrollment.id);
          continue;
        }

        const recipientEmail = prospect.owner_email || prospect.email;
        if (!recipientEmail) {
          await supabase
            .from('prospect_sequence_enrollments')
            .update({ status: 'completed' })
            .eq('id', enrollment.id);
          continue;
        }

        // Build demo URL
        const baseUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '') || 'https://aihiddenleads.com';
        const appUrl = 'https://aihiddenleads.com';
        const demoUrl = `${appUrl}/demo?url=${encodeURIComponent(prospect.website_url || '')}&name=${encodeURIComponent(prospect.business_name)}&niche=${encodeURIComponent(prospect.niche || '')}&prospectId=${encodeURIComponent(prospect.id)}`;

        // Build personalized subject with merge fields
        const subject = step.email_subject
          .replace(/\{business_name\}/g, prospect.business_name)
          .replace(/\{owner_name\}/g, prospect.owner_name || prospect.business_name);

        // Build email body — use a simple but effective follow-up template
        const name = prospect.owner_name || prospect.business_name;
        const stepNum = step.step_number;
        
        const emailHtml = buildDripEmail(name, prospect.business_name, demoUrl, stepNum, subject, prospect.website_screenshot);

        // Send via Resend
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'AI Hidden Leads <onboarding@resend.dev>',
            to: [recipientEmail],
            subject,
            html: emailHtml,
          }),
        });

        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          console.error(`Resend error for ${prospect.id}:`, errBody);
          failed++;
          continue;
        }

        // Update step metrics
        await supabase
          .from('campaign_sequence_steps')
          .update({ sent_count: (step.sent_count || 0) + 1 })
          .eq('id', step.id);

        // Get next step
        const { data: nextStep } = await supabase
          .from('campaign_sequence_steps')
          .select('*')
          .eq('sequence_id', enrollment.sequence_id)
          .eq('step_number', enrollment.current_step + 1)
          .single();

        if (nextStep) {
          // Calculate next send date
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);

          await supabase
            .from('prospect_sequence_enrollments')
            .update({
              current_step: enrollment.current_step + 1,
              last_sent_at: new Date().toISOString(),
              next_send_at: nextSendAt.toISOString(),
            })
            .eq('id', enrollment.id);
        } else {
          // No more steps
          await supabase
            .from('prospect_sequence_enrollments')
            .update({
              status: 'completed',
              last_sent_at: new Date().toISOString(),
              next_send_at: null,
            })
            .eq('id', enrollment.id);
          completed++;
        }

        // Update prospect tracking
        await supabase
          .from('prospects')
          .update({
            email_sent_at: new Date().toISOString(),
            last_contacted_at: new Date().toISOString(),
            demo_link: demoUrl,
          })
          .eq('id', prospect.id);

        sent++;
      } catch (err) {
        console.error(`Error processing enrollment ${enrollment.id}:`, err);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: dueEnrollments.length, sent, failed, completed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Drip campaign processor error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildDripEmail(
  name: string,
  businessName: string,
  demoUrl: string,
  stepNumber: number,
  subject: string,
  screenshotUrl?: string | null,
): string {
  const followUpIntros: Record<number, string> = {
    1: `I came across <strong>${businessName}</strong> and was impressed. I built a quick AI demo specifically for your business — it shows what a 24/7 AI receptionist could do for you.`,
    2: `Just following up on my earlier message about <strong>${businessName}</strong>. I noticed you haven't had a chance to see the AI demo we built for you yet — it only takes 30 seconds.`,
    3: `Quick question — has <strong>${businessName}</strong> ever lost a customer because nobody picked up the phone? Our AI assistant ensures that never happens again. Here's your personalized demo:`,
    4: `I wanted to share something interesting: businesses using AI voice assistants are seeing 40% more appointments booked. We built one specifically for <strong>${businessName}</strong> — would love your feedback.`,
    5: `Last note from me! The personalized AI demo we built for <strong>${businessName}</strong> is still live. If you have 30 seconds, I'd love to hear what you think. After this, I won't follow up again.`,
  };

  const intro = followUpIntros[stepNumber] || followUpIntros[1];

  const screenshotHtml = screenshotUrl
    ? `<img src="${screenshotUrl}" alt="${businessName}" style="width:100%;max-height:180px;object-fit:cover;object-position:top;border-radius:8px;margin:16px 0;" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,0.06);">
  <tr><td style="padding:36px;">
    <p style="margin:0;font-size:16px;color:#1f2937;line-height:1.6;">Hi ${name},</p>
    <p style="margin:14px 0 0;font-size:15px;color:#374151;line-height:1.7;">${intro}</p>
    ${screenshotHtml}
    <div style="text-align:center;margin:24px 0;">
      <a href="${demoUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#047857);color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;box-shadow:0 4px 16px rgba(5,150,105,0.35);">See Your AI Demo →</a>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">This demo was built specifically for ${businessName}.</p>
  </td></tr>
  <tr><td style="padding:20px 36px;border-top:1px solid #f3f4f6;">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">AI Hidden Leads · Smart lead generation & AI solutions<br/><a href="mailto:unsubscribe@aihiddenleads.com" style="color:#9ca3af;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
