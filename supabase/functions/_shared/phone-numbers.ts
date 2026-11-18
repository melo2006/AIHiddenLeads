// Self-serve number search + provisioning for the wizard phone step
// (phone step v2, 2026-11-18). Talks to the Telnyx v2 API the same way
// telephony-server/telnyx.mjs does: Bearer key from env
// (TELNYX_API_KEY), voice connection from TELNYX_CONNECTION_ID, base
// https://api.telnyx.com/v2 (TELNYX_API_BASE override). The vendor name
// never appears in customer-facing copy — the wizard says "our phone
// platform"; this module is server-side only.
//
// MONEY RULE: a real purchase happens ONLY when TELNYX_PROVISION_MODE
// is exactly 'live'. Every other value (including unset) is dry-run:
// the pick is recorded, activation stays an ops step, and no order is
// ever placed. Search is read-only and always safe.

export const TELNYX_API_BASE_DEFAULT = 'https://api.telnyx.com/v2';

export interface NumberSearchQuery {
  /** 3-digit US area code (national destination code). */
  areaCode?: string;
  /** 5-digit ZIP — Telnyx has no ZIP filter, so the ZIP resolves to its
   *  state and the search runs state-wide; results are labelled with
   *  their city/rate center so the owner picks the closest one. */
  zip?: string;
  /** Vanity text: letters/digits the number should contain. Letters are
   *  mapped to keypad digits (PLUMB -> 75862) before searching. */
  contains?: string;
  /** Max candidates to return (default 10, hard cap 25). */
  limit?: number;
}

export interface NumberCandidate {
  /** E.164, e.g. +19545550134. */
  phoneNumber: string;
  /** City the number is local to, when the provider reports it. */
  locality?: string;
  /** State/region code, e.g. FL. */
  region?: string;
  /** Rate center name, when reported. */
  rateCenter?: string;
  /** Provider monthly cost as a decimal string, when reported. */
  monthlyCost?: string;
  /** Provider one-time cost as a decimal string, when reported. */
  upfrontCost?: string;
  features: string[];
}

const KEYPAD: Record<string, string> = {
  A: '2', B: '2', C: '2', D: '3', E: '3', F: '3', G: '4', H: '4', I: '4',
  J: '5', K: '5', L: '5', M: '6', N: '6', O: '6', P: '7', Q: '7', R: '7',
  S: '7', T: '8', U: '8', V: '8', W: '9', X: '9', Y: '9', Z: '9',
};

/** Normalize vanity input to the digit string the provider matches
 *  against: letters become keypad digits, everything else is dropped.
 *  Returns null when nothing searchable remains. */
export function vanityToDigits(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.toUpperCase().split('').map((c) => (c >= '0' && c <= '9' ? c : KEYPAD[c] || '')).join('');
  return digits.length >= 2 ? digits.slice(0, 10) : null;
}

/** ZIP3 (first three digits) -> state. Sectional-center ranges are
 *  stable postal geography; used only to scope a state-wide search, so
 *  an edge miss costs nothing — results are city-labelled. */
