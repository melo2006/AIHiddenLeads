// @vitest-environment node
// Publish #68 — the capture-integrity batch (Ron's live Frank test,
// 2026-11-15):
//
//  1. FORM RE-PRESENTATION — the dismissed card was one-shot; Frank
//     had no way to re-issue it after the owner tapped outside it
//     and asked three times to "put the form back on". Pinned here:
//     the proxy remembers the last presented card, the
//     re_present_confirmation_card tool and the client's reopen_action
//     message both re-issue it as a synthetic pending action, and a
//     completed confirm retires it.
//  2. CONTACT + CONSENT DURABILITY — Frank captured the visitor's
//     mobile in session 4 (grouped read-back) and announced "I do
//     not have a mobile number on file for you" in session 6. The
//     recap carried conversation, not captured facts. Pinned here:
//     the CapturedContact merge/normalize/block contract, the proxy
//     stamp + seed, the gemini-session recovery keyed on the IP-free
//     visitorKeyHash (#64), and both booking routes resolving SMS
//     consent through the durable store before the lead fallback
//     (composing with, not replacing, the #65 card-route fix).
//  3. CAPTURE RITUAL — the email was disclosed only after two
//     challenges and spelled a session late. Pinned here: the
//     ritual policy text (spell the email, grouped phone read-back,
//     "Did I get that right?", the texting ask at the same moment,
//     record_captured_contact).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capturedContactFromUnknown,
  capturedContactFromConfig,
  mergeCapturedContact,
  capturedContactBlock,
  type CapturedContact,
} from '../../supabase/functions/_shared/captured-contact';
import {
  CAPTURE_RITUAL_POLICY,
  CARD_REPRESENT_POLICY,
} from '../../supabase/functions/_shared/visitor-followup';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');
const sessionSource = read('supabase/functions/gemini-session/index.ts');
const clientSource = read('src/components/GeminiConversation.tsx');

const NOW = new Date('2026-11-15T15:00:00.000Z');
const FULL: CapturedContact = {
  name: 'Tony Miller',
  email: 'tony@example.com',
  phone: '954-770-6622',
  smsConsent: true,
  confirmed: false,
  updatedAt: NOW.toISOString(),
};

describe('capturedContactFromUnknown — a stored stamp is data, not truth', () => {
  it('round-trips a well-formed stamp', () => {
    expect(capturedContactFromUnknown(FULL)).toEqual(FULL);
  });

  it('rejects garbage and fact-free values', () => {
    expect(capturedContactFromUnknown(null)).toBeNull();
    expect(capturedContactFromUnknown('call me')).toBeNull();
    expect(capturedContactFromUnknown({})).toBeNull();
    expect(capturedContactFromUnknown({ name: '  ', email: '', phone: '' })).toBeNull();
    expect(capturedContactFromUnknown({ smsConsent: true, confirmed: true })).toBeNull();
  });

  it('drops a non-boolean smsConsent and a non-true confirmed', () => {
    const out = capturedContactFromUnknown({ phone: '954-770-6622', smsConsent: 'yes', confirmed: 'true' });
    expect(out).toEqual({ name: '', email: '', phone: '954-770-6622', confirmed: false, updatedAt: '' });
  });

  it('reads the stamp out of a session config, and only there', () => {
    expect(capturedContactFromConfig({ capturedContact: FULL })?.phone).toBe('954-770-6622');
    expect(capturedContactFromConfig({})).toBeNull();
    expect(capturedContactFromConfig(null)).toBeNull();
    expect(capturedContactFromConfig({ visitorContact: FULL })).toBeNull();
  });
});

describe('mergeCapturedContact — capture moments accumulate, never erase', () => {
  it('builds a stamp from nothing', () => {
    const out = mergeCapturedContact(null, { name: ' Tony Miller ', email: 'Tony@Example.com', phone: '954-770-6622' }, NOW);
    expect(out).toEqual({ name: 'Tony Miller', email: 'tony@example.com', phone: '954-770-6622', confirmed: false, updatedAt: NOW.toISOString() });
  });

  it('an empty field never erases a captured one (the card that omits the phone)', () => {
    const out = mergeCapturedContact(FULL, { name: 'Tony Miller', email: 'tony@example.com', phone: '' }, NOW);
    expect(out.phone).toBe('954-770-6622');
  });

  it('a corrected detail replaces the old one', () => {
    const out = mergeCapturedContact(FULL, { phone: '954-555-0100' }, NOW);
    expect(out.phone).toBe('954-555-0100');
    expect(out.email).toBe('tony@example.com');
  });

  it('smsConsent moves only on an explicit boolean — silence is not an answer', () => {
    expect(mergeCapturedContact(null, { phone: '954-770-6622' }, NOW).smsConsent).toBeUndefined();
    expect(mergeCapturedContact(FULL, {}, NOW).smsConsent).toBe(true);
    expect(mergeCapturedContact(FULL, { smsConsent: false }, NOW).smsConsent).toBe(false);
    expect(mergeCapturedContact(FULL, { smsConsent: 'yes' }, NOW).smsConsent).toBe(true);
  });

  it('confirmed is sticky: once confirmed on screen, later verbal captures never un-confirm', () => {
    const confirmed = { ...FULL, confirmed: true };
    expect(mergeCapturedContact(confirmed, { phone: '954-555-0100' }, NOW).confirmed).toBe(true);
    expect(mergeCapturedContact(FULL, { confirmed: true }, NOW).confirmed).toBe(true);
    expect(mergeCapturedContact(FULL, {}, NOW).confirmed).toBe(false);
  });
});

