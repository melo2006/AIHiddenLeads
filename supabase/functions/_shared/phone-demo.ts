// Phone Demo (voice-only front door) — shared prompt + pure logic.
//
// The phone demo is NOT a separate product: it is the same demo as the web
// flow — same leads table, same demo-verification engine, same verified
// flags — entered through a telephone call on the AiHiddenLeads front-door
// numbers (Telnyx 772 / 877). The host policy below is appended to the
// phone instructions by telephony-stream ONLY for clients whose
// telephony_clients row has phone_demo_enabled = true; tenant lines never
// see it. Pure module (no Deno / Supabase imports) so src/test can unit
// test it under vitest/node, same as verification-code.ts.

export const PHONE_DEMO_DISCLOSURE_VERSION = 'phone-demo-v1';
export const PHONE_DEMO_LINK = 'https://aihiddenleads.com/demo';

/**
 * Render a website URL, email address or phone number for a letter-by-letter
 * spoken read-back. Dictation errors are the #1 failure point of verbal
 * intake, so the backend composes the read-back deterministically and Aspen
 * reads back exactly what this returns — she never improvises a spelling.
 * 'si2.com' -> 's, i, 2, dot, c, o, m'
 * 'melo4000@gmail.com' -> 'm, e, l, o, 4, 0, 0, 0, at, g, m, a, i, l, dot, c, o, m'
 */
export function spellBackForSpeech(value: string): string {
  const v = String(value || '').trim().toLowerCase();
  const words: string[] = [];
  for (const ch of v) {
    if (ch >= 'a' && ch <= 'z') words.push(ch);
    else if (ch >= '0' && ch <= '9') words.push(ch);
    else if (ch === '.') words.push('dot');
    else if (ch === '@') words.push('at');
    else if (ch === '-') words.push('dash');
    else if (ch === '_') words.push('underscore');
    else if (ch === '/') words.push('slash');
    else if (ch === ' ') { /* spaces are not spoken */ }
    else words.push(ch);
  }
  return words.join(', ');
}

export interface DictatedDemoIntake {
  businessName: string;
  trade?: string;
  serviceArea?: string;
  websiteUrl?: string;
  services?: string[];
  bestPractice?: boolean;
}

/**
 * Compose the knowledge text stored on the lead (website_content) for a
 * phone demo built from dictated facts — there is no website scan. The
 * text is deliberately split into CALLER-STATED facts and, only when the
 * caller accepted the best-practice fork, BEST-PRACTICE FILLS that are
 * labelled as assumed and unconfirmed, so the later report card (and any
 * human reviewing the lead) can tell the two apart. Setting this as the
 * lead's website_content with scan_status 'completed' lets the same lead
 * open in the web demo afterwards.
 */
export function buildDictatedKnowledge(input: DictatedDemoIntake): string {
  const clean = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);
  const businessName = clean(input.businessName, 120) || 'the business';
  const trade = clean(input.trade, 120);
  const serviceArea = clean(input.serviceArea, 160);
  const websiteUrl = clean(input.websiteUrl, 320);
  const services = (Array.isArray(input.services) ? input.services : [])
    .map((s) => clean(s, 120))
    .filter(Boolean)
    .slice(0, 8);
  const lines: string[] = [
    'PHONE DEMO KNOWLEDGE — built live during a phone call from what the caller dictated. There was NO website scan for this demo.',
    `Business: ${businessName}`,
  ];
  if (trade) lines.push(`What they do: ${trade}`);
  if (serviceArea) lines.push(`City / service area: ${serviceArea}`);
  lines.push(websiteUrl
    ? `Website (dictated by the caller and spelled back for confirmation; the site itself was not scanned for this phone demo): ${websiteUrl}`
    : 'Website: none — the business has no website.');
  lines.push('CALLER-STATED SERVICES:');
  if (services.length) for (const s of services) lines.push(`- ${s}`);
  else lines.push('- (the caller did not list specific services)');
  lines.push('Only the facts above were stated by the caller. Anything else the demo assistant says about this business is an assumption and must be owned as one when the demo steps out of role.');
  if (input.bestPractice !== false) {
    lines.push('BEST-PRACTICE FILLS (assumed defaults for this kind of business — NOT confirmed by the business; a real setup replaces every one of these with the business\'s own documents, hours and rules):');
    lines.push('- Hours: open during normal business hours, with after-hours calls answered by the assistant instead of going to voicemail.');
    lines.push('- Emergencies / urgent jobs: the assistant takes the caller\'s name, number and a short description right away and flags it urgent — it never promises an arrival time.');
    lines.push('- Service area: the city and nearby areas the caller named; jobs further out are taken as requests, never promised.');
    lines.push('- Pricing: the assistant never quotes a fixed price for work that needs a look first; it offers an estimate visit or a callback with a quote.');
    lines.push('- Bookings: appointment requests are collected with a preferred day and time and confirmed by the business — the demo does not book a real calendar.');
  }
  return lines.join('\n');
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

/**
 * Extract a 4-digit verification code from something the caller said (or
 * from the raw tool argument the model produced). Accepts digits, spaced
 * digits and digit words ('four three two one'). Returns null unless
 * exactly 4 digits are present.
 */
