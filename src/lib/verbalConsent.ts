/**
 * VERBAL FOLLOW-UP CONSENT (2026-11-22, Ron's rule from the Aurelia
 * retest): when the visitor agrees IN WORDS to the email/text
 * follow-up, that spoken yes IS the consent — the on-screen form
 * ticks its own box and saves by itself, recorded as consent given
 * verbally. The deterministic half lives here, client-side, because
 * the model cannot answer its own outstanding tool call: while the
 * confirmation card is up, the presenter is blocked waiting for the
 * card, so a spoken "go ahead" reached nobody (Ron said it, Monica
 * did nothing, the form sat there with the box unticked). This
 * detector hears the agreement from the visitor's transcribed line
 * and completes the card.
 *
 * Two strengths, deliberately:
 *  - detectVerbalFollowupConsent (broad): used while the card is ON
 *    SCREEN — the card itself is the question, so any clear,
 *    short, unnegated affirmative answers it.
 *  - detectVerbalSendAgreement (narrow): used for a line spoken
 *    JUST BEFORE the card appeared — that line may have answered a
 *    different question (the read-back), so only explicit
 *    send/go-ahead agreements count, never a bare "yes" or a
 *    correctness confirmation.
 *
 * Conservative by construction (the farewell detector's house
 * pattern): normalized exact phrases and anchored shapes only,
 * short utterances only, and any negation anywhere kills the
 * match. A miss costs the visitor one tap; a false positive would
 * fabricate consent — so misses are cheap and false positives are
 * the enemy.
 */

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,!?;:"“”‘’()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NEGATIONS = [
  'no', 'not', 'never', "don't", 'dont', 'nope', 'nah',
  'nunca', 'jamais', 'nao', 'non', 'ne', 'pas', 'stop', 'wait', 'espera', 'attends',
];

const hasNegation = (normalized: string): boolean => {
  const tokens = normalized.split(' ');
  return tokens.some((token) => NEGATIONS.includes(token));
};

const MAX_WORDS = 10;

/** Exact short affirmatives, per session language (normalized:
 *  accents stripped, so "sí" and "si" both land on "si"). */
const AFFIRMATIVES = new Set([
  // English
  'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'alright', 'all right',
  'yes please', 'yeah sure', 'sure thing', 'of course', 'absolutely', 'definitely',
  'go ahead', 'go for it', 'please do', 'do it', 'send it', 'send it over',
  'please send it', 'yes send it', 'sounds good', 'that sounds good',
  "that's fine", 'thats fine', 'fine', 'correct', "that's correct", 'thats correct',
  "that's right", 'thats right', 'right', 'it is', 'yes it is', "yes that's right",
  'yes thats right', 'yes correct', 'you can', 'you may', 'yes you can', 'yes you may',
  'uh huh', 'mm hmm', 'mhm', 'go ahead and send it', 'yes go ahead', 'ok go ahead',
  'okay go ahead', 'sure go ahead', 'please go ahead', 'yes please send it',
  'text me', 'email me', 'yes text me', 'yes email me',
  // Spanish
  'si', 'claro', 'adelante', 'de acuerdo', 'esta bien', 'vale', 'perfecto',
  'por supuesto', 'claro que si', 'si por favor', 'envialo', 'envielo', 'hazlo',
  'si adelante', 'si envialo',
  // Portuguese
  'sim', 'pode', 'pode enviar', 'vai em frente', 'ta bom', 'tudo bem',
  'com certeza', 'envia', 'manda', 'sim pode', 'sim claro', 'pode ser',
  // French
  'oui', "d'accord", 'daccord', 'bien sur', 'allez y', 'allez-y', 'vas y',
  "c'est bon", 'cest bon', 'parfait', 'je veux bien', 'volontiers',
  'oui bien sur', "oui d'accord", 'oui allez y',
]);

/** Anchored composed shapes: a leading affirmative plus a
 *  send/consent verb later in the same short line. */
const AFFIRMATIVE_SHAPES: RegExp[] = [
  /^(yes|yeah|yep|yup|sure|ok|okay|alright|all right)\b.*\b(send|text|email|go ahead)\b/,
  /^(si|sim|oui|claro)\b.*\b(envia|envialo|envielo|manda|pode|allez|adelante)\b/,
  /^go ahead\b/,
  /^(please )?(send|text|email) (it|me|that)\b/,
];

/**
 * Broad detector — the confirmation card is on screen, so its
 * question is the one being answered. True only for a short,
 * unnegated, clearly affirmative utterance.
 */
export function detectVerbalFollowupConsent(text: string): boolean {
  const normalized = normalize(text || '');
  if (!normalized) return false;
  if (normalized.split(' ').length > MAX_WORDS) return false;
  if (hasNegation(normalized)) return false;
  if (AFFIRMATIVES.has(normalized)) return true;
  return AFFIRMATIVE_SHAPES.some((shape) => shape.test(normalized));
}

/** Explicit send/go-ahead agreements only — for a line spoken
 *  just before the card appeared, which may have been answering
 *  the read-back rather than the follow-up ask. */
const SEND_AGREEMENTS = new Set([
  'go ahead', 'go for it', 'send it', 'send it over', 'please send it',
  'yes send it', 'yes go ahead', 'ok go ahead', 'okay go ahead', 'sure go ahead',
  'please go ahead', 'go ahead and send it', 'yes please send it', 'do it',
  'text me', 'email me', 'yes text me', 'yes email me', 'please do',
  'adelante', 'envialo', 'envielo', 'si envialo', 'si adelante',
  'pode enviar', 'envia', 'manda', 'allez y', 'allez-y', "oui d'accord", 'oui allez y',
]);

const SEND_SHAPES: RegExp[] = [
  /^go ahead\b/,
  /\b(send|text|email) (it|me|that|over)\b/,
  /^(yes|yeah|sure|ok|okay)\b.*\b(send it|go ahead)\b/,
];

export function detectVerbalSendAgreement(text: string): boolean {
  const normalized = normalize(text || '');
  if (!normalized) return false;
  if (normalized.split(' ').length > MAX_WORDS) return false;
  if (hasNegation(normalized)) return false;
  if (SEND_AGREEMENTS.has(normalized)) return true;
  return SEND_SHAPES.some((shape) => shape.test(normalized));
}

/** The card types a spoken yes can complete by itself: the two
 *  consent-bearing cards. Appointment and demo-start cards keep
 *  the microphone hold and the tap — they commit a calendar slot
 *  or start a build, and their facts (which slot, which site) are
 *  not a yes/no question. */
export function cardCompletesVerbally(callName: string | undefined | null): boolean {
  return callName === 'request_platform_followup' || callName === 'request_conversation_copy';
}