describe('capturedContactBlock — the successor session is told the facts are HELD', () => {
  it('is empty without a stamp, so unstamped sessions stay byte-identical', () => {
    expect(capturedContactBlock(null)).toBe('');
    expect(capturedContactBlock({ name: '', email: '', phone: '', confirmed: false, updatedAt: '' })).toBe('');
  });

  it('states every captured fact and forbids the missing-claim outright', () => {
    const block = capturedContactBlock(FULL);
    expect(block).toContain('ALREADY CAPTURED FOR THIS VISITOR');
    expect(block).toContain('Name: Tony Miller.');
    expect(block).toContain('Email: tony@example.com.');
    expect(block).toContain('Mobile: 954-770-6622.');
    expect(block).toContain('Never say or imply that you do not have any detail listed here');
    expect(block).toContain('never ask the visitor to repeat one');
  });

  it('renders the three consent states distinctly', () => {
    expect(capturedContactBlock(FULL)).toContain('Texting consent: GIVEN');
    expect(capturedContactBlock({ ...FULL, smsConsent: false })).toContain('Texting consent: DECLINED');
    const unasked = { ...FULL };
    delete unasked.smsConsent;
    expect(capturedContactBlock(unasked)).toContain('Texting consent: not yet asked');
  });

  it('an unconfirmed stamp routes to the pre-filled card; a confirmed one says so', () => {
    expect(capturedContactBlock(FULL)).toContain('NOT yet confirmed on screen');
    expect(capturedContactBlock(FULL)).toContain('request_platform_followup');
    expect(capturedContactBlock({ ...FULL, confirmed: true })).toContain('confirmed by the visitor on screen earlier in this visit');
  });

  it('REGRESSION (Frank, session 6): a mobile captured in one session is a held fact in the next', () => {
    // Session A: the verbal capture is merged and stamped on the row.
    const stamped = mergeCapturedContact(null, { name: 'Tony Miller', phone: '954-770-6622', smsConsent: true }, NOW);
    const rowConfig = { visitorKeyHash: 'abc', capturedContact: stamped };
    // Session B (the reconnect): gemini-session recovers the stamp
    // from the row config and the proxy renders it into the prompt.
    const recovered = capturedContactFromConfig(rowConfig);
    expect(recovered?.phone).toBe('954-770-6622');
    const block = capturedContactBlock(recovered);
    expect(block).toContain('Mobile: 954-770-6622.');
    // The exact failure sentence is the one the block forbids.
    expect(block).toContain('Never say or imply that you do not have any detail listed here');
  });
});

describe('the capture ritual + re-presentation policies (defects 3 and 1a)', () => {
  it('the ritual confirms back at the moment of capture, not sessions later', () => {
    expect(CAPTURE_RITUAL_POLICY).toContain('THE MOMENT A DETAIL IS GIVEN');
    expect(CAPTURE_RITUAL_POLICY).toContain('spell the email letter by letter');
    expect(CAPTURE_RITUAL_POLICY).toContain('natural spoken groups');
    expect(CAPTURE_RITUAL_POLICY).toContain('"Did I get that right?"');
    expect(CAPTURE_RITUAL_POLICY).toContain('never leave its read-back for later or for another session');
  });

  it('the texting ask rides the capture moment, and a spoken yes is consent', () => {
    expect(CAPTURE_RITUAL_POLICY).toContain('THE TEXTING ASK RIDES THE SAME MOMENT');
    expect(CAPTURE_RITUAL_POLICY).toContain('a spoken yes is consent');
    expect(CAPTURE_RITUAL_POLICY).toContain('a no is final for this visit');
    expect(CAPTURE_RITUAL_POLICY).toContain('record_captured_contact');
  });

  it('a dismissal is not a refusal, and only the visitor own ask re-opens the form', () => {
    expect(CARD_REPRESENT_POLICY).toContain('closing the on-screen confirmation form is NOT a refusal');
    expect(CARD_REPRESENT_POLICY).toContain('re_present_confirmation_card');
    expect(CARD_REPRESENT_POLICY).toContain('"put the form back on"');
    expect(CARD_REPRESENT_POLICY).toContain('never re-present it unprompted');
  });

  it('both policies ride every proxy prompt, beside the readback policy', () => {
    expect(proxySource).toContain('${CAPTURE_RITUAL_POLICY}\\n${CARD_REPRESENT_POLICY}`');
    expect(proxySource).toContain('${capturedContactBlock(capturedContact)}');
  });
});

