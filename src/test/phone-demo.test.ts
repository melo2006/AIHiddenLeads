// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  PHONE_DEMO_DISCLOSURE_VERSION,
  PHONE_DEMO_HOST_POLICY,
  PHONE_DEMO_LINK,
  PHONE_GREETING,
  buildDictatedKnowledge,
  sanitizeSpokenCode,
  spellBackForSpeech,
  transcriptShowsCapturedContact,
} from '../../supabase/functions/_shared/phone-demo';
import { HOMEPAGE_GREETING } from '../../supabase/functions/_shared/homepage-knowledge';

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
  test('save returns phoneSource: dictated mobile vs caller-ID fallback vs none (polish batch)', () => {
    expect(saveBlock).toContain("const phoneSource = mobile ? 'dictated' : fields.phone ? 'caller_id' : 'none';");
    expect(saveBlock).toContain('phoneSource');
    // Every successful save shape carries it (update, insert, fallback retry).
    expect(saveBlock.match(/phoneSource \}/g)?.length).toBeGreaterThanOrEqual(3);
  });
  test('every save failure path logs the real error loudly (polish batch)', () => {
    expect(saveBlock).toContain("console.error('telephony-stream: phone-demo-save update failed', upErr.message)");
    expect(saveBlock).toContain("console.error('telephony-stream: phone-demo-save insert failed'");
    expect(saveBlock).toContain("console.error('telephony-stream: phone-demo-save sms_consent fallback retry failed'");
  });
});

describe('PHONE_DEMO_HOST_POLICY polish batch (2026-11-12, A&R Towing call)', () => {
  const step3 = PHONE_DEMO_HOST_POLICY.slice(
    PHONE_DEMO_HOST_POLICY.indexOf('STEP 3'),
    PHONE_DEMO_HOST_POLICY.indexOf('STEP 4'),
  );
  const step6 = PHONE_DEMO_HOST_POLICY.slice(
    PHONE_DEMO_HOST_POLICY.indexOf('STEP 6'),
    PHONE_DEMO_HOST_POLICY.indexOf('STEP 7'),
  );
  const step7 = PHONE_DEMO_HOST_POLICY.slice(
    PHONE_DEMO_HOST_POLICY.indexOf('STEP 7'),
    PHONE_DEMO_HOST_POLICY.indexOf('STEP 8'),
  );

  test('step 3 mobile gate is post-save and tied to spellBack.mobile', () => {
    expect(step3).toContain('MANDATORY NUMBER-CAPTURE PROTOCOL WITH CONFIRMATION GATE');
    expect(step3).toContain('call save_phone_demo_lead');
    expect(step3).toContain('spellBack.mobile');
    expect(step3).toContain('digit by digit');
    expect(step3).toContain('"Did I get that right?"');
    expect(step3).toContain('proceed ONLY on the caller\'s confirmation');
    // The old pre-save improvised read-back ordering is gone: the
    // deterministic post-save spell-back is the single mandated path.
    expect(step3).toContain('post-save deterministic spell-back is the single mandated path');
    expect(step3).toContain('never improvise a pre-save read-back');
    // A correction restarts the read-back, never the whole flow.
    expect(step3).toContain('A correction restarts the READ-BACK, never the whole flow');
  });
  test('step 3 email gets the same post-save confirmation gate', () => {
    expect(step3).toContain('EMAIL — THE SAME POST-SAVE GATE');
    expect(step3).toContain('spellBack.email');
    expect(step3).toContain('word for word');
  });
  test('step 3 caller-ID honesty: phoneSource caller_id is spoken as the calling-from number', () => {
    expect(step3).toContain('phoneSource');
    expect(step3).toContain("'caller_id'");
    expect(step3).toContain('CALLER-ID HONESTY');
    expect(step3).toContain('the number you\'re calling from');
    expect(step3).toContain('Never present a caller-ID number as if the caller dictated it');
  });
  test('captured-field discipline: never re-ask, confirm the assembled value once', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('CAPTURED-FIELD DISCIPLINE');
    expect(PHONE_DEMO_HOST_POLICY).toContain('NEVER re-asked');
    expect(PHONE_DEMO_HOST_POLICY).toContain('caller name, business name, trade, service area, services, mobile or email');
    expect(PHONE_DEMO_HOST_POLICY).toContain('confirm the ASSEMBLED value in one short question');
    expect(PHONE_DEMO_HOST_POLICY).toContain('I have that as A&R Towing — right?');
    expect(PHONE_DEMO_HOST_POLICY).toContain('one confirmation, not a fresh question loop');
    expect(PHONE_DEMO_HOST_POLICY).toContain('save the correction by calling save_phone_demo_lead again');
    expect(PHONE_DEMO_HOST_POLICY).toContain('confirm the new assembled value once');
    // STEP 1 references the discipline block.
    const step1 = PHONE_DEMO_HOST_POLICY.slice(
      PHONE_DEMO_HOST_POLICY.indexOf('STEP 1'),
      PHONE_DEMO_HOST_POLICY.indexOf('STEP 2'),
    );
    expect(step1).toContain('CAPTURED-FIELD DISCIPLINE applies');
  });
  test('step 6 in-role universal number protocol', () => {
    expect(step6).toContain('UNIVERSAL NUMBER PROTOCOL');
    expect(step6).toContain('grouped digit-by-digit');
    expect(step6).toContain('"Did I get that right?"');
    expect(step6).toContain('proceeds ONLY on the caller\'s confirmation');
  });
  test('step 7 recap loop-breaker: exactly one full recap attempt', () => {
    expect(step7).toContain('RECAP LOOP-BREAKER');
    expect(step7).toContain('exactly ONE full recap attempt');
    expect(step7).toContain('says they don\'t know');
    expect(step7).toContain('ONE short summary line');
    expect(step7).toContain('never repeat the recap');
    expect(step7).toContain('never re-ask the same reaction question in near-identical wording');
  });
  test('acknowledge-before-tool throughout: a tool wait never starts from bare silence', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('ACKNOWLEDGE BEFORE EVERY TOOL');
    expect(PHONE_DEMO_HOST_POLICY).toContain('BEFORE invoking any save, send or book tool');
    expect(PHONE_DEMO_HOST_POLICY).toContain('"Got it —"');
    expect(PHONE_DEMO_HOST_POLICY).toContain('never starts from bare silence');
  });
});

