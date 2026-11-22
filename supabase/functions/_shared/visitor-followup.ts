export const CONTACT_READBACK_POLICY = `CONTACT CONFIRMATION POLICY (overrides older contact instructions): Before requesting platform follow-up, ask the visitor to spell their first and last name, even when supplied on the form. Read the name spelling back letter by letter at a brisk but intelligible pace, and ask if correct. Spell the email address back, saying at, dot, hyphen and underscore explicitly. Read the phone number digit by digit if offered; never require an optional phone. READ EACH DETAIL BACK EXACTLY ONCE: the moment the visitor confirms a detail — in any words — it is CONFIRMED for the whole visit, and you never read it back again, never "reconfirm" it, never stack two or three read-backs of the same detail into one turn, and never re-run its read-back after a reconnect; if a detail needs correcting, read back ONLY the corrected detail, once. Wait for the visitor's verbal confirmation or corrections; do not infer agreement from silence. Then show the on-screen confirmation so the visitor can check what they heard. VERBAL AGREEMENT COMPLETES THE FORM (2026-11-22): if the visitor agrees IN WORDS — to the follow-up, to the email or the text, at any point, before the form appears or while it is on screen — that spoken yes IS their consent: the form ticks its own box and saves by itself, and the consent is recorded as given verbally in this conversation. Never ask a visitor who has agreed in words to tap or tick anything, and never wait in silence for a tap that is no longer needed; when the save result comes back, answer with ONE short confirmation line (what you will send, stated honestly) and move on. If the visitor has NOT agreed in words, they may tick the box and tap Confirm themselves — or, if the form sits unanswered, you may ask ONCE in words whether they mind ticking the box. A button click never replaces the verbal readback. Never claim saving succeeded before the successful tool result.`;

/** CAPTURE RITUAL (Publish #68, 2026-11-15 — Ron's Frank test: the
 *  email was disclosed only after he challenged the presenter twice
 *  and spelled out a session late; the mobile was read back in one
 *  session and "not on file" two sessions later). The readback the
 *  CONTACT CONFIRMATION POLICY stages before the platform card is
 *  too late and too narrow: EVERY capture moment — in role for the
 *  simulated business or out of role for AI Hidden Leads — confirms
 *  back at the moment of capture, and the texting ask rides that
 *  same moment instead of surfacing (or not) at booking time. The
 *  record_captured_contact call is what makes the capture durable
 *  (see _shared/captured-contact.ts): a detail that was only ever
 *  spoken lives in a transcript window and can be elided out of a
 *  successor's memory; a recorded one is stamped as a fact.
 *
 *  Publish #70 (2026-11-15): the #68 verification proved the
 *  read-back fires reliably but the TEXTING ASK did not — when the
 *  visitor merely confirmed, the presenter transitioned without
 *  asking, twice. This policy text alone was the only driver, so
 *  #70 backs it mechanically (see _shared/consent-ask.ts): the
 *  record tool's response orders the ask when it is still owed,
 *  and the proxy nudges at turn boundaries until a boolean answer
 *  is recorded. The ritual sequence is also gated explicitly here:
 *  read-back → confirmation → texting ask → record. */
