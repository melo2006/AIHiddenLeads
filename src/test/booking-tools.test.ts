// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';
import {
  checkTimeAvailability,
  dayPartForIso,
  parseDayPart,
  preferredDatesFor,
  resolveNamedTime,
  selectOfferSet,
  spokenSlotLabel,
} from '../../supabase/functions/_shared/booking-tools';
import { generateSlots, type Slot } from '../../supabase/functions/_shared/booking-slots';
import { ASPEN_SLOT_OFFER_METHOD, PHONE_DEMO_HOST_POLICY } from '../../supabase/functions/_shared/phone-demo';
import { bookCallWithConfirmations } from '../../supabase/functions/_shared/booking-confirm';

const slot = (iso: string, dateStr: string, label: string): Slot => ({ iso, dateStr, label });
// Wednesday 2026-11-18 (EST, UTC-5): 8:30 AM / 11 AM / 2 PM Eastern.
const WED = '2026-11-18';
const wedSlots: Slot[] = [
  slot('2026-11-18T13:30:00.000Z', WED, '8:30 AM'),
  slot('2026-11-18T14:00:00.000Z', WED, '9:00 AM'),
  slot('2026-11-18T16:00:00.000Z', WED, '11:00 AM'),
  slot('2026-11-18T19:00:00.000Z', WED, '2:00 PM'),
  slot('2026-11-18T21:30:00.000Z', WED, '4:30 PM'),
];

describe('spokenSlotLabel', () => {
  test('weekday + date + time + Eastern, digits for the time', () => {
    expect(spokenSlotLabel('2026-11-18T16:00:00.000Z')).toBe('Wednesday, November 18 at 11 AM Eastern');
    expect(spokenSlotLabel('2026-11-18T13:30:00.000Z')).toBe('Wednesday, November 18 at 8:30 AM Eastern');
    expect(spokenSlotLabel('2026-11-18T19:00:00.000Z')).toBe('Wednesday, November 18 at 2 PM Eastern');
  });
  test('weekday stays correct across DST boundaries (spring forward and fall back)', () => {
    // DST 2026: springs forward Sun Mar 8 (EDT, UTC-4), falls back Sun Nov 1 (EST, UTC-5).
    expect(spokenSlotLabel('2026-03-09T15:00:00.000Z')).toBe('Monday, March 9 at 11 AM Eastern');
    expect(spokenSlotLabel('2026-11-02T16:00:00.000Z')).toBe('Monday, November 2 at 11 AM Eastern');
  });
});

describe('dayPartForIso / parseDayPart', () => {
  test('ET day-parts: morning < 12, midday 12–2, afternoon ≥ 2', () => {
    expect(dayPartForIso('2026-11-18T13:30:00.000Z')).toBe('morning'); // 8:30 AM ET
    expect(dayPartForIso('2026-11-18T17:30:00.000Z')).toBe('midday'); // 12:30 PM ET
    expect(dayPartForIso('2026-11-18T19:00:00.000Z')).toBe('afternoon'); // 2 PM ET
  });
  test('evening maps to afternoon (the calendar ends at 6 PM Eastern)', () => {
    expect(parseDayPart('evening')).toBe('afternoon');
    expect(parseDayPart('Morning')).toBe('morning');
    expect(parseDayPart('whenever')).toBeNull();
  });
});

describe('preferredDatesFor', () => {
  const now = new Date('2026-11-16T15:00:00.000Z'); // Monday Nov 16, 10 AM ET
  test('today / tomorrow / day_after resolve in ET', () => {
    expect(preferredDatesFor('today', now)).toEqual(['2026-11-16']);
    expect(preferredDatesFor('tomorrow', now)).toEqual(['2026-11-17']);
    expect(preferredDatesFor('day_after', now)).toEqual(['2026-11-18']);
    expect(preferredDatesFor('next_day', now)).toEqual(['2026-11-18']);
    expect(preferredDatesFor(undefined, now)).toBeUndefined();
  });
});

