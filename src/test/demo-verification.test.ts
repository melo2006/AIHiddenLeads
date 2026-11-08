// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import {
  DEMO_CONSENT_DISCLOSURE,
  DEMO_CONSENT_DISCLOSURE_VERSION,
  DEMO_RESUME_STORAGE_KEY,
  DEMO_TEST_TOGGLE,
  clearDemoResume,
  extractSpokenCode,
  ladderStageForElapsed,
  loadDemoResume,
  normalizeDictatedEmail,
  saveDemoResume,
  shouldVerifyDemo,
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

describe('TEST-ONLY verify toggle — gate decision', () => {
  test('toggle ships enabled for the testing period', () => {
    expect(DEMO_TEST_TOGGLE).toBe(true);
  });

  test('toggle ON → the verification gate applies', () => {
    expect(shouldVerifyDemo(true)).toBe(true);
  });

  test('toggle OFF → the gate is skipped entirely', () => {
    expect(shouldVerifyDemo(false)).toBe(false);
  });
});

describe('resume persistence carries the toggle choice', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('verifyDemo=false round-trips (a refresh keeps the skip)', () => {
    saveDemoResume({ leadId: 'lead-1', websiteUrl: 'https://example.com', verifyDemo: false });
    const loaded = loadDemoResume();
    expect(loaded?.leadId).toBe('lead-1');
    expect(loaded?.verifyDemo).toBe(false);
  });

  test('verifyDemo=true round-trips', () => {
    saveDemoResume({ leadId: 'lead-2', websiteUrl: 'https://example.com', verifyDemo: true });
    expect(loadDemoResume()?.verifyDemo).toBe(true);
  });

  test('an unspecified choice saves as a verifying session (the gate is the only saver)', () => {
    saveDemoResume({ leadId: 'lead-3', websiteUrl: 'https://example.com' });
    expect(loadDemoResume()?.verifyDemo).toBe(true);
  });

  test('a legacy record without the field loads as a verifying session', () => {
    store.set(DEMO_RESUME_STORAGE_KEY, JSON.stringify({ leadId: 'lead-4', websiteUrl: 'https://example.com', savedAt: 123 }));
    expect(loadDemoResume()?.verifyDemo).toBe(true);
  });

  test('clear removes the record', () => {
    saveDemoResume({ leadId: 'lead-5', websiteUrl: 'https://example.com', verifyDemo: false });
    clearDemoResume();
    expect(loadDemoResume()).toBeNull();
  });
});