const ZIP3_STATE: [number, number, string][] = [
  [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 59, 'VT'],
  [60, 69, 'CT'], [70, 89, 'NJ'], [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'],
  [200, 205, 'DC'], [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'],
  [290, 299, 'SC'], [300, 319, 'GA'], [320, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'],
  [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'],
  [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'], [570, 577, 'SD'],
  [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'], [660, 679, 'KS'],
  [680, 699, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'], [750, 799, 'TX'],
  [800, 816, 'TX'], [820, 831, 'WY'], [832, 832, 'TX'], [833, 838, 'ID'], [840, 847, 'UT'],
  [850, 865, 'AZ'], [870, 884, 'NM'], [885, 885, 'TX'], [890, 898, 'NV'], [900, 961, 'CA'],
  [967, 968, 'HI'], [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK'],
];

export function zipToState(zip: string | undefined): string | null {
  if (!zip || !/^\d{5}$/.test(zip)) return null;
  const prefix = Number(zip.slice(0, 3));
  const hit = ZIP3_STATE.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  return hit ? hit[2] : null;
}

export interface NormalizedSearch {
  areaCode?: string;
  state?: string;
  containsDigits?: string;
  limit: number;
}

/** Validate + normalize a client search request. Throws Error with a
 *  customer-safe message on unusable input. */
export function normalizeSearchQuery(q: NumberSearchQuery): NormalizedSearch {
  const areaCode = (q.areaCode || '').replace(/\D/g, '');
  if (areaCode && areaCode.length !== 3) throw new Error('Enter a 3-digit area code');
  const state = areaCode ? undefined : zipToState(q.zip);
  if (q.zip && !areaCode && !state) throw new Error('We could not place that ZIP code — try an area code instead');
  const containsDigits = vanityToDigits(q.contains) || undefined;
  if (!areaCode && !state && !containsDigits) throw new Error('Enter an area code, a ZIP code, or a word your number should spell');
  const limit = Math.min(Math.max(Math.trunc(q.limit || 10), 1), 25);
  return { areaCode: areaCode || undefined, state, containsDigits, limit };
}

/** Build the provider's available-numbers URL for a normalized search. */
export function buildNumberSearchUrl(apiBase: string, s: NormalizedSearch): string {
  const base = (apiBase || TELNYX_API_BASE_DEFAULT).replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('filter[country_code]', 'US');
  params.append('filter[features][]', 'voice');
  params.append('filter[features][]', 'sms');
  params.set('filter[limit]', String(s.limit));
  // The provider errors (10031) on an exhausted exact match unless
  // best_effort is on; with it, a drained area code returns nearby
  // numbers instead — every candidate shows its real digits and city,
  // so the owner always sees what they are actually picking.
  params.set('filter[best_effort]', 'true');
  if (s.areaCode) params.set('filter[national_destination_code]', s.areaCode);
  else if (s.state) params.set('filter[administrative_area]', s.state);
  if (s.containsDigits) params.set('filter[phone_number][contains]', s.containsDigits);
  return `${base}/available_phone_numbers?${params.toString()}`;
}

interface TelnyxRegionInfo { region_type?: string; region_name?: string }
interface TelnyxAvailableNumber {
  phone_number?: string;
  region_information?: TelnyxRegionInfo[];
  cost_information?: { monthly_cost?: string; upfront_cost?: string };
  features?: { name?: string }[] | string[];
}

/** Map one provider payload to clean candidates (pure — unit-tested
 *  against a captured live response). */
export function parseAvailableNumbers(payload: unknown): NumberCandidate[] {
  const data = (payload as { data?: TelnyxAvailableNumber[] })?.data;
  if (!Array.isArray(data)) return [];
  const out: NumberCandidate[] = [];
  for (const n of data) {
    if (!n?.phone_number) continue;
    // Live-verified region types (2026-11-18): 'location', 'state',
    // 'rate_center', 'country_code'. The 'locality' /
    // 'administrative_area' spellings are kept as fallbacks.
    const region = (...types: string[]) => {
      for (const t of types) { const v = n.region_information?.find((r) => r.region_type === t)?.region_name; if (v) return v; }
      return undefined;
    };
    out.push({
      phoneNumber: n.phone_number,
      locality: region('location', 'locality'),
      region: region('state', 'administrative_area'),
      rateCenter: region('rate_center'),
      monthlyCost: n.cost_information?.monthly_cost,
      upfrontCost: n.cost_information?.upfront_cost,
      features: Array.isArray(n.features) ? n.features.map((f) => (typeof f === 'string' ? f : f?.name || '')).filter(Boolean) : [],
    });
  }
  return out;
}

export class PhonePlatformError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

type FetchImpl = (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

async function telnyxFetch(fetchImpl: FetchImpl, apiKey: string, url: string, init: Record<string, unknown> = {}) {
  let res: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...(init.headers as Record<string, string> || {}) },
      // AbortSignal.timeout is absent in some runtimes (jsdom tests).
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(15000) : undefined,
    });
  } catch {
    throw new PhonePlatformError('Number search is unavailable right now — please try again in a moment');
  }
  const text = await res.text();
  if (!res.ok) throw new PhonePlatformError('Number search is unavailable right now — please try again in a moment', res.status === 401 || res.status === 403 ? 503 : 502);
  try { return JSON.parse(text); } catch { return {}; }
}

/** Read-only inventory search. Safe to call any time. */
export async function searchAvailableNumbers(opts: {
  apiKey: string; apiBase?: string; query: NumberSearchQuery; fetchImpl?: FetchImpl;
}): Promise<{ numbers: NumberCandidate[]; search: NormalizedSearch }> {
  if (!opts.apiKey) throw new PhonePlatformError('Number search is not available yet — save your setup and our team will assign your number', 503);
  const search = normalizeSearchQuery(opts.query);
  const url = buildNumberSearchUrl(opts.apiBase || TELNYX_API_BASE_DEFAULT, search);
  const payload = await telnyxFetch(opts.fetchImpl || (fetch as unknown as FetchImpl), opts.apiKey, url);
  return { numbers: parseAvailableNumbers(payload), search };
}

/** The provisioning mode gate. ONLY the exact value 'live' may spend. */
export function provisioningMode(env: Record<string, string | undefined>): 'live' | 'dry-run' {
  return env.TELNYX_PROVISION_MODE === 'live' ? 'live' : 'dry-run';
}

export type ProvisionPlan =
  | { action: 'already'; number: string; source: 'agent' | 'telephony' }
  | { action: 'provision'; number: string };

/** Idempotency decision (pure): a number that is already assigned — on
 *  the agent draft or on the telephony row — is adopted, never bought
 *  again. Only a fresh pick with no assignment anywhere is provisioned. */
export function planProvisioning(state: { aspenNumber?: string; telephonyVoiceNumber?: string }, selectedNumber: string): ProvisionPlan {
  if (state.aspenNumber) return { action: 'already', number: state.aspenNumber, source: 'agent' };
  if (state.telephonyVoiceNumber) return { action: 'already', number: state.telephonyVoiceNumber, source: 'telephony' };
  return { action: 'provision', number: selectedNumber };
}

/** Place the actual order (live mode only — callers must gate on
 *  provisioningMode). Orders the number onto the voice connection so
 *  inbound calls reach the answering platform immediately. */
export async function createNumberOrder(opts: {
  apiKey: string; apiBase?: string; connectionId: string; phoneNumber: string; fetchImpl?: FetchImpl;
}): Promise<{ orderId?: string }> {
  if (!opts.connectionId) throw new PhonePlatformError('Number activation is not configured yet — our team will finish your activation', 503);
  const base = (opts.apiBase || TELNYX_API_BASE_DEFAULT).replace(/\/$/, '');
  const payload = await telnyxFetch(opts.fetchImpl || (fetch as unknown as FetchImpl), opts.apiKey, `${base}/number_orders`, {
    method: 'POST',
    body: JSON.stringify({ phone_numbers: [{ phone_number: opts.phoneNumber }], connection_id: opts.connectionId }),
  }) as { data?: { id?: string } };
  return { orderId: payload?.data?.id };
}

/** Check whether the platform account already owns a number (live-mode
 *  idempotency at the provider, in case a previous order succeeded but
 *  the local write did not). */
export async function findOwnedNumber(opts: {
  apiKey: string; apiBase?: string; phoneNumber: string; fetchImpl?: FetchImpl;
}): Promise<{ id: string; connectionId?: string } | null> {
  const base = (opts.apiBase || TELNYX_API_BASE_DEFAULT).replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('filter[phone_number]', opts.phoneNumber);
  const payload = await telnyxFetch(opts.fetchImpl || (fetch as unknown as FetchImpl), opts.apiKey, `${base}/phone_numbers?${params.toString()}`) as { data?: { id?: string; connection_id?: string }[] };
  const row = Array.isArray(payload?.data) ? payload.data[0] : undefined;
  return row?.id ? { id: row.id, connectionId: row.connection_id } : null;
}

/** Point an owned number at the voice connection (live mode only). */
export async function assignNumberConnection(opts: {
  apiKey: string; apiBase?: string; phoneNumberId: string; connectionId: string; fetchImpl?: FetchImpl;
}): Promise<void> {
  const base = (opts.apiBase || TELNYX_API_BASE_DEFAULT).replace(/\/$/, '');
  await telnyxFetch(opts.fetchImpl || (fetch as unknown as FetchImpl), opts.apiKey, `${base}/phone_numbers/${encodeURIComponent(opts.phoneNumberId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ connection_id: opts.connectionId }),
  });
}