describe('selectOfferSet (Ron slot-offer method)', () => {
  test('no preference: up to 3 real slots, ≥90 minutes apart, spread when the day allows', () => {
    // A day with a genuine midday slot spreads across all three day-parts.
    const wedWithMidday = [...wedSlots, slot('2026-11-18T17:30:00.000Z', WED, '12:30 PM')];
    const spread = selectOfferSet(wedWithMidday, {});
    expect(spread).toHaveLength(3);
    expect(new Set(spread.map(o => o.dayPart)).size).toBe(3);
    // The fixture day itself (no midday slot) still yields 3 spaced picks.
    const offer = selectOfferSet(wedSlots, {});
    expect(offer).toHaveLength(3);
    for (let i = 1; i < offer.length; i++) {
      expect(Date.parse(offer[i].iso) - Date.parse(offer[i - 1].iso)).toBeGreaterThanOrEqual(90 * 60_000);
    }
    expect(offer.filter(o => o.recommended)).toHaveLength(1);
    for (const o of offer) expect(wedSlots.map(s => s.iso)).toContain(o.iso); // real slots only
  });
  test('day-part preference: the recommended anchor is in the preferred part', () => {
    const offer = selectOfferSet(wedSlots, { dayPart: 'afternoon' });
    expect(offer.some(o => o.dayPart === 'afternoon')).toBe(true);
    expect(offer.find(o => o.recommended)?.dayPart).toBe('afternoon');
    for (let i = 1; i < offer.length; i++) {
      expect(Date.parse(offer[i].iso) - Date.parse(offer[i - 1].iso)).toBeGreaterThanOrEqual(90 * 60_000);
    }
  });
  test('preferred date: the anchor sits on that date; other days only fill honestly', () => {
    const thu = slot('2026-11-19T15:00:00.000Z', '2026-11-19', '10:00 AM');
    const offer = selectOfferSet([...wedSlots, thu], { preferredDates: ['2026-11-19'] });
    expect(offer.find(o => o.recommended)?.iso).toBe(thu.iso);
    expect(offer.some(o => o.iso === thu.iso)).toBe(true);
    for (const o of offer) expect([...wedSlots, thu].map(s => s.iso)).toContain(o.iso); // real slots only
  });
  test('fewer than 3 available: returns what exists, still spaced', () => {
    const two = [wedSlots[0], wedSlots[2]]; // 8:30 and 11 — 150 min apart
    const offer = selectOfferSet(two, {});
    expect(offer.map(o => o.iso)).toEqual(two.map(s => s.iso));
    const packed = [wedSlots[0], wedSlots[1]]; // 8:30 and 9:00 — only 30 min apart
    const packedOffer = selectOfferSet(packed, {});
    // Spacing beats count: never pack back-to-back-ish slots to fill the set beyond 2.
    expect(packedOffer.length).toBeLessThanOrEqual(2);
    expect(packedOffer.length).toBeGreaterThanOrEqual(1);
  });
  test('none available: empty offer, never an invented slot', () => {
    expect(selectOfferSet([], {})).toEqual([]);
  });
  test('every offered slot carries its spoken label', () => {
    const offer = selectOfferSet(wedSlots, {});
    expect(offer.find(o => o.iso === '2026-11-18T16:00:00.000Z')?.spokenLabel).toBe('Wednesday, November 18 at 11 AM Eastern');
  });
});

