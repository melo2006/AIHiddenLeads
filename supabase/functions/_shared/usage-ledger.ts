// Usage ledger writer (Usage Reporting Suite, 2026-11-12).
//
// One place that appends to public.usage_events. Every live path that
// meters usage (browser voice finalize, phone finalize, SMS sends, the
// reports engine) funnels through logUsageEvent, which is deliberately
// failure-isolated: it swallows ALL errors (console.error only) and never
// throws, so a ledger problem can never break a call, a text, or a send.
// Deduplication is the table's UNIQUE (service, source_table, source_id)
// key, applied here as an ignore-duplicates upsert.
//
// The event builders are pure (no I/O) and exported for tests.

export type UsageService = 'web_voice' | 'phone_voice' | 'chat_brain' | 'sms' | 'email' | 'video_avatar';
export type UsageProvider = 'gemini' | 'telnyx' | 'twilio' | 'simli' | 'hostinger' | 'resend' | 'other';

export interface UsageEventInput {
  organization_id?: string | null;
  agent_id?: string | null;
  telephony_client_id?: string | null;
  service: UsageService;
  provider: UsageProvider;
  line_number?: string | null;
  quantity_minutes?: number | null;
  quantity_count?: number | null;
  est_cost_usd?: number | null;
  carrier_cost_usd?: number | null;
  source_table: string;
  source_id: string;
  occurred_at: string;
}

/** Guarded numeric parse: numbers pass through, numeric strings parse,
 *  everything else (missing, '', 'n/a', objects) becomes null. Mirrors the
 *  regex guard used by the 0020 backfill so live rows and backfilled rows
 *  treat odd estimate values the same way. */
export function guardedCostUsd(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^[0-9]+(\.[0-9]+)?$/.test(value.trim())) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch { /* not JSON — treat as empty */ }
  }
  return {};
}

function minutesFromSeconds(seconds: unknown): number | null {
  const n = typeof seconds === 'number' ? seconds : typeof seconds === 'string' ? Number(seconds) : NaN;
  return Number.isFinite(n) && n > 0 ? n / 60 : null;
}

function occurredAt(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c && !Number.isNaN(Date.parse(c))) return c;
    if (c instanceof Date && !Number.isNaN(c.getTime())) return c.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Append one event to usage_events. Never throws.
 * `db` is a Supabase client (service role on the server paths).
 */
export async function logUsageEvent(db: any, event: UsageEventInput): Promise<void> {
  try {
    if (!db || !event || !event.service || !event.source_table || !event.source_id) return;
    const row: Record<string, unknown> = {
      organization_id: event.organization_id ?? null,
      agent_id: event.agent_id ?? null,
      telephony_client_id: event.telephony_client_id ?? null,
      service: event.service,
      provider: event.provider,
      line_number: event.line_number ?? null,
      quantity_minutes: event.quantity_minutes ?? null,
      quantity_count: event.quantity_count ?? null,
      est_cost_usd: event.est_cost_usd ?? null,
      carrier_cost_usd: event.carrier_cost_usd ?? null,
      source_table: event.source_table,
      source_id: String(event.source_id),
      occurred_at: event.occurred_at || new Date().toISOString(),
    };
    const { error } = await db.from('usage_events').upsert(row, {
      onConflict: 'service,source_table,source_id',
      ignoreDuplicates: true,
    });
    if (error) console.error('usage-ledger: insert failed', error.message);
  } catch (e) {
    console.error('usage-ledger: insert failed', e instanceof Error ? e.message : e);
  }
}

type SessionLike = Record<string, any>;

/** Pure builder: the web_voice event for a finalized gemini_voice_sessions row. */
export function webVoiceEventFromSession(session: SessionLike, usageObj?: unknown): UsageEventInput {
  const usage = asRecord(usageObj ?? session?.usage);
  return {
    organization_id: session?.organization_id ?? null,
    agent_id: session?.agent_id ?? null,
    telephony_client_id: null,
    service: 'web_voice',
    provider: 'gemini',
    line_number: null,
    quantity_minutes: minutesFromSeconds(session?.duration_seconds),
    quantity_count: null,
    est_cost_usd: guardedCostUsd(usage.audio_estimate_usd),
    carrier_cost_usd: null,
    source_table: 'gemini_voice_sessions',
    source_id: String(session?.id ?? ''),
    occurred_at: occurredAt(session?.started_at, session?.created_at),
  };
}

/** Pure builder: the video_avatar event for the same session, or null when
 *  the session did not run with the Simli avatar enabled. NOTE: minutes are
 *  the whole session — an upper-bound proxy, because avatar-live time is
 *  not tracked separately (same note as the 0020 backfill). */
export function videoAvatarEventFromSession(session: SessionLike, usageObj?: unknown): UsageEventInput | null {
  const config = asRecord(session?.config);
  const videoAvatar = asRecord(config.videoAvatar);
  if (videoAvatar.enabled !== true) return null;
  const base = webVoiceEventFromSession(session, usageObj);
  return { ...base, service: 'video_avatar', provider: 'simli', est_cost_usd: null };
}

type CallLike = Record<string, any>;

/** Pure builder: the phone_voice event for a finalized telephony_calls row
 *  plus its telephony_clients row. Provider mapping mirrors the 0020
 *  backfill CASE on transport. */
export function phoneVoiceEventFromCall(call: CallLike, client?: CallLike | null): UsageEventInput {
  const aiUsage = asRecord(call?.ai_usage);
  const provider: UsageProvider = call?.transport === 'telnyx-stream'
    ? 'telnyx'
    : call?.transport === 'stream'
      ? 'twilio'
      : 'other';
  return {
    organization_id: client?.organization_id ?? null,
    agent_id: client?.agent_id ?? null,
    telephony_client_id: call?.client_id ?? client?.id ?? null,
    service: 'phone_voice',
    provider,
    line_number: client?.voice_number ?? null,
    quantity_minutes: minutesFromSeconds(call?.seconds),
    quantity_count: null,
    est_cost_usd: guardedCostUsd(aiUsage.audio_estimate_usd),
    carrier_cost_usd: null,
    source_table: 'telephony_calls',
    source_id: String(call?.id ?? ''),
    occurred_at: occurredAt(call?.started_at, call?.created_at),
  };
}

/**
 * Log one sent email. trySend in hostinger-mail.ts has no db handle and no
 * stable id, so email events cannot be logged from inside it without losing
 * idempotency; callers that DO have both (the usage-reports engine) call
 * this instead. Never throws (delegates to logUsageEvent).
 */
export async function logEmailSend(
  db: any,
  mail: { to: string; subject?: string },
  opts: { organizationId?: string | null; agentId?: string | null; sourceTable?: string; sourceId?: string; occurredAt?: string } = {},
): Promise<void> {
  await logUsageEvent(db, {
    organization_id: opts.organizationId ?? null,
    agent_id: opts.agentId ?? null,
    telephony_client_id: null,
    service: 'email',
    provider: 'hostinger',
    line_number: null,
    quantity_minutes: null,
    quantity_count: 1,
    est_cost_usd: null,
    carrier_cost_usd: null,
    source_table: opts.sourceTable ?? 'hostinger_mail',
    source_id: opts.sourceId ?? `${mail.to}:${mail.subject ?? ''}`,
    occurred_at: opts.occurredAt ?? new Date().toISOString(),
  });
}
