// Shared Twilio SMS sender for follow-up sends (follow-up pack, 2026-11-11).
//
// One place that knows how AiHiddenLeads sends a text after the A2P approval:
// through the campaign's Messaging Service ("AI Hidden Leads A2P"), never a
// bare From number, so every send is campaign-associated. Mirrors the ledger
// discipline of send-outreach-sms: every attempt — success or failure — is
// written to sms_delivery_log, and the status callback points at
// twilio-sms-status so delivery updates keep flowing into the same ledger.
//
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SUPABASE_URL (status callback),
// optional TWILIO_MESSAGING_SERVICE_SID override.
import { AIHL_MESSAGING_SERVICE_SID, AIHL_PHONE_NUMBER, normalizePhoneE164 } from './followup.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

export interface SmsSendResult {
  sent: boolean;
  messageSid?: string;
  status?: string;
  error?: string;
  errorCode?: string;
}

export interface SmsLogContext {
  templateId: string;
  /** Exactly one of these identifies the recipient in the ledger. */
  leadId?: string | null;
  prospectId?: string | null;
  bookingId?: string | null;
}

/**
 * Has this recipient already opted out (replied STOP)? sms_opt_outs is keyed
 * by the exact E.164 the carrier saw; check both the normalized number and
 * its bare-digits twin so a differently formatted stored row still matches.
 */
export async function isSmsOptedOut(db: any, phoneE164: string): Promise<boolean> {
  const digits = phoneE164.replace(/\D/g, '');
  const { data } = await db.from('sms_opt_outs').select('phone').in('phone', [phoneE164, digits, `+${digits}`]).limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Prior send attempts for one (recipient, template) in the ledger — the
 * exactly-once source for the follow-up sends. A 'failed' row is an attempt;
 * any non-failed row counts as sent.
 */
export async function priorSmsAttempts(db: any, ctx: SmsLogContext, toE164: string): Promise<{ sent: boolean; attempts: number }> {
  let q = db.from('sms_delivery_log').select('status').eq('template_id', ctx.templateId).eq('to_phone', toE164);
  if (ctx.leadId) q = q.eq('lead_id', ctx.leadId);
  else if (ctx.prospectId) q = q.eq('prospect_id', ctx.prospectId);
  else if (ctx.bookingId) q = q.eq('booking_id', ctx.bookingId);
  const { data } = await q;
  const rows = (data || []) as { status?: string }[];
  return {
    sent: rows.some(r => String(r.status || '').toLowerCase() !== 'failed'),
    attempts: rows.length,
  };
}

/**
 * Prior send attempts across SEVERAL templates for one recipient — the
 * cross-template exactly-once source for the dropped-call rescue: a
 * caller whose recap text already went out (or was attempted) must
 * never also get the rescue text, and vice versa. Same counting rule
 * as priorSmsAttempts: a 'failed' row is an attempt; any non-failed
 * row counts as sent.
 */
export async function priorSmsAttemptsAny(db: any, ctx: { leadId?: string | null; prospectId?: string | null; bookingId?: string | null }, templateIds: string[], toE164: string): Promise<{ sent: boolean; attempts: number }> {
  let q = db.from('sms_delivery_log').select('status').in('template_id', templateIds).eq('to_phone', toE164);
  if (ctx.leadId) q = q.eq('lead_id', ctx.leadId);
  else if (ctx.prospectId) q = q.eq('prospect_id', ctx.prospectId);
  else if (ctx.bookingId) q = q.eq('booking_id', ctx.bookingId);
  const { data } = await q;
  const rows = (data || []) as { status?: string }[];
  return {
    sent: rows.some(r => String(r.status || '').toLowerCase() !== 'failed'),
    attempts: rows.length,
  };
}

/**
 * Send one SMS through the A2P Messaging Service and log the attempt.
 * Never throws for a Twilio-level failure — the result says what happened,
 * so callers can honor the "only claim what the tool reports" rule.
 * Throws only when Twilio credentials are missing entirely (configuration).
 */
export async function sendFollowupSms(db: any, input: { to: string; body: string } & SmsLogContext): Promise<SmsSendResult> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN is not configured');
  const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || AIHL_MESSAGING_SERVICE_SID;
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const to = normalizePhoneE164(input.to) || input.to;

  const logRow = async (fields: Record<string, unknown>) => {
    const baseRow: Record<string, unknown> = {
      lead_id: input.leadId ?? null,
      prospect_id: input.prospectId ?? null,
      to_phone: to,
      from_phone: AIHL_PHONE_NUMBER,
      body: input.body,
      template_id: input.templateId,
      is_test: false,
      ...fields,
    };
    // booking_id arrives with the follow-up pack migration; include it when
    // present, retry without it if the column is not there yet so a send is
    // never lost to a pending migration.
    if (input.bookingId) baseRow.booking_id = input.bookingId;
    const { error } = await db.from('sms_delivery_log').insert(baseRow);
    if (error && input.bookingId && /booking_id/.test(String(error.message || ''))) {
      const { booking_id: _omit, ...withoutBooking } = baseRow;
      const retry = await db.from('sms_delivery_log').insert(withoutBooking);
      if (retry.error) console.error('twilio-sms: ledger insert failed', retry.error.message);
      return;
    }
    if (error) console.error('twilio-sms: ledger insert failed', error.message);
  };

  try {
    const params: Record<string, string> = {
      To: to,
      MessagingServiceSid: messagingServiceSid,
      Body: input.body,
    };
    if (supabaseUrl) params.StatusCallback = `${supabaseUrl}/functions/v1/twilio-sms-status`;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = data?.message || `Twilio error ${response.status}`;
      await logRow({ status: 'failed', error_code: data?.code ? String(data.code) : null, error_message: error });
      return { sent: false, error, errorCode: data?.code ? String(data.code) : undefined };
    }
    await logRow({
      message_sid: data?.sid || null,
      status: (data?.status || 'queued').toLowerCase(),
      segments: data?.num_segments ? Number(data.num_segments) : null,
      price_usd: data?.price ? Math.abs(Number(data.price)) : null,
    });
    return { sent: true, messageSid: data?.sid || undefined, status: (data?.status || 'queued').toLowerCase() };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'SMS send failed';
    await logRow({ status: 'failed', error_message: error });
    return { sent: false, error };
  }
}

/** sendFollowupSms that never throws — returns a failed result instead. */
export async function trySendFollowupSms(db: any, input: { to: string; body: string } & SmsLogContext): Promise<SmsSendResult> {
  try {
    return await sendFollowupSms(db, input);
  } catch (e) {
    console.error('twilio-sms: send unavailable', e instanceof Error ? e.message : e);
    return { sent: false, error: e instanceof Error ? e.message : 'SMS unavailable' };
  }
}