describe('check_time', () => {
  const valid = generateSlots(new Date('2026-11-16T15:00:00.000Z')); // full grid from Mon Nov 16 10 AM ET
  const availWed = valid.filter(s => s.dateStr === WED);
  const now = new Date('2026-11-16T15:00:00.000Z');

  test('a free, valid named time is bookable', () => {
    const named = resolveNamedTime({ date: WED, time: '11:00 AM' });
    const r = checkTimeAvailability({ slots: availWed, validSlots: valid, named, now });
    expect(r.bookable).toBe(true);
    if (r.bookable) expect(r.slot.spokenLabel).toBe('Wednesday, November 18 at 11 AM Eastern');
  });
  test('a valid grid time that is taken reports taken_or_unavailable with real alternatives', () => {
    const named = resolveNamedTime({ date: WED, time: '11:00 AM' });
    const without = availWed.filter(s => s.iso !== named!.toISOString());
    const r = checkTimeAvailability({ slots: without, validSlots: valid, named, now });
    expect(r.bookable).toBe(false);
    if (!r.bookable) {
      expect(r.reason).toBe('taken_or_unavailable');
      expect(r.alternatives.length).toBeGreaterThan(0);
      for (const a of r.alternatives) expect(without.map(s => s.iso)).toContain(a.iso);
    }
  });
  test('an off-grid time (11:15) is not_a_slot, with alternatives', () => {
    const named = resolveNamedTime({ date: WED, time: '11:15 AM' });
    const r = checkTimeAvailability({ slots: availWed, validSlots: valid, named, now });
    expect(r.bookable).toBe(false);
    if (!r.bookable) expect(r.reason).toBe('not_a_slot');
  });
  test('a past time reports past', () => {
    const named = resolveNamedTime({ iso: '2026-11-16T14:00:00.000Z' }); // 9 AM ET, before now (10 AM ET)
    const r = checkTimeAvailability({ slots: availWed, validSlots: valid, named, now });
    expect(r.bookable).toBe(false);
    if (!r.bookable) expect(r.reason).toBe('past');
  });
  test('an unparseable time is invalid and still returns real alternatives', () => {
    const r = checkTimeAvailability({ slots: availWed, validSlots: valid, named: resolveNamedTime({ date: 'next week-ish', time: 'whenever' }), now });
    expect(r.bookable).toBe(false);

    if (!r.bookable) { expect(r.reason).toBe('invalid'); expect(r.alternatives.length).toBeGreaterThan(0); }
  });
  test('resolveNamedTime accepts a full ISO datetime as-is', () => {
    expect(resolveNamedTime({ iso: '2026-11-18T16:00:00.000Z' })?.toISOString()).toBe('2026-11-18T16:00:00.000Z');
    expect(resolveNamedTime({ date: WED, time: '2:30 PM' })?.toISOString()).toBe('2026-11-18T19:30:00.000Z');
    expect(resolveNamedTime({ date: WED, time: '14:30' })?.toISOString()).toBe('2026-11-18T19:30:00.000Z');
  });
});

describe('ASPEN_SLOT_OFFER_METHOD prompt pins (both paths)', () => {
  test('carries the spec lines verbatim: preference-first, confirm, fallbacks, hesitation', () => {
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('What works best for you — later today, tomorrow morning, or would the next day be better? All we need is 15 to 20 minutes of your time.');
    expect(ASPEN_SLOT_OFFER_METHOD).toContain("You're set for [weekday] at [time] Eastern.");
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('No problem at all — what time would work better for you?');
    expect(ASPEN_SLOT_OFFER_METHOD).toContain("I'll text you the booking link with the recap — grab any time that suits you, no rush.");
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('https://aihiddenleads.com/book');
    expect(ASPEN_SLOT_OFFER_METHOD).toContain("It's just 15 to 20 minutes — and if it's not a fit, we'll know in the first five and I'll let you go.");
  });
  test('pins the never-invent rule and the one-anchor rule', () => {
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('NEVER invent a time');
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('NEVER claim the calendar is busier or scarcer than the tool says');
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('Most people grab the [recommended time]');
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('at most once');
    expect(ASPEN_SLOT_OFFER_METHOD).toContain('never re-ask for details you already have');
  });
  test('the phone host policy embeds the same method as STEP 8 (no drift)', () => {
    expect(PHONE_DEMO_HOST_POLICY).toContain('STEP 8 — BOOK THE IMPLEMENTATION CALL LIVE');
    expect(PHONE_DEMO_HOST_POLICY).toContain(ASPEN_SLOT_OFFER_METHOD);
    expect(PHONE_DEMO_HOST_POLICY).toContain('book_call');
    expect(PHONE_DEMO_HOST_POLICY).toContain('get_availability');
    expect(PHONE_DEMO_HOST_POLICY).toContain('check_time');
  });
});

