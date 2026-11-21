// Dictated-contact cleanup for the voice confirmation cards
// (homepage-test item 5, form half, 2026-11-21).
//
// The model's raw tool arguments used to become the confirmation
// form's prefill untouched — the proxy only truncated them to
// length limits — so a spelled-out email arrived as transcription
// garbage ("AXGX…4000") with no repair before display. These are
// the ports of the browser helpers in src/lib/demoVerification.ts
// (kept in step manually — the Deno proxy cannot import src/; the
// parity is pinned by src/test/item5-form-persistence.test.tsx),
// applied in the proxy tool handler BEFORE the pending action is
// created, so the card, the re-presentation record and the durable
// capture all carry the cleaned candidate. Cleanup never claims
// correctness: the card labels the values as heard and the visitor
// corrects them on screen; only the browser-confirmed contact is
// ever saved (confirmedVisitorContact).

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

/** Port of normalizeDictatedEmail in src/lib/demoVerification.ts. */
export function normalizeDictatedEmail(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[[\](),;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\batsign\b/g, '@')
    .replace(/\bat\b/g, '@')
    .replace(/\bdot\b/g, '.')
    .replace(/\bunderscore\b/g, '_')
    .replace(/\bhyphen\b|\bdash\b/g, '-')
    .replace(/\bplus\b/g, '+')
    .replace(/\s+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\.@/g, '@')
    .replace(/@\./g, '@')
    .replace(/\.$/, '');
}

/** Port of normalizeDictatedPhone in src/lib/demoVerification.ts. */
export function normalizeDictatedPhone(raw: string): string {
  if (!raw) return '';
  const wordDigits = raw
    .toLowerCase()
    .split(/[\s,.\-()]+/)
    .map((token) => DIGIT_WORDS[token] ?? token)
    .join(' ');
  const digits = wordDigits.replace(/\D/g, '');
  if (!digits) return raw.trim();
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** The pending-action contact with dictated email/phone cleaned. */
export function normalizePendingContact<T extends { name: string; email: string; phone: string }>(contact: T): T {
  return {
    ...contact,
    email: normalizeDictatedEmail(contact.email),
    phone: normalizeDictatedPhone(contact.phone),
  };
}