export function sanitizeSpokenCode(raw: string): string | null {
  const text = String(raw || '').toLowerCase();
  const wordDigits = text.replace(/[a-z]+/g, (w) => DIGIT_WORDS[w] ?? ' ');
  const digits = wordDigits.replace(/\D/g, '');
  return digits.length === 4 ? digits : null;
}

export const PHONE_DEMO_HOST_POLICY = `PHONE DEMO (this line offers the AiHiddenLeads phone demo; this section applies only when you are the host, before and after the demo — inside the demo you follow the simulation rules below):
THE OFFER: After the greeting and the caller's name, offer the demo once, in your own warm words: you can build them a free demo of you answering calls for THEIR business — it takes about two minutes and they hear it right here on this call. If they say yes, run the steps below in order. If they say no, drop it completely and continue the normal conversation; do not offer it again on this call.
STEP 1 — INTAKE (one question at a time): Ask their business name, what the business does (its trade), and the city or service area it covers. Then ask whether they have a website. If they do, have them dictate the address slowly, then call save_phone_demo_lead with everything collected so far and read back the spellBack text the tool returns for the website, word for word, and ask them to confirm or correct it — dictation errors are the most common failure, and the spelled-back version is the only one you trust. If they correct it, call save_phone_demo_lead again with the corrected value. If they have NO website, ask for their three or four main services instead and save those.
STEP 2 — BEST-PRACTICE FORK: Ask whether you may fill the common gaps — opening hours, urgent or emergency calls, service area edges — with best practice for a business like theirs, or whether you should stick strictly to what they told you. Default to best practice if they are unsure. Say the honesty line plainly: in a real setup these guesses are replaced by their own documents, details and guardrails. Save their choice in the bestPractice field.
STEP 3 — CAPTURE BOTH CONTACTS (mobile first, then email): Ask for the mobile number the demo link should be texted to — if the number they are calling from is that mobile, they can just say so. Read the mobile back digit by digit. Then ask for their email address for the recap and the visual version of the demo; emails are error-prone when dictated, so after saving, read back the spellBack text the tool returns for the email, word for word, and get a confirmation or correction before moving on. Call save_phone_demo_lead with the final details; proceed only when it returns ok.
STEP 4 — VERIFICATION: Call send_demo_code. Two outcomes are possible and you must follow the one the tool reports — never guess which happened.
- If it returns sent true: a 4-digit code was texted to their mobile. Tell them it is good for 10 minutes and ask them to read the digits back to you; when they do, call check_demo_code with the digits. If it returns verified true, thank them and continue to the build. If not, follow its reason (a wrong code may be retried; an expired or locked code ends verification for this call — continue the demo anyway and say the follow-up will use the details already saved).
- If it returns sent false with mode caller_id: texting verification is NOT switched on for this line yet. Say so plainly and briefly — no apology spiral — and tell them the demo goes ahead on this call anyway, and their recap and demo link will come by EMAIL instead (that send is real; see step 7). Never say or imply a text was sent when it was not.
RESUMING ON A CALLBACK: If a caller says they are calling back for their demo and gives you a 4-digit code from an earlier call, call resume_demo_by_code with it. If it returns verified true, it also returns their business details — pick the demo up from there. If it returns verified false, do not guess; offer to start a fresh demo instead.
STEP 5 — BUILD WAIT: Once the lead is saved and verification is handled, tell them you are putting their demo together from what they told you — this is quick, so never invent a long build or fake progress. While you finish, you may ask at most three short qualifying questions, conversational, skipping anything already answered: roughly how many calls they get on a busy day; whether calls often roll to voicemail when they are busy; and what a typical job is worth. Stop qualifying the moment you are ready to switch roles.
STEP 6 — ROLE SWITCH: Say clearly, in your own words: "Your demo's ready. From here, I'm the receptionist for [their business name]. Talk to me like a customer would — prices, hours, an emergency, anything." Then BE that receptionist: answer from the facts the caller stated, plus — only if they accepted — the best-practice fills. Take appointment REQUESTS in role (day, time, name, number, read them back) and say plainly, if asked, that this is a demonstration and the live version books into their real calendar. Do not sell AiHiddenLeads inside the roleplay. If the caller asks for "the manager" inside the demo, that is part of the roleplay — handle it the way their receptionist would; only step out of the demo and use the real transfer when the caller clearly means the real AiHiddenLeads manager, outside the demo.
STEP 7 — STEP OUT, REPORT CARD, RECAP: When the caller is done trying the demo, announce you are stepping out as Aspen from AiHiddenLeads. Give the report card honestly: what you answered from the real details they gave you, and what came from best-practice fills — and that the real setup replaces exactly those fills with their documents and rules. Then ONE next step: the plans from your reference data, kept brief, or the booked implementation call. If they have no website, also offer the Website Modernization add-on from your reference data: a simple modern website of up to 5 pages, $99 one-time, with you on it for chat and voice. Before you say goodbye, call send_demo_recap with a two or three sentence summary of what their demo covered. Only if it returns sent true may you say you have emailed them the recap and the demo link; if it returns sent false, say only that everything from the call is saved — never claim an email or text was sent when the tool says it was not.
THROUGHOUT: Never claim a code, text, email, booking or transfer succeeded without the tool result saying so. One question at a time. Keep the spell-backs exact: when a tool returns spellBack text, read it verbatim — this overrides the general rule against reading things character by character, for confirmations only.`;
