import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Client helpers for the Verified Demo Gate (Phase 1).
 *
 * The `demo-verification` edge function owns the code itself (hashed,
 * 10-minute expiry, attempt cap, resend cooldown). This module only talks
 * to it, normalizes its errors into a typed, never-throwing result, and
 * holds the pure gate logic (waiting ladder, spoken-code extraction,
 * dictated-email cleanup, resume persistence) so it can be unit tested
 * without a network or a browser session.
 */

export const DEMO_CONSENT_DISCLOSURE_VERSION = 'demo-consent-v1';

export const DEMO_CONSENT_DISCLOSURE =
  'By continuing, you agree AI Hidden Leads may contact you about your demo and our services by text, call and email. Consent is not a condition of purchase. Message and data rates may apply. Reply STOP to end texts.';

/** Phase 1 is email-only; SMS codes arrive when a Telnyx messaging lane is approved. Mirrors the server flag. */
export const SMS_VERIFICATION_ENABLED = false;

// ---------------------------------------------------------------------------
// TEST-ONLY: "Verify demo" toggle on the demo intake (remove at public launch)
// ---------------------------------------------------------------------------

/**
 * TEST-ONLY — Ron's testing switch (2026-11-08). While this is true, the
 * demo intake renders a small "Verify demo" toggle (default OFF) so Ron and
 * invited testers can walk the whole demo flow without the code step, and
 * flip it on when they want to exercise verification itself.
 *
 * REMOVAL AT PUBLIC LAUNCH: set this to false (or delete it together with
 * its usages in DemoIntakePanel / TryDemo) and every demo verifies again —
 * the toggle disappears and `shouldVerifyDemo` always returns true.
 */
export const DEMO_TEST_TOGGLE = true;

/**
 * Pure gate decision for one demo session: does the verification gate apply?
 * With the TEST-ONLY toggle present, only when the tester turned it on.
 * Once the toggle is removed (flag false), verification always applies.
 */
export function shouldVerifyDemo(verifyDemoChoice: boolean): boolean {
  if (!DEMO_TEST_TOGGLE) return true;
  return verifyDemoChoice;
}

export type DemoVerificationChannel = 'email' | 'sms';

export interface DemoVerificationFailure {
  ok: false;
  /** Stable machine-readable error name from the edge function (e.g. "code_mismatch"), or a local fallback. */
  error: string;
  status?: number;
  attemptsRemaining?: number;
  retryAfterSeconds?: number;
}

export type RequestDemoCodeResult =
  | { ok: true; channel: DemoVerificationChannel; maskedTarget: string; expiresInSeconds: number }
  | DemoVerificationFailure;

export type VerifyDemoCodeResult =
  | { ok: true; verified: boolean; channel: DemoVerificationChannel | null }
  | DemoVerificationFailure;

export type DemoVerificationStatusResult =
  | {
      ok: true;
      verified: boolean;
      verifiedChannel: DemoVerificationChannel | null;
      codeNotCompleted: boolean;
      hasPendingCode: boolean;
      pendingExpiresAt: string | null;
    }
  | DemoVerificationFailure;

export type AbandonDemoVerificationResult = { ok: true } | DemoVerificationFailure;

// ---------------------------------------------------------------------------
// Edge-function plumbing (defensive error parsing, never throws)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asChannel(value: unknown): DemoVerificationChannel | null {
  return value === 'email' || value === 'sms' ? value : null;
}

/**
 * Pull the JSON body out of a FunctionsHttpError. `error.context` is a
 * fetch Response in supabase-js v2, but be defensive: it may also arrive
 * as a plain object or a JSON string depending on the transport.
 */