describe('proxy wiring — durable store (defect 2)', () => {
  it('seeds session state from the config stamp; a confirmed stamp seeds confirmedContact', () => {
    expect(proxySource).toContain('capturedContactFromUnknown(config.capturedContact)');
    expect(proxySource).toContain('capturedContact?.confirmed ? { name: capturedContact.name, email: capturedContact.email, phone: capturedContact.phone } : null');
  });

  it('stamps merges back onto the session row config, read-merge-write', () => {
    expect(proxySource).toContain('const stampCapturedContact = () => {');
    expect(proxySource).toContain("db.from('gemini_voice_sessions').select('config').eq('id', session.id).maybeSingle()");
    expect(proxySource).toContain("db.from('gemini_voice_sessions').update({ config: { ...rowConfig, capturedContact: snapshot } }).eq('id', session.id)");
    expect(proxySource).toContain('capturedContact = mergeCapturedContact(capturedContact, patch)');
  });

  it('records captures at every capture moment: ritual tool, card issuance, card confirms, book_call consent', () => {
    expect(proxySource).toContain("call.name === 'record_captured_contact'");
    expect(proxySource).toContain('if (call.name !== \'request_platform_appointment\') noteCapture(contact);');
    expect(proxySource).toContain('noteCapture({...contact,confirmed:true}); lastCardAction=null;');
    expect(proxySource).toContain('noteCapture({name:contact.name,email:contact.email,confirmed:true}); lastCardAction=null;');
    expect(proxySource).toContain('noteCapture({name:cardContact.name,email:cardContact.email,phone:cardContact.phone,confirmed:true');
    expect(proxySource).toContain("if (typeof call.args?.smsConsent === 'boolean') noteCapture({ smsConsent: call.args.smsConsent });");
  });

  it('the ritual tool is declared with its consent field, and answers as a note — never a save', () => {
    const at = proxySource.indexOf("{name:'record_captured_contact'");
    expect(at).toBeGreaterThan(-1);
    const decl = proxySource.slice(at, proxySource.indexOf('}},', at) + 3);
    expect(decl).toContain('smsConsent:{type:\'BOOLEAN\'}');
    expect(proxySource).toContain("respond({recorded:true,note:'Details noted for this visit and carried across reconnects.");
  });

  it('both booking routes resolve consent: explicit answer, then the durable store, then the lead row', () => {
    const bookCallAt = proxySource.indexOf("call.name === 'book_call'");
    const bookCallRoute = proxySource.slice(bookCallAt, proxySource.indexOf("call.name === 'platform_availability'", bookCallAt));
    const argAt = bookCallRoute.indexOf('call.args?.smsConsent');
    const storeAt = bookCallRoute.indexOf('capturedContact?.smsConsent');
    const leadAt = bookCallRoute.indexOf("select('sms_consent')");
    expect(argAt).toBeGreaterThan(-1);
    expect(storeAt).toBeGreaterThan(argAt);
    expect(leadAt).toBeGreaterThan(storeAt);

    const cardAt = proxySource.indexOf("action.call.name === 'request_platform_followup'");
    const cardRoute = proxySource.slice(cardAt, proxySource.indexOf("msg.type === 'audio'", cardAt));
    const payloadAt = cardRoute.indexOf('msg.contact?.smsConsent');
    const cardStoreAt = cardRoute.indexOf('capturedContact?.smsConsent');
    const cardLeadAt = cardRoute.indexOf("select('sms_consent')");
    expect(payloadAt).toBeGreaterThan(-1);
    expect(cardStoreAt).toBeGreaterThan(payloadAt);
    expect(cardLeadAt).toBeGreaterThan(cardStoreAt);
  });
});

