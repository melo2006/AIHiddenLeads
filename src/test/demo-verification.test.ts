// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import {
  DEMO_CONSENT_DISCLOSURE,
  DEMO_CONSENT_DISCLOSURE_VERSION,
  extractSpokenCode,
  ladderStageForElapsed,
  normalizeDictatedEmail,
} from '../lib/demoVerification';

describe('waiting ladder stages', () => {
  test.each([
    [0, 'waiting'],
    [59_999, 'waiting'],
    [60_000, 'first-nudge'],
    [179_999, 'first-nudge'],
    [180_000, 'final-nudge'],
    [299_999, 'final-nudge'],
    [300_000, 'exit'],
  ] as const)('elapsed %i ms is %s', (elapsedMs, stage) => {
    expect(ladderStageForElapsed(elapsedMs)).toBe(stage);
  });
});

describe('extractSpokenCode', () => {
  test('finds a plain 4-digit code', () => {
    expect(extractSpokenCode('1234')).toBe('1234');
    expect(extractSpokenCode('Your code is 9876, thanks')).toBe('9876');
  });

  test('finds spaced digits', () => {
    expect(extractSpokenCode('my code is 1 2 3 4')).toBe('1234');
  });

  test('finds number words, with "oh" for 0', () => {
    expect(extractSpokenCode('four five oh nine')).toBe('4509');
    expect(extractSpokenCode('the code is zero seven one two')).toBe('0712');
  });

  test('rejects a 10-digit phone run', () => {
    expect(extractSpokenCode('call me at 5551234567')).toBeNull();
    expect(extractSpokenCode('my number is 555 123 4567')).toBeNull();
    expect(extractSpokenCode('my number is 555-123-4567')).toBeNull();
  });

  test('rejects 3 digits and longer spaced runs', () => {
    expect(extractSpokenCode('1 2 3')).toBeNull();
    expect(extractSpokenCode('123')).toBeNull();
    expect(extractSpokenCode('1 2 3 4 5')).toBeNull();
  });

  test('ignores text without a code', () => {
    expect(extractSpokenCode('hello, I am just looking around')).toBeNull();
    expect(extractSpokenCode('')).toBeNull();
  });

  test('still finds a code next to a rejected phone run', () => {
    expect(extractSpokenCode('my phone is 5551234567 and the code is 4321')).toBe('4321');
  });
});

describe('normalizeDictatedEmail', () => {
  test('converts spoken dot/at words', () => {
    expect(normalizeDictatedEmail('john dot smith at gmail dot com')).toBe('john.smith@gmail.com');
  });

  test('strips spaces and lowercases a partly typed address', () => {
    expect(normalizeDictatedEmail(' John Smith at Gmail.com ')).toBe('johnsmith@gmail.com');
    expect(normalizeDictatedEmail('jane.doe @ example . com')).toBe('jane.doe@example.com');
  });

  test('handles underscore and multi-part domains', () => {
    expect(normalizeDictatedEmail('jane underscore doe at example dot co dot uk')).toBe('jane_doe@example.co.uk');
  });
});

describe('consent disclosure', () => {
  test('version is a non-empty string', () => {
    expect(typeof DEMO_CONSENT_DISCLOSURE_VERSION).toBe('string');
    expect(DEMO_CONSENT_DISCLOSURE_VERSION.length).toBeGreaterThan(0);
  });

  test('disclosure mentions STOP and that consent is not a condition of purchase', () => {
    expect(DEMO_CONSENT_DISCLOSURE).toContain('STOP');
    expect(DEMO_CONSENT_DISCLOSURE).toContain('not a condition of purchase');
  });
});