async function readErrorDetail(error: unknown): Promise<Record<string, unknown> | null> {
  if (!isRecord(error)) return null;
  const context: unknown = (error as { context?: unknown }).context;
  if (!context) return null;
  if (typeof context === 'string') {
    try {
      const parsed: unknown = JSON.parse(context);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (isRecord(context)) {
    const jsonFn = (context as { json?: unknown }).json;
    if (typeof jsonFn === 'function') {
      try {
        // Clone first when possible: a Response body can only be read once.
        const cloneFn = (context as { clone?: unknown }).clone;
        const source = typeof cloneFn === 'function' ? (cloneFn.call(context) as typeof context) : context;
        const parsed: unknown = await (jsonFn as () => Promise<unknown>).call(source);
        return isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return context;
  }
  return null;
}

async function toFailure(error: unknown): Promise<DemoVerificationFailure> {
  const detail = await readErrorDetail(error);
  const detailError = detail?.error;
  const detailCode = detail?.code;
  const detailMessage = detail?.message;
  const errorName =
    (typeof detailError === 'string' && detailError) ||
    (typeof detailCode === 'string' && detailCode) ||
    (typeof detailMessage === 'string' && detailMessage) ||
    (error instanceof Error && error.message) ||
    'demo_verification_failed';

  let status: number | undefined;
  if (error instanceof FunctionsHttpError) {
    status = asFiniteNumber((error.context as { status?: unknown } | undefined)?.status);
  }
  status = status ?? asFiniteNumber(detail?.status) ?? asFiniteNumber((error as { status?: unknown })?.status);

  return {
    ok: false,
    error: errorName,
    ...(status !== undefined ? { status } : {}),
    ...(asFiniteNumber(detail?.attemptsRemaining) !== undefined
      ? { attemptsRemaining: asFiniteNumber(detail?.attemptsRemaining) }
      : {}),
    ...(asFiniteNumber(detail?.retryAfterSeconds) !== undefined
      ? { retryAfterSeconds: asFiniteNumber(detail?.retryAfterSeconds) }
      : {}),
  };
}

/** A 2xx body that still carries `{ ok: false, error }` is a failure too. */
function failureFromData(data: Record<string, unknown>): DemoVerificationFailure {
  return {
    ok: false,
    error: typeof data.error === 'string' && data.error ? data.error : 'demo_verification_failed',
    ...(asFiniteNumber(data.status) !== undefined ? { status: asFiniteNumber(data.status) } : {}),
    ...(asFiniteNumber(data.attemptsRemaining) !== undefined
      ? { attemptsRemaining: asFiniteNumber(data.attemptsRemaining) }
      : {}),
    ...(asFiniteNumber(data.retryAfterSeconds) !== undefined
      ? { retryAfterSeconds: asFiniteNumber(data.retryAfterSeconds) }
      : {}),
  };
}

type InvokeOutcome =
  | { data: Record<string, unknown>; failure: null }
  | { data: null; failure: DemoVerificationFailure };

async function invokeDemoVerification(body: Record<string, unknown>): Promise<InvokeOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('demo-verification', { body });
    if (error) return { data: null, failure: await toFailure(error) };
    if (!isRecord(data)) {
      return { data: null, failure: { ok: false, error: 'demo_verification_failed' } };
    }
    if (data.ok === false) return { data: null, failure: failureFromData(data) };
    return { data, failure: null };
  } catch (caught) {
    return { data: null, failure: await toFailure(caught) };
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function requestDemoCode(
  leadId: string,
  channel: DemoVerificationChannel,
  target?: string,
): Promise<RequestDemoCodeResult> {
  const outcome = await invokeDemoVerification({
    action: 'request-code',
    leadId,
    channel,
    ...(target ? { target } : {}),
    disclosureVersion: DEMO_CONSENT_DISCLOSURE_VERSION,
  });
  if (outcome.failure) return outcome.failure;
  const { data } = outcome;
  return {
    ok: true,
    channel: asChannel(data.channel) ?? channel,
    maskedTarget: typeof data.maskedTarget === 'string' ? data.maskedTarget : '',
    expiresInSeconds: asFiniteNumber(data.expiresInSeconds) ?? 600,
  };
}

export async function verifyDemoCode(leadId: string, code: string): Promise<VerifyDemoCodeResult> {
  const outcome = await invokeDemoVerification({ action: 'verify-code', leadId, code });
  if (outcome.failure) return outcome.failure;
  const { data } = outcome;
  return {
    ok: true,
    verified: data.verified === true,
    channel: asChannel(data.channel),
  };
}

export async function getDemoVerificationStatus(leadId: string): Promise<DemoVerificationStatusResult> {
  const outcome = await invokeDemoVerification({ action: 'status', leadId });
  if (outcome.failure) return outcome.failure;
  const { data } = outcome;
  return {
    ok: true,
    verified: data.verified === true,
    verifiedChannel: asChannel(data.verifiedChannel),
    codeNotCompleted: data.codeNotCompleted === true,
    hasPendingCode: data.hasPendingCode === true,
    pendingExpiresAt: typeof data.pendingExpiresAt === 'string' ? data.pendingExpiresAt : null,
  };
}

export async function abandonDemoVerification(leadId: string): Promise<AbandonDemoVerificationResult> {
  const outcome = await invokeDemoVerification({ action: 'abandon', leadId });
  if (outcome.failure) return outcome.failure;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Waiting ladder (pure)
// ---------------------------------------------------------------------------

export const LADDER_FIRST_NUDGE_MS = 60_000;
export const LADDER_FINAL_NUDGE_MS = 180_000;
export const LADDER_EXIT_MS = 300_000;

export type LadderStage = 'waiting' | 'first-nudge' | 'final-nudge' | 'exit';

export function ladderStageForElapsed(elapsedMs: number): LadderStage {
  if (!Number.isFinite(elapsedMs) || elapsedMs < LADDER_FIRST_NUDGE_MS) return 'waiting';
  if (elapsedMs < LADDER_FINAL_NUDGE_MS) return 'first-nudge';
  if (elapsedMs < LADDER_EXIT_MS) return 'final-nudge';
  return 'exit';
}

// ---------------------------------------------------------------------------
// Spoken code extraction (pure)
// ---------------------------------------------------------------------------

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

/**
 * Find a 4-digit code in a spoken transcript.
 *
 * Consecutive digit tokens (single digits, digit groups, or digit words
 * like "four" / "oh") form one digit sequence; only a sequence totalling
 * exactly 4 digits counts. That is what keeps a 10-digit phone number —
 * spoken as one run, spaced ("555 123 4567") or not — from ever matching,
 * while "1234", "1 2 3 4" and "four five oh nine" all resolve.
 */
export function extractSpokenCode(text: string): string | null {
  if (!text) return null;
  const tokens = text
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean);

  let sequence = '';
  const flush = (): string | null => {
    const found = sequence.length === 4 ? sequence : null;
    sequence = '';
    return found;
  };

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      sequence += token;
      continue;
    }
    const wordDigit = DIGIT_WORDS[token];
    if (wordDigit !== undefined) {
      sequence += wordDigit;
      continue;
    }
    const found = flush();
    if (found) return found;
  }
  return flush();
}

// ---------------------------------------------------------------------------
// Dictated email cleanup (pure)
// ---------------------------------------------------------------------------

/**
 * Best-effort cleanup of a dictated email for the confirm field, where the
 * visitor gets a one-glance chance to correct it: "john dot smith at
 * gmail dot com" -> "john.smith@gmail.com". Spaces never survive — they
 * are never valid inside an address.
 */
export function normalizeDictatedEmail(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[[\](),;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\batsign\b/g, '@')
    .replace(/\bat\b/g, '@')
    .replace(/\bdot\b/g, '.')
    .replace(/\bunderscore\b/g, '_')
    .replace(/\bhyphen\b|\bdash\b/g, '-')
    .replace(/\bplus\b/g, '+')
    .replace(/\s+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\.@/g, '@')
    .replace(/@\./g, '@')
    .replace(/\.$/, '');
}

// ---------------------------------------------------------------------------
// Resume persistence (localStorage, fail-silent)
// ---------------------------------------------------------------------------

export const DEMO_RESUME_STORAGE_KEY = 'demoGateResume';

export interface DemoResume {
  leadId: string;
  websiteUrl: string;
  savedAt: number;
  /** TEST-ONLY toggle choice for this demo session (see DEMO_TEST_TOGGLE). */
  verifyDemo: boolean;
}

export function saveDemoResume(resume: { leadId: string; websiteUrl: string; verifyDemo?: boolean }): void {
  try {
    const record: DemoResume = {
      leadId: resume.leadId,
      websiteUrl: resume.websiteUrl,
      savedAt: Date.now(),
      // Only the verification gate saves a resume today, so an unspecified
      // choice means a verifying session.
      verifyDemo: resume.verifyDemo ?? true,
    };
    localStorage.setItem(DEMO_RESUME_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); resume is a nicety, never a blocker.
  }
}

export function loadDemoResume(): DemoResume | null {
  try {
    const raw = localStorage.getItem(DEMO_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (typeof parsed.leadId !== 'string' || !parsed.leadId) return null;
    if (typeof parsed.websiteUrl !== 'string') return null;
    const savedAt = asFiniteNumber(parsed.savedAt);
    if (savedAt === undefined) return null;
    // Records saved before the TEST-ONLY toggle existed were verifying
    // sessions (only the gate saves resumes), so a missing field means true.
    return { leadId: parsed.leadId, websiteUrl: parsed.websiteUrl, savedAt, verifyDemo: parsed.verifyDemo !== false };
  } catch {
    return null;
  }
}

export function clearDemoResume(): void {
  try {
    localStorage.removeItem(DEMO_RESUME_STORAGE_KEY);
  } catch {
    // Same fail-silent reasoning as saveDemoResume.
  }
}

// ---------------------------------------------------------------------------
// Aspen's gate lines (display text — digits as digits, per displayNumbers rule)
// ---------------------------------------------------------------------------

export const GATE_LINES = {
  sentEmail:
    "I just sent your code to your email — it is good for 10 minutes. If you do not see it, please check your spam or promotions folder. I will wait right here. While you check — any question about us, just ask, I'm here.",
  sentSms:
    "I just sent your code by text — it is good for 10 minutes. I will wait right here. While you check — any question about us, just ask, I'm here.",
  firstNudge: 'Did it land? I can resend it, or switch channels if that is easier.',
  finalNudge:
    'Your code is still good for a few more minutes. I can send a fresh one if you like, or we can pick this up again later — whatever suits you.',
  exit: "No rush at all — your demo stays saved. Come back any time and say 'continue my demo' and we will pick up right here.",
  verified:
    'Thank you — that did it, you are in. We are now entering simulation mode, so please ask as if you were a visitor to your own website — pricing, details, a manager, anything you want to know.',
} as const;