export const CAPTURE_RITUAL_POLICY = `CAPTURE RITUAL — THE MOMENT A DETAIL IS GIVEN (Publish #68): the instant the visitor gives you an email address or a phone number — in role or out of it, for the business or for AI Hidden Leads — confirm it back in that same exchange, before anything else moves on: spell the email letter by letter — EVERY character of the whole address, one at a time, start to finish, saying at, dot, hyphen and underscore for the symbols (t-o-n-y, at, t-e-s-t, dot, c-o-m) — never read any part of an address as a whole word or chunk: "tony dot test at example dot com" is NOT a spell-back and does not confirm the address; read the phone back in its natural spoken groups (area code, then the next three digits, then the last four), and ask one short question: "Did I get that right?" Wait for their answer. If they correct anything, take the correction, read the corrected detail back once, and only then continue. Never let a captured detail pass unconfirmed in the moment, and never leave its read-back for later or for another session. THE TEXTING ASK RIDES THE SAME MOMENT: when a mobile number is captured and texting consent has not already been given or declined, the ask is the very next thing after the visitor confirms the read-back — before you record, before any new topic, transition or question — ask right then, in role, the way the business would ("May we text you on this number?"); out of role, for AI Hidden Leads the same plain ask — and take the answer as it lands: a spoken yes is consent, a no is final for this visit, and neither is ever re-asked. RECORD THE CAPTURE AT ONCE: when the visitor has confirmed the read-back AND answered the texting ask, call record_captured_contact with the confirmed details and the texting answer — that is what makes the capture stick across reconnects. If you record before the texting answer is in, the tool result will tell you the ask is still owed (consentAskRequired): obey it at once — your next spoken turn is the texting question, and when the visitor answers you call record_captured_contact again with only the answer (smsConsent) to finish the capture. Recording never claims a real-world save, booking or message: in role it notes the details for this visit, and platform saves run through the on-screen confirmation exactly as the contact confirmation policy states. READ-BACK HAPPENS ONCE PER DETAIL, EVER (2026-11-22): a detail you have read back and the visitor has confirmed is settled — never read it back a second time, in this conversation, in a later turn, or after any reconnect, and never run the ritual again for a detail your ALREADY CAPTURED facts already hold: those were read back when they were captured. And never ask the texting question before a mobile number has actually been given and read back in this conversation — there is no "this number" until one exists.`;

/** FORM RE-PRESENTATION (Publish #68, 2026-11-15 — Ron's Frank test:
 *  he dismissed the contact card with an outside tap, then asked
 *  three times to "put the form back on" and the presenter had no
 *  way to re-issue it — the card was one-shot, and the close's
 *  never-ask-again discipline read his explicit ask as a refusal to
 *  argue with). A dismissal is not a refusal, and the visitor's own
 *  request to see the form again is the one thing that always
 *  re-opens it. The proxy backs this with the
 *  re_present_confirmation_card tool, which re-issues the SAME card
 *  with the SAME details — no detail is ever re-asked. */
export const CARD_REPRESENT_POLICY = `FORM RE-PRESENTATION (Publish #68): closing the on-screen confirmation form is NOT a refusal — visitors close it by accident, to look at something first, or because it covered what they were reading. If the visitor asks, in any words, to see the form again — "put the form back on", "show me the form", "I closed it", "I wasn't finished", "bring it back" — call re_present_confirmation_card at once: the same form returns with the same details already in it. Never re-ask for a detail they already gave, never make them repeat anything, and never treat the earlier closing as a no. Only the visitor's own ask re-opens the form: never re-present it unprompted, and if they decline the follow-up or the booking itself — as opposed to closing its form — accept that warmly and do not raise the form again unless they ask.`;

export function contactReadback(contact: { name: string; email: string; phone: string }) {
  return {
    name: contact.name.trim().split(/\s+/).map(part => Array.from(part).join(' - ')).join(' / '),
    email: Array.from(contact.email.trim()).map(char => ({ '@': 'at', '.': 'dot', '-': 'hyphen', '_': 'underscore' }[char] || char)).join(' '),
    phone: Array.from(contact.phone).filter(char => /\d/.test(char)).join(' '),
  };
}

export function confirmedVisitorContact(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Confirm your contact details first.');
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const email = typeof v.email === 'string' ? v.email.trim().toLowerCase() : '';
  const phone = typeof v.phone === 'string' ? v.phone.trim() : '';
  if (v.consent !== true || !name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || phone.length > 30 || (phone && !/^\+?[\d ()-]{7,30}$/.test(phone))) throw new Error('Confirm your name, valid email and optional phone, and allow follow-up.');
  return { name, email, phone };
}