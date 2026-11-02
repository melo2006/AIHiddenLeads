/**
 * Display-only number formatting for Aspen's on-screen text (live captions,
 * chat box and transcript bubbles). Converts spelled-out cardinal numbers to
 * digits: "seventy-eight percent" -> "78%", "ninety-nine dollars" -> "$99",
 * "four hundred minutes" -> "400 minutes".
 *
 * This is a render-time transform of displayed text only. Spoken audio and
 * stored transcripts always keep the original words. The conversion is
 * deliberately conservative: anything it cannot parse with confidence is
 * left exactly as written.
 */

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { thousand: 1_000, million: 1_000_000 };

// Longest alternatives first, so "seventy" wins over its prefix "seven".
const NUMBER_WORD =
  '(?:seventeen|eighteen|nineteen|thirteen|fourteen|fifteen|sixteen|seventy|eighty|ninety|twenty|thirty|forty|fifty|sixty|eleven|twelve|hundred|thousand|million|seven|eight|three|four|five|nine|zero|one|two|six|ten)';

/** A spelled-number phrase plus an optional unit word that changes the rendering. */
const PHRASE_RE = new RegExp(
  `\\b(?:an?\\s+)?${NUMBER_WORD}(?:(?:\\s+and\\s+|[-\\s]+)(?:an?\\s+)?${NUMBER_WORD})*(?![A-Za-z])(\\s+(?:percent|per\\s+cent|dollars?)\\b)?`,
  'gi',
);

/** URLs and domains are never rewritten, even if a path segment spells a number. */
const URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|ai|co|dev|app)(?:\/\S*)?/gi;

/** Words that make a following standalone "one" a pronoun, not a quantity. */
const ONE_PRONOUN_PRECEDERS = new Set([
  'this', 'that', 'the', 'which', 'another', 'no', 'any', 'each', 'every', 'some',
]);

/**
 * Parse hyphen/space-separated number words ("four hundred and fifty") into a
 * value. Returns null when the phrase is not a well-formed cardinal number,
 * so the caller leaves the original text untouched.
 */
function parsePhrase(raw: string): number | null {
  const tokens = raw.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  let i = 0;
  let total = 0;
  let group = 0;
  // Within-group position: 0 = empty, 1 = ones/teens placed, 2 = tens placed
  // (a small ones may still follow), 3 = hundred placed (a tail may follow).
  let phase = 0;
  let lastBigScale = Infinity;
  let andPending = false;
  let numberTokens = 0;

  if (tokens[i] === 'a' || tokens[i] === 'an') {
    // "a hundred" / "a thousand" only; "a five" is not a number phrase.
    if (!(tokens[i + 1] === 'hundred' || tokens[i + 1] in SCALES)) return null;
    group = 1;
    phase = 1;
    i++;
  }

  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'and') {
      // A joiner is only valid right after "hundred" or a big scale, never doubled or trailing.
      const afterHundred = phase === 3;
      const afterScale = phase === 0 && group === 0 && total > 0;
      if (andPending || (!afterHundred && !afterScale) || i === tokens.length - 1) return null;
      andPending = true;
      continue;
    }
    if (t in ONES) {
      const v = ONES[t];
      if (phase === 0 || phase === 3) { group += v; phase = 1; }
      else if (phase === 2 && v >= 1 && v <= 9) { group += v; phase = 1; }
      else return null;
      andPending = false;
    } else if (t in TENS) {
      if (phase === 0 || phase === 3) { group += TENS[t]; phase = 2; }
      else return null;
      andPending = false;
    } else if (t === 'hundred') {
      if (phase !== 1 || group <= 0 || group > 9) return null;
      group *= 100;
      phase = 3;
      andPending = false;
    } else if (t in SCALES) {
      const s = SCALES[t];
      if (group <= 0 || s >= lastBigScale) return null;
      total += group * s;
      group = 0;
      phase = 0;
      lastBigScale = s;
      andPending = false;
    } else {
      return null;
    }
    numberTokens++;
  }
  if (numberTokens === 0) return null;
  return total + group;
}

/** Number words in a matched phrase, without the article/joiner tokens. */
function numberTokensOf(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== 'a' && t !== 'an' && t !== 'and');
}

export function displayNumbers(text: string): string {
  if (!text || !/[a-z]/i.test(text)) return text;

  const protectedSpans: Array<readonly [number, number]> = [];
  for (const m of text.matchAll(URL_RE)) protectedSpans.push([m.index, m.index + m[0].length]);
  const isProtected = (index: number) => protectedSpans.some(([a, b]) => index >= a && index < b);

  return text.replace(PHRASE_RE, (match, unit: string | undefined, offset: number, whole: string) => {
    if (isProtected(offset) || whole[offset - 1] === '/') return match;
    const phrase = unit ? match.slice(0, match.length - unit.length) : match;

    // The one spelled idiom that reads better as digits with a slash.
    if (!unit && numberTokensOf(phrase).join(' ') === 'twenty four seven') return '24/7';

    const value = parsePhrase(phrase);
    if (value === null) return match;

    const before = whole.slice(0, offset);
    const prevWord = /([A-Za-z]+)[^A-Za-z]*$/.exec(before)?.[1]?.toLowerCase();
    const after = whole.slice(offset + match.length);
    const nextWord = /^\s*([A-Za-z]+)/.exec(after)?.[1]?.toLowerCase();

    // Spelled decimals ("three point five") stay exactly as written.
    if (prevWord === 'point' || nextWord === 'point') return match;

    const tokens = numberTokensOf(phrase);
    if (tokens.length === 1) {
      // Hyphenated adjectives ("five-dollar", "one-time") are not quantities here.
      if (/^-[A-Za-z]/.test(after)) return match;
      if (!unit && tokens[0] === 'one') {
        // Pronoun guards: "one of the…", "this one", "one's". A unit word
        // ("one percent") makes it a quantity, so the guards skip that case.
        if (nextWord === 'of' || after.startsWith("'")) return match;
        if (prevWord && ONE_PRONOUN_PRECEDERS.has(prevWord)) return match;
      }
    }

    if (unit) {
      if (/dollars?/i.test(unit)) return `$${value}`;
      return `${value}%`; // percent / per cent
    }
    return String(value);
  });
}