describe('bookCallWithConfirmations wiring', () => {
  const mailLane = {
    organizerEmail: 'info@aihiddenleads.com',
    sendAlert: async () => true,
    sendConfirmation: async () => true,
  };
  function bookingDb(bookingId: string) {
    const state = { smsAttempts: [] as string[] };
    const db = {
      from: (table: string) => {
        if (table === 'implementation_calls') {
          return {
            select: () => ({ neq: () => ({ gte: async () => ({ data: [], error: null }) }) }),
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: bookingId }, error: null }) }) }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => ({
                is: () => ({ select: async () => ({ data: patch.confirmation_sms_sent_at ? [{ id: bookingId }] : [], error: null }) }),
                then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
              }),
            }),
          };
        }
        if (table === 'sms_opt_outs') return { select: () => ({ in: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
        if (table === 'sms_delivery_log') {
          return {
            insert: async (row: Record<string, unknown>) => { state.smsAttempts.push(String(row.template_id)); return { error: null }; },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    return { db, state };
  }
  async function stubGoogle() {
    const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    let b64 = ''; pkcs8.forEach(b => { b64 += String.fromCharCode(b); });
    return `-----BEGIN PRIVATE KEY-----\n${btoa(b64).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----`;
  }
  const envFor = (pem: string) => (name: string) =>
    name === 'GOOGLE_SA_PRIVATE_KEY' ? pem
      : name === 'GOOGLE_SA_CLIENT_EMAIL' ? 'test@example.iam.gserviceaccount.com'
        : name === 'TWILIO_ACCOUNT_SID' ? 'ACtest'
          : name === 'TWILIO_AUTH_TOKEN' ? 'test-token'
            : undefined;

  test('stored consent true: booking + exactly one confirmation SMS via the shared helper', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T10:00:00Z'));
    const pem = await stubGoogle();
    vi.stubGlobal('Deno', { env: { get: envFor(pem) } });
    const twilioCalls: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      if (url.includes('/events?sendUpdates=')) return new Response(JSON.stringify({ id: 'event-1' }));
      if (url.includes('api.twilio.com')) { twilioCalls.push(url); return new Response(JSON.stringify({ sid: 'SM123', status: 'queued' })); }
      if (url.includes('calendar')) return new Response(JSON.stringify({ items: [] }));
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { db, state } = bookingDb('44444444-4444-4444-8444-444444444444');
    try {
      const slotStart = new Date(Date.parse('2026-10-26T10:00:00Z') + 6 * 3600_000).toISOString(); // Mon 12 PM ET, valid
      const result = await bookCallWithConfirmations(db, {
        name: 'Jane Prospect', email: 'jane@example.com', phone: '9547706622',
        slotStart, smsConsent: true, // the stored lead-consent answer, propagated by the tool
      }, { mailLane });
      expect(result.ok).toBe(true);
      expect(result.confirmationSms).toBe('sent');
      expect(result.emailSent).toBe(true);
      expect(twilioCalls).toHaveLength(1); // exactly one confirmation text
      expect(state.smsAttempts.filter(t => t === 'booking_confirmation')).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  test('in-flow consent false: no SMS attempt at all', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T10:00:00Z'));
    const pem = await stubGoogle();
    vi.stubGlobal('Deno', { env: { get: envFor(pem) } });
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      if (url.includes('/events?sendUpdates=')) return new Response(JSON.stringify({ id: 'event-1' }));
      if (url.includes('api.twilio.com')) throw new Error('SMS must not be attempted without consent');
      return new Response(JSON.stringify({ items: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { db } = bookingDb('55555555-5555-4555-8555-555555555555');
    try {
      const slotStart = new Date(Date.parse('2026-10-26T10:00:00Z') + 6 * 3600_000).toISOString();
      const result = await bookCallWithConfirmations(db, {
        name: 'Jane Prospect', email: 'jane@example.com', phone: '9547706622',
        slotStart, smsConsent: false, // the in-flow answer to the permission ask
      }, { mailLane });
      expect(result.ok).toBe(true);
      expect(result.confirmationSms).toBe('not_consented');
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});
