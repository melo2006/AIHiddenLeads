import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  evaluateCodeAttempt,
  generateVerificationCode,
  hashVerificationCode,
  maskEmailTarget,
} from '../_shared/verification-code.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const RequestCodeSchema = z.object({
  action: z.literal('request-code'),
  leadId: z.string().uuid(),
  channel: z.enum(['email', 'sms']),
  target: z.string().max(320).optional(),
  disclosureVersion: z.string().min(1).max(40),
});

const VerifyCodeSchema = z.object({
  action: z.literal('verify-code'),
  leadId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/),
});

const StatusSchema = z.object({
  action: z.literal('status'),
  leadId: z.string().uuid(),
});

const AbandonSchema = z.object({
  action: z.literal('abandon'),
  leadId: z.string().uuid(),
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildCodeEmailText(code: string): string {
  return [
    `Your AI Hidden Leads demo code is ${code}.`,
    '',
    'Enter this code to unlock your personalized demo. The code is good for 10 minutes.',
    '',
    "Didn't request this? You can ignore this email.",
    '',
    "Not seeing it? Check your spam or promotions folder — demo codes sometimes land there.",
  ].join('\n');
}

function buildCodeEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="padding:30px 30px 10px;text-align:center;">
    <h1 style="margin:0;font-size:22px;color:#111;">Your demo code</h1>
    <p style="margin:10px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">Enter this code to unlock your personalized AI Hidden Leads demo. It is good for 10 minutes.</p>
  </td></tr>
  <tr><td align="center" style="padding:20px 30px;">
    <div style="display:inline-block;background:#f0fdf4;border:2px solid #a7f3d0;border-radius:12px;padding:18px 36px;font-size:36px;font-weight:700;letter-spacing:10px;color:#111;">${code}</div>
  </td></tr>
  <tr><td style="padding:0 30px 24px;text-align:center;">
    <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">Didn't request this? You can ignore this email.<br/>Not seeing the email? Check your spam or promotions folder.</p>
  </td></tr>
  <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">AI Hidden Leads</p>
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof (body as { action?: unknown }).action !== 'string') {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }

    const action = (body as { action: string }).action;

    // ------------------------------------------------------------------
    // request-code
    // ------------------------------------------------------------------
    if (action === 'request-code') {
      const parsed = RequestCodeSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ error: 'invalid_request' }, 400);
      }
      const { leadId, channel, disclosureVersion } = parsed.data;

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, email, phone')
        .eq('id', leadId)
        .maybeSingle();

      if (leadError || !lead) {
        return jsonResponse({ error: 'lead_not_found' }, 404);
      }

      const target = (parsed.data.target?.trim() || (channel === 'email' ? lead.email : lead.phone) || '').trim();

      if (channel === 'email') {
        if (!target || !EMAIL_PATTERN.test(target)) {
          return jsonResponse({ error: 'invalid_target' }, 400);
        }
      } else {
        const digits = target.replace(/\D/g, '');
        if (digits.length < 10) {
          return jsonResponse({ error: 'invalid_target' }, 400);
        }
      }

      // Resend cooldown: one pending code per lead+channel per cooldown window.
      const nowMs = Date.now();
      const { data: pendingRows } = await supabase
        .from('demo_verification_codes')
        .select('id, created_at')
        .eq('lead_id', leadId)
        .eq('channel', channel)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      const latestPending = pendingRows && pendingRows.length > 0 ? pendingRows[0] : null;
      if (latestPending) {
        const createdMs = Date.parse(latestPending.created_at as string);
        if (!Number.isNaN(createdMs) && nowMs - createdMs < RESEND_COOLDOWN_MS) {
          const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - (nowMs - createdMs)) / 1000);
          return jsonResponse({ error: 'resend_cooldown', retryAfterSeconds }, 429);
        }
      }

      // SMS stays OFF in phase 1: no messaging lane (toll-free verification /
      // A2P) is approved yet, so the path exists structurally but never sends.
      if (channel === 'sms') {
        if (Deno.env.get('DEMO_VERIFICATION_SMS_ENABLED') !== 'true') {
          return jsonResponse({ error: 'sms_verification_not_enabled' }, 501);
        }
        return jsonResponse({ error: 'sms_lane_not_configured' }, 501);
      }

      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) {
        return jsonResponse({ error: 'resend_not_configured' }, 500);
      }

      const code = generateVerificationCode();
      const codeHash = await hashVerificationCode(leadId, code);
      const nowIso = new Date(nowMs).toISOString();
      const expiresAtIso = new Date(nowMs + CODE_TTL_MS).toISOString();
      const forwardedFor = req.headers.get('x-forwarded-for');
      const requesterIp = forwardedFor ? forwardedFor.split(',')[0].trim() || null : null;

      // Supersede any other pending codes for this lead before issuing a new one.
      await supabase
        .from('demo_verification_codes')
        .update({ status: 'superseded' })
        .eq('lead_id', leadId)
        .eq('status', 'pending');

      const { data: inserted, error: insertError } = await supabase
        .from('demo_verification_codes')
        .insert({
          lead_id: leadId,
          channel,
          target,
          code_hash: codeHash,
          status: 'pending',
          attempts: 0,
          max_attempts: MAX_CODE_ATTEMPTS,
          requester_ip: requesterIp,
          expires_at: expiresAtIso,
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        console.error('demo-verification: failed to insert code row', insertError);
        return jsonResponse({ error: 'internal' }, 500);
      }

      // This request IS the disclosure-accepting action: the visitor saw the
      // disclosure at the contact field and tapped to continue, so record the
      // consent evidence on the lead.
      await supabase
        .from('leads')
        .update({
          consent_disclosure_version: disclosureVersion,
          consent_captured_at: nowIso,
        })
        .eq('id', leadId);

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Aspen at AI Hidden Leads <aspen@aihiddenleads.com>',
            to: [target],
            subject: `Your AI Hidden Leads demo code: ${code}`,
            text: buildCodeEmailText(code),
            html: buildCodeEmailHtml(code),
          }),
        });

        if (!emailRes.ok) {
          const emailData = await emailRes.json().catch(() => null);
          console.error('demo-verification: Resend send failed', emailRes.status, emailData);
          await supabase
            .from('demo_verification_codes')
            .update({ status: 'superseded' })
            .eq('id', inserted.id);
          return jsonResponse({ error: 'email_send_failed' }, 502);
        }
      } catch (sendError) {
        console.error('demo-verification: Resend send threw', sendError);
        await supabase
          .from('demo_verification_codes')
          .update({ status: 'superseded' })
          .eq('id', inserted.id);
        return jsonResponse({ error: 'email_send_failed' }, 502);
      }

      return jsonResponse({
        ok: true,
        channel: 'email',
        maskedTarget: maskEmailTarget(target),
        expiresInSeconds: Math.floor(CODE_TTL_MS / 1000),
      });
    }

    // ------------------------------------------------------------------
    // verify-code
    // ------------------------------------------------------------------
    if (action === 'verify-code') {
      const parsed = VerifyCodeSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ error: 'invalid_request' }, 400);
      }
      const { leadId, code } = parsed.data;

      const { data: pendingRows } = await supabase
        .from('demo_verification_codes')
        .select('id, lead_id, channel, target, code_hash, status, attempts, max_attempts, expires_at, created_at')
        .eq('lead_id', leadId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      const row = pendingRows && pendingRows.length > 0 ? pendingRows[0] : null;
      if (!row) {
        return jsonResponse({ error: 'no_pending_code' }, 404);
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const submittedHash = await hashVerificationCode(leadId, code);

      const outcome = evaluateCodeAttempt(
        {
          status: row.status as string,
          attempts: row.attempts as number,
          maxAttempts: row.max_attempts as number,
          expiresAt: row.expires_at as string,
        },
        submittedHash,
        row.code_hash as string,
        nowMs,
      );

      if (outcome === 'not_pending') {
        return jsonResponse({ error: 'code_not_pending' }, 409);
      }

      if (outcome === 'expired') {
        await supabase
          .from('demo_verification_codes')
          .update({ status: 'expired' })
          .eq('id', row.id);
        await supabase
          .from('leads')
          .update({ code_not_completed: true })
          .eq('id', leadId);
        return jsonResponse({ error: 'code_expired' }, 410);
      }

      if (outcome === 'locked') {
        if ((row.attempts as number) >= (row.max_attempts as number)) {
          await supabase
            .from('demo_verification_codes')
            .update({ status: 'locked' })
            .eq('id', row.id);
        }
        return jsonResponse({ error: 'too_many_attempts' }, 429);
      }

      if (outcome === 'mismatch') {
        const newAttempts = (row.attempts as number) + 1;
        const maxAttempts = row.max_attempts as number;
        if (newAttempts >= maxAttempts) {
          await supabase
            .from('demo_verification_codes')
            .update({ attempts: newAttempts, status: 'locked' })
            .eq('id', row.id);
          return jsonResponse({ error: 'too_many_attempts' }, 429);
        }
        await supabase
          .from('demo_verification_codes')
          .update({ attempts: newAttempts })
          .eq('id', row.id);
        return jsonResponse(
          { error: 'code_mismatch', attemptsRemaining: maxAttempts - newAttempts },
          401,
        );
      }

      // verified
      await supabase
        .from('demo_verification_codes')
        .update({ status: 'verified', verified_at: nowIso })
        .eq('id', row.id);
      await supabase
        .from('leads')
        .update({
          contact_verified: true,
          verified_channel: row.channel,
          verified_at: nowIso,
          code_not_completed: false,
        })
        .eq('id', leadId);

      return jsonResponse({ ok: true, verified: true, channel: row.channel });
    }

    // ------------------------------------------------------------------
    // status
    // ------------------------------------------------------------------
    if (action === 'status') {
      const parsed = StatusSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ error: 'invalid_request' }, 400);
      }
      const { leadId } = parsed.data;

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, contact_verified, verified_channel, code_not_completed')
        .eq('id', leadId)
        .maybeSingle();

      if (leadError || !lead) {
        return jsonResponse({ error: 'lead_not_found' }, 404);
      }

      const { data: pendingRows } = await supabase
        .from('demo_verification_codes')
        .select('id, expires_at')
        .eq('lead_id', leadId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      const pending = pendingRows && pendingRows.length > 0 ? pendingRows[0] : null;

      return jsonResponse({
        verified: Boolean(lead.contact_verified),
        verifiedChannel: lead.verified_channel ?? null,
        codeNotCompleted: Boolean(lead.code_not_completed),
        hasPendingCode: Boolean(pending),
        pendingExpiresAt: pending ? pending.expires_at : null,
      });
    }

    // ------------------------------------------------------------------
    // abandon
    // ------------------------------------------------------------------
    if (action === 'abandon') {
      const parsed = AbandonSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ error: 'invalid_request' }, 400);
      }
      const { leadId } = parsed.data;

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, contact_verified')
        .eq('id', leadId)
        .maybeSingle();

      if (leadError || !lead) {
        return jsonResponse({ error: 'lead_not_found' }, 404);
      }

      await supabase
        .from('demo_verification_codes')
        .update({ status: 'superseded' })
        .eq('lead_id', leadId)
        .eq('status', 'pending');

      if (!lead.contact_verified) {
        await supabase
          .from('leads')
          .update({ code_not_completed: true })
          .eq('id', leadId);
      }

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'unknown_action' }, 400);
  } catch (error: unknown) {
    console.error('demo-verification error:', error);
    return jsonResponse({ error: 'internal' }, 500);
  }
});
