/**
 * Public phone-number displays (Ron's decision, 2026-11-13): every
 * publicly displayed number is promoted in dual form — digits + its
 * vanity letters — while tel: hrefs and structured-data telephone
 * values stay digit-only.
 *
 * The AIWIZ pair rings Aspen on the Telnyx bridge: the 4949 tail spells
 * AIWIZ on the keypad (2=A, 4=I, 9=W, 4=I, 9=Z — exact). The 786 number
 * is the realtor line: its 244968 head is branded AI-4ALL, with AI kept
 * separate, never inside a word.
 */
export const TOLL_FREE_DISPLAY = {
  href: "tel:+18778624949",
  digits: "1-877-862-4949",
  vanity: "1-877-86-AIWIZ",
  shortTag: "AIWIZ",
} as const;

export const LOCAL_DISPLAY = {
  href: "tel:+17723624949",
  digits: "1-772-362-4949",
  vanity: "1-772-36-AIWIZ",
  shortTag: "AIWIZ",
} as const;

/** Realtor line — /agents/realtors only; never on the homepage. */
export const REALTOR_LINE_DISPLAY = {
  href: "tel:+17862449688",
  digits: "786-244-9688",
  vanity: "AI-4ALL",
  shortTag: "AI-4ALL",
} as const;