describe('PHONE_GREETING (phone opening trim, polish batch)', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;
  test('keeps every approved HOMEPAGE_GREETING element', () => {
    expect(PHONE_GREETING).toContain('{timeGreeting}');
    expect(PHONE_GREETING).toContain('thanks for calling {businessName}');
    expect(PHONE_GREETING).toContain("I'm {agentName}");
    // The 85% voicemail-never-call-back stat hook.
    expect(PHONE_GREETING).toContain('85%');
    expect(PHONE_GREETING).toContain("don't call back");
    // Partner-not-vendor framing.
    expect(PHONE_GREETING).toContain('partner for finding the leads you\'re already losing');
    // Natural-voice line and the (shortened) live-video spokesperson line.
    expect(PHONE_GREETING).toContain('natural voice');
    expect(PHONE_GREETING).toContain('live video as your spokesperson');
    // Ends with the name ask.
    expect(PHONE_GREETING.trim().endsWith('May I have your name?')).toBe(true);
  });
  test('is ~75-85 words and shorter than HOMEPAGE_GREETING', () => {
    expect(words(PHONE_GREETING)).toBeGreaterThanOrEqual(75);
    expect(words(PHONE_GREETING)).toBeLessThanOrEqual(85);
    expect(words(PHONE_GREETING)).toBeLessThan(words(HOMEPAGE_GREETING));
  });
});

describe('transcriptShowsCapturedContact (end-of-call lead guarantee)', () => {
  test('email hit — string and fragment-array forms', () => {
    expect(transcriptShowsCapturedContact('my email is tonymiller1401@gmail.com')).toBe(true);
    expect(transcriptShowsCapturedContact([
      { role: 'caller', text: 'email me at a@b.co please' },
    ])).toBe(true);
  });
  test('digit-run hit — grouped, separated and contiguous numbers', () => {
    expect(transcriptShowsCapturedContact([{ role: 'caller', text: 'call me on 727 735 3542' }])).toBe(true);
    expect(transcriptShowsCapturedContact('my number is 727-735-3542')).toBe(true);
    expect(transcriptShowsCapturedContact('7277353542, repeat it to me')).toBe(true);
    expect(transcriptShowsCapturedContact('reach us at 555 1234 any time')).toBe(true);
  });
  test('clean transcript miss — no email, no long digit run', () => {
    expect(transcriptShowsCapturedContact([
      { role: 'caller', text: 'Hi, I run a towing company in Broward County' },
      { role: 'assistant', text: 'Great — what services do you offer?' },
    ])).toBe(false);
    // A partial 6-digit fragment alone is not captured-contact evidence.
    expect(transcriptShowsCapturedContact('I only got 727735 so far')).toBe(false);
    expect(transcriptShowsCapturedContact([])).toBe(false);
    expect(transcriptShowsCapturedContact(undefined)).toBe(false);
    expect(transcriptShowsCapturedContact(null)).toBe(false);
  });
});

describe('telephony-stream polish batch wiring (source pins)', () => {
  const stream = readFileSync(new URL('../../supabase/functions/telephony-stream/index.ts', import.meta.url), 'utf8');

  test('PHONE_POLICY carries the mandatory universal number gate', () => {
    expect(stream).toContain('UNIVERSAL NUMBER PROTOCOL (mandatory gate, every mode)');
    expect(stream).toContain('grouped digit-by-digit');
    expect(stream).toContain('"Did I get that right?"');
  });
  test('start action substitutes PHONE_GREETING on the fallback-greeting branch only', () => {
    expect(stream).toContain('opening = PHONE_GREETING;');
    expect(stream).toContain('PHONE_GREETING');
    // The substitution sits inside the fallback (else-if) templating
    // branch, after the greetings-variants pick.
    const variantsIdx = stream.indexOf('variants[h % variants.length]');
    const substituteIdx = stream.indexOf('opening = PHONE_GREETING;');
    expect(variantsIdx).toBeGreaterThan(-1);
    expect(substituteIdx).toBeGreaterThan(variantsIdx);
  });
  test('end action builds the phone-demo audit and merges it into ai_usage + the response', () => {
    const endBlock = stream.slice(stream.indexOf("b.action === 'end'"));
    expect(endBlock).toContain('phoneDemo');
    expect(endBlock).toContain('transcriptShowsCapturedContact(transcript)');
    expect(endBlock).toContain("{ lead_saved: true, lead_id: reportLeadId }");
    expect(endBlock).toContain("marker: 'phone_demo_lead_missing'");
    expect(endBlock).toContain("marker: 'no_contact_captured'");
    expect(endBlock).toContain("console.error('PHONE_DEMO_LEAD_MISSING', call.id)");
    expect(endBlock).toContain('phone_demo_audit: phoneDemoAudit');
    expect(endBlock).toContain("{ ok: true, ...(phoneDemoAudit ? { phone_demo_audit: phoneDemoAudit } : {}) }");
    // The existing transfer reconciliation stays intact ahead of the audit.
    expect(endBlock).toContain("transferObj.outcome === 'pending'");
  });
});
