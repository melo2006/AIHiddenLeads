// Pure verification-code logic for the Verified Demo Gate.
// No Deno / Supabase imports: this module is unit-tested from src/test
// under vitest/node, so it must only rely on standard globals
// (crypto, TextEncoder, Date, Math).

export const CODE_LENGTH = 4;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Generate a 4-digit numeric verification code. Leading zeros are allowed.
 *
 * When a `random` source is injected it is used for every digit (this is
 * what makes the function deterministic in tests). Otherwise a
 * cryptographically secure source (crypto.getRandomValues) is preferred,
 * falling back to Math.random when that is unavailable.
 */
export function generateVerificationCode(random?: () => number): string {
  if (random) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      const value = random();
      const digit = Math.min(9, Math.max(0, Math.floor(value * 10)));
      code += String(digit);
    }
    return code;
  }

  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(CODE_LENGTH);
    cryptoObj.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += String(bytes[i] % 10);
    }
    return code;
  }

  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

/**
 * SHA-256 hex digest of `${leadId}:${code}`. Hashing with the lead id as a
 * domain separator means the same 4-digit code hashes differently for
 * every lead, so a stored hash can never be replayed against another lead.
 */
export async function hashVerificationCode(
  leadId: string,
  code: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${leadId}:${code}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function isCodeExpired(expiresAtIso: string, nowMs: number): boolean {
  const expiresAtMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }
  return expiresAtMs <= nowMs;
}

export type CodeAttemptOutcome =
  | 'verified'
  | 'mismatch'
  | 'locked'
  | 'expired'
  | 'not_pending';

export interface CodeAttemptRow {
  status: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
}

/**
 * Pure decision function for a single verification attempt.
 *
 * Order matters:
 * - a row that is not pending can never verify ('not_pending');
 * - an expired code reports 'expired' even if it would otherwise match;
 * - a row that has exhausted its attempts is 'locked' before any hash
 *   comparison, so the correct code no longer works after lockout.
 */
export function evaluateCodeAttempt(
  row: CodeAttemptRow,
  submittedCodeHash: string,
  storedHash: string,
  nowMs: number,
): CodeAttemptOutcome {
  if (row.status !== 'pending') {
    return 'not_pending';
  }
  if (isCodeExpired(row.expiresAt, nowMs)) {
    return 'expired';
  }
  if (row.attempts >= row.maxAttempts) {
    return 'locked';
  }
  if (submittedCodeHash === storedHash) {
    return 'verified';
  }
  return 'mismatch';
}

/**
 * Mask an email address for display, e.g. `j•••@gmail.com`.
 * Keeps only the first character of the local part and the full domain.
 */
export function maskEmailTarget(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) {
    return '•••';
  }
  const firstChar = trimmed.slice(0, 1);
  const domain = trimmed.slice(atIndex + 1);
  return `${firstChar}•••@${domain}`;
}

/**
 * Mask a phone number for display, e.g. `•••1234`.
 * Keeps only the last 4 digits.
 */
export function maskPhoneTarget(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const lastFour = digits.slice(-4);
  return `•••${lastFour}`;
}