describe('proxy wiring — form re-presentation (defect 1)', () => {
  it('declares re_present_confirmation_card with NO parameters object (the 2026-11-12 incident shape)', () => {
    const at = proxySource.indexOf("{name:'re_present_confirmation_card'");
    expect(at).toBeGreaterThan(-1);
    const decl = proxySource.slice(at, proxySource.indexOf('},', at) + 2);
    expect(decl).not.toContain('parameters');
    expect(proxySource).not.toMatch(/properties:\s*\{\s*\}/);
  });

  it('remembers the last presented card at issuance, with the exact contact it carried', () => {
    expect(proxySource).toContain('lastCardAction = { name: call.name, contact: contact as {name:string;email:string;phone:string}, slotStart };');
  });

  it('the tool re-issues the remembered card as a synthetic pending action and answers at once', () => {
    const at = proxySource.indexOf("call.name === 're_present_confirmation_card'");
    const branch = proxySource.slice(at, proxySource.indexOf("call.name === 'request_platform_followup'", at));
    expect(branch).toContain('if (!lastCardAction)');
    expect(branch).toContain('pendingActions.set(reopenId,{call:{id:reopenId,name:lastCardAction.name},slotStart:lastCardAction.slotStart,synthetic:true,demo:lastCardAction.demo});');
    expect(branch).toContain("clientSocket.send(JSON.stringify({type:'confirm_action',id:reopenId,action:lastCardAction.name,contact:lastCardAction.contact,slotStart:lastCardAction.slotStart,demo:lastCardAction.demo}));");
    expect(branch).toContain('respond({presented:true,action:lastCardAction.name');
  });

  it('the client chip path (reopen_action) re-issues the same card the same way', () => {
    const at = proxySource.indexOf("msg.type === 'reopen_action'");
    expect(at).toBeGreaterThan(-1);
    const branch = proxySource.slice(at, proxySource.indexOf("msg.type === 'audio'", at));
    expect(branch).toContain('if (lastCardAction && pendingActions.size === 0) {');
    expect(branch).toContain('synthetic:true');
  });

  it('a synthetic confirm performs the action but answers by injection, never a tool response', () => {
    expect(proxySource).toContain('if (action.synthetic) {');
    const at = proxySource.indexOf('if (action.synthetic) {');
    const block = proxySource.slice(at, proxySource.indexOf("msg.type === 'reopen_action'", at));
    expect(block).toContain('clientContent:{turns:[{role:\'user\',parts:[{text:note}]}],turnComplete:true}');
    expect(block).toContain('!farewellTimer');
    // The tool response survives for real actions only, in the else.
    expect(block).toContain('toolResponse:{functionResponses:[{...action.call,response}]}');
  });

  it('a completed booking retires the card; a failed one stays re-presentable', () => {
    expect(proxySource).toContain('if((booked as {ok?:boolean}).ok) lastCardAction=null;');
  });
});

describe('gemini-session wiring — recovery across sessions (defect 2)', () => {
  it('recovers the stamp inside the synthesis lookups, segment rows included', () => {
    expect(sessionSource).toContain("from '../_shared/captured-contact.ts'");
    expect(sessionSource).toContain('scanCaptured(priorRows);');
    expect(sessionSource).toContain('scanCaptured(fallbackRows);');
    expect(sessionSource).toContain('let priorCaptured: CapturedContact | null = null;');
  });

  it('a full-recap reconnect gets a second, config-only recovery chance', () => {
    expect(sessionSource).toContain('Publish #68, second chance');
    expect(sessionSource).toContain('if (!priorCaptured && !b.personaSegment && !b.preview && !b.draft && !b.share && !b.guide && b.reconnect === true) {');
  });

  it('stamps the recovered facts onto the assembled config, assembly line untouched', () => {
    expect(sessionSource).toContain('if (priorCaptured) config.capturedContact = priorCaptured;');
    expect(sessionSource).toContain('...config,visitorKeyHash,timeZone:effectiveTimeZone');
  });
});

describe('client wiring — the waiting chip (defect 1b)', () => {
  it('renders the chip with the exact label, in both panel layouts', () => {
    expect(clientSource).toContain('Form waiting — tap to open');
    expect(clientSource.split('{formWaitingChip}').length - 1).toBe(2);
    expect(clientSource).toContain('!pendingAction && waitingAction');
  });

  it('a dismissal moves the card into the waiting slot; a confirm retires it', () => {
    // Item 5 form fix (2026-11-21): a confirm now also retires the
    // parent-held draft; a dismissal keeps both the waiting slot
    // and the draft for the re-presentation.
    expect(clientSource).toContain('if (approved) { setWaitingAction(null); trackDemoDraft(null); } else setWaitingAction(pendingAction);');
    expect(clientSource).toContain('if (approved) { setWaitingAction(null); trackContactDraft(pendingAction.action, null); } else setWaitingAction(pendingAction);');
  });

  it('a provider cancellation also leaves the chip behind', () => {
    expect(clientSource.split('if (pendingActionRef.current) setWaitingAction(pendingActionRef.current);').length - 1).toBe(2);
  });

  it('the chip tap asks the proxy to re-issue the card', () => {
    expect(clientSource).toContain("JSON.stringify({ type: 'reopen_action' })");
  });

  it('a fresh card supersedes the chip, and teardown clears it', () => {
    expect(clientSource).toContain('trackPendingAction(msg as unknown as VoiceAction);\n            setWaitingAction(null);');
    expect(clientSource.split('setWaitingAction(null);').length - 1).toBeGreaterThanOrEqual(4);
  });
});
