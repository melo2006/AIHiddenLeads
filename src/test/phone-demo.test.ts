// @vitest-environment node
import { readFileSync } from 'node:fs';
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
    // Demo Script v2 (audit C9): wording updated to "I am the receptionist
    // for" inside the announced doorway (announcement + pause + greeting).
    expect(PHONE_DEMO_HOST_POLICY).toContain('I am the receptionist for');
    expect(PHONE_DEMO_HOST_POLICY).toContain('part of the roleplay');
  });
  test('report card separates real facts from fills; no-website offer quotes $99 one-time', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('report card');
    expect(PHONE_DEMO_HOST_POLICY).toContain('Website Modernization');
    expect(PHONE_DEMO_HOST_POLICY).toContain('$99 one-time');
  });
  test('recap send is gated on the real tool result', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('send_demo_recap');
    expect(PHONE_DEMO_HOST_POLICY).toContain('only if it returns email sent true may you say you have emailed');
    expect(PHONE_DEMO_HOST_POLICY).toContain('only if it returns sms sent true may you say the demo link was texted');
  });
  test('step 7 notes the automatic dropped-call rescue text — never promised, never claimed (rescue text)', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('if the call ends unexpectedly after step 3');
    expect(PHONE_DEMO_HOST_POLICY).toContain('ONE rescue text with the demo link');
    expect(PHONE_DEMO_HOST_POLICY).toContain('never promise it and never claim it');
  });
  test('step 3 asks the follow-up-text permission and records it as smsConsent (follow-up pack)', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('Can I text the demo link to this number so you can review it later or forward it to your manager?');
    expect(PHONE_DEMO_HOST_POLICY).toContain('smsConsent');
  });
  test('step 7 frames the implementation call as 15–20 minutes of their time, 30 on the calendar (follow-up pack)', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('can I schedule a 15 to 20 minutes appointment');
    expect(PHONE_DEMO_HOST_POLICY).toContain('the calendar itself reserves a full 30 minutes');
  });
  test('disclosure version is the phone-demo one', () => {
    expect(PHONE_DEMO_DISCLOSURE_VERSION).toBe('phone-demo-v1');
  });
  test('step 8 books the call live with the slot-offer method (phase 2)', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('STEP 8 — BOOK THE IMPLEMENTATION CALL LIVE');
    expect(PHONE_DEMO_HOST_POLICY).toContain('What works best for you — later today, tomorrow morning, or would the next day be better?');
    expect(PHONE_DEMO_HOST_POLICY).toContain('NEVER invent a time');
    expect(PHONE_DEMO_HOST_POLICY).toContain('get_availability');
    expect(PHONE_DEMO_HOST_POLICY).toContain('check_time');
    expect(PHONE_DEMO_HOST_POLICY).toContain('book_call');
    expect(PHONE_DEMO_HOST_POLICY).toContain('shall I book that one?');
  });
  test('step 7 recap carries the booking link as the zero-pressure fallback (phase 2)', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('https://aihiddenleads.com/book');
    expect(PHONE_DEMO_HOST_POLICY).toContain('grab any time that suits');
  });
  test('step 8 keeps per-channel honesty: no confirmation-text promise when texting is off', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('do NOT promise a confirmation text');
    expect(PHONE_DEMO_HOST_POLICY).toContain('the confirmation and the invite come by EMAIL');
  });
});

describe('telephony-stream phone-demo-save persists the forwarded smsConsent (source pin)', () => {
  // The handler is Deno.serve code and cannot be imported into vitest, so
  // pin the exact write shapes in source (the bridge node tests cover the
  // declaration + forwarding half of this chain end to end).
  const stream = readFileSync(new URL('../../supabase/functions/telephony-stream/index.ts', import.meta.url), 'utf8');
  const saveBlock = stream.slice(
    stream.indexOf("b.action === 'phone-demo-save'"),
    stream.indexOf("b.action === 'phone-demo-code'"),
  );

  test('the save block is found and reads the answer off the demo payload', () => {
    expect(saveBlock.length).toBeGreaterThan(0);
    expect(saveBlock).toContain("typeof d.smsConsent === 'boolean'");
  });
  test('first save stores the boolean verbatim: sms_consent true stays true, false stays false', () => {
    // No coercion or inversion in the insert: a boolean d.smsConsent is
    // stored as-is, so both answers persist correctly.
    expect(saveBlock).toContain('{ sms_consent: d.smsConsent }');
  });
  test('correction save patches sms_consent on the same lead row', () => {
    expect(saveBlock).toContain("update({ sms_consent: d.smsConsent }).eq('id', existingId)");
  });
  test('no boolean supplied means no consent write (an un-asked permission never lands)', () => {
    expect(saveBlock).toContain("typeof d.smsConsent === 'boolean' ? { sms_consent: d.smsConsent } : {}");
  });
});
