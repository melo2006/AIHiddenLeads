// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  PHONE_DEMO_DISCLOSURE_VERSION,
  PHONE_DEMO_HOST_POLICY,
  PHONE_DEMO_LINK,
  buildDictatedKnowledge,
  sanitizeSpokenCode,
  spellBackForSpeech,
} from '../../supabase/functions/_shared/phone-demo';

describe('spellBackForSpeech', () => {
  test('spells a dictated domain letter by letter with dot spoken', () => {
    expect(spellBackForSpeech('si2.com')).toBe('s, i, 2, dot, c, o, m');
  });
  test('spells an email with at and dot, digits kept as digits', () => {
    expect(spellBackForSpeech('melo4000@gmail.com')).toBe('m, e, l, o, 4, 0, 0, 0, at, g, m, a, i, l, dot, c, o, m');
  });
  test('normalizes case and stray spaces', () => {
    expect(spellBackForSpeech('  My Site.COM ')).toBe('m, y, s, i, t, e, dot, c, o, m');
  });
  test('handles dashes in domains', () => {
    expect(spellBackForSpeech('fast-tow.com')).toBe('f, a, s, t, dash, t, o, w, dot, c, o, m');
  });
});

describe('sanitizeSpokenCode', () => {
  test.each([
    ['4321', '4321'],
    ['4 3 2 1', '4321'],
    ['my code is 4321', '4321'],
    ['four three two one', '4321'],
    ['oh seven oh nine', '0709'],
  ] as const)('extracts %s as %s', (raw, expected) => {
    expect(sanitizeSpokenCode(raw)).toBe(expected);
  });
  test.each(['12345', '12', 'call me back', '', '123'])('rejects %j', (raw) => {
    expect(sanitizeSpokenCode(raw)).toBeNull();
  });
});

describe('buildDictatedKnowledge', () => {
  const intake = {
    businessName: 'Speedy Tow',
    trade: 'towing and roadside assistance',
    serviceArea: 'Dallas, within about 20 miles',
    services: ['emergency towing', 'jump starts', 'lockouts', 'winch-outs'],
    bestPractice: true,
  };
  test('records caller-stated facts and labels best-practice fills as unconfirmed', () => {
    const k = buildDictatedKnowledge(intake);
    expect(k).toContain('Speedy Tow');
    expect(k).toContain('towing and roadside assistance');
    expect(k).toContain('Dallas, within about 20 miles');
    expect(k).toContain('emergency towing');
    expect(k).toContain('NO website scan');
    expect(k).toContain('BEST-PRACTICE FILLS');
    expect(k).toContain('NOT confirmed');
    // Long enough to qualify as demo knowledge downstream (>= 200 chars).
    expect(k.length).toBeGreaterThanOrEqual(200);
  });
  test('no fills section when the caller declined best practice', () => {
    const k = buildDictatedKnowledge({ ...intake, bestPractice: false });
    expect(k).not.toContain('BEST-PRACTICE FILLS');
    expect(k).toContain('Only the facts above were stated by the caller');
  });
  test('records a dictated website as unscanned, and none when absent', () => {
    expect(buildDictatedKnowledge({ ...intake, websiteUrl: 'speedytow.com' }))
      .toContain('was not scanned for this phone demo');
    expect(buildDictatedKnowledge(intake)).toContain('has no website');
  });
});

describe('PHONE_DEMO_HOST_POLICY choreography', () => {
  test('opens with the free on-call demo offer', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('free demo');
    expect(PHONE_DEMO_HOST_POLICY).toContain('right here on this call');
  });
  test('intake uses tool-composed spell-backs for website and email', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('spellBack');
    expect(PHONE_DEMO_HOST_POLICY).toContain('dictation errors are the most common failure');
    expect(PHONE_DEMO_HOST_POLICY).toContain('read it verbatim');
  });
  test('best-practice fork carries the honesty line', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('BEST-PRACTICE FORK');
    expect(PHONE_DEMO_HOST_POLICY).toContain('replaced by their own documents, details and guardrails');
  });
  test('captures BOTH channels, mobile first, email for the recap', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('CAPTURE BOTH CONTACTS (mobile first, then email)');
    expect(PHONE_DEMO_LINK).toBe('https://aihiddenleads.com/demo');
  });
  test('verification has both branches and the caller-ID interim never claims a text', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('check_demo_code');
    expect(PHONE_DEMO_HOST_POLICY).toContain('mode caller_id');
    expect(PHONE_DEMO_HOST_POLICY).toContain('Never say or imply a text was sent when it was not');
  });
  test('callback resume goes through the resume tool', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('resume_demo_by_code');
  });
  test('role switch line and in-role manager rule are explicit', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain("I'm the receptionist for");
    expect(PHONE_DEMO_HOST_POLICY).toContain('part of the roleplay');
  });
  test('report card separates real facts from fills; no-website offer quotes $99 one-time', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('report card');
    expect(PHONE_DEMO_HOST_POLICY).toContain('Website Modernization');
    expect(PHONE_DEMO_HOST_POLICY).toContain('$99 one-time');
  });
  test('recap send is gated on the real tool result', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('send_demo_recap');
    expect(PHONE_DEMO_HOST_POLICY).toContain('Only if it returns sent true may you say you have emailed');
  });
  test('disclosure version is the phone-demo one', () => {
    expect(PHONE_DEMO_DISCLOSURE_VERSION).toBe('phone-demo-v1');
  });
});
