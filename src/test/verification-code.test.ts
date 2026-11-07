import { describe, expect, it } from 'vitest';
import {
  CODE_TTL_MS,
  evaluateCodeAttempt,
  generateVerificationCode,
  hashVerificationCode,
  isCodeExpired,
  maskEmailTarget,
  maskPhoneTarget,
  type CodeAttemptRow,
} from '../../supabase/functions/_shared/verification-code';

const NOW = Date.parse('2026-11-08T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('verification-code shared logic', () => {
  it('generates a 4-digit code, one digit per random() call', () => {
    expect(generateVerificationCode(() => 0)).toBe('0000');
    expect(generateVerificationCode(() => 0.9999)).toBe('9999');
    const digits = [0.15, 0.25, 0.35, 0.45];
    let i = 0;
    expect(generateVerificationCode(() => digits[i++])).toBe('1234');
    expect(generateVerificationCode()).toMatch(/^\d{4}$/);
  });

  it('hashes deterministically per lead and differs across leads/codes', async () => {
    const a = await hashVerificationCode('lead-1', '1234');
    const b = await hashVerificationCode('lead-1', '1234');
    const c = await hashVerificationCode('lead-2', '1234');
    const d = await hashVerificationCode('lead-1', '4321');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it('expires at the expiry timestamp (10-minute TTL from issue)', () => {
    const issuedAt = NOW;
    const expiresAt = iso(issuedAt + CODE_TTL_MS);
    expect(isCodeExpired(expiresAt, issuedAt + CODE_TTL_MS - 1000)).toBe(false);
    expect(isCodeExpired(expiresAt, issuedAt + CODE_TTL_MS)).toBe(true);
    expect(isCodeExpired(expiresAt, issuedAt + CODE_TTL_MS + 1000)).toBe(true);
    expect(isCodeExpired('not-a-date', NOW)).toBe(true);
  });

  it('evaluates attempts in order: not-pending, expired, locked, then hash compare', () => {
    const row = (over: Partial<CodeAttemptRow>): CodeAttemptRow => ({
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      expiresAt: iso(NOW + 60_000),
      ...over,
    });
    expect(evaluateCodeAttempt(row({ status: 'verified' }), 'h', 'h', NOW)).toBe('not_pending');
    expect(evaluateCodeAttempt(row({ expiresAt: iso(NOW - 1000) }), 'h', 'h', NOW)).toBe('expired');
    expect(evaluateCodeAttempt(row({ attempts: 5 }), 'h', 'h', NOW)).toBe('locked');
    expect(evaluateCodeAttempt(row({}), 'same', 'same', NOW)).toBe('verified');
    expect(evaluateCodeAttempt(row({ attempts: 2 }), 'a', 'b', NOW)).toBe('mismatch');
  });

  it('masks targets for display', () => {
    expect(maskEmailTarget('john@gmail.com')).toBe('j•••@gmail.com');
    expect(maskPhoneTarget('+1 (555) 123-4567')).toBe('•••4567');
  });
});
