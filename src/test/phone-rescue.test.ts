// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PHONE_DEMO_LINK } from '../../supabase/functions/_shared/phone-demo';
import { RESCUE_TEMPLATE_ID, resolvePhoneDemoRescue } from '../../supabase/functions/_shared/phone-rescue';

const LEAD_ID = '1ead0000-0000-4000-8000-000000000001';
const TO = '+19547706622';
const EXPECTED_BODY = [
  'Hi, this is Aspen from AiHiddenLeads — looks like we got cut off.',
  `Here's the demo link from your call — review it any time or forward it to your manager: ${PHONE_DEMO_LINK}`,
  'Want the 15 to 20 minute walkthrough? Book any time: https://aihiddenleads.com/book',
  'Reply STOP to opt out',
].join('\n');

/** PostgREST-shaped fake over in-memory tables, mirroring twilio-sms.ts's
 * query usage (select/in/eq/neq/limit/maybeSingle + insert). */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const inserted: { table: string; row: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const rows = tables[table] ?? [];
      return {
        select: () => {
          const filters: [string, string, unknown][] = [];
          let limitN: number | null = null;
          const apply = () => rows.filter(r => filters.every(([op, col, val]) => {
            if (op === 'eq') return r[col] === val;
            if (op === 'neq') return r[col] !== val;
            return Array.isArray(val) && (val as unknown[]).includes(r[col]);
          })).slice(0, limitN ?? undefined);
          const chain: Record<string, unknown> = {
            eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return chain; },
            neq: (c: string, v: unknown) => { filters.push(['neq', c, v]); return chain; },
            in: (c: string, v: unknown) => { filters.push(['in', c, v]); return chain; },
            limit: (n: number) => { limitN = n; return chain; },
            maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
            then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: apply(), error: null }),
          };
          return chain;
        },
        insert: async (row: Record<string, unknown>) => { inserted.push({ table, row }); rows.push(row); return { error: null }; },
      };
    },
  };
  return { db, inserted };
}

const leadRow = (patch: Record<string, unknown> = {}) => ({
  id: LEAD_ID, email: 'sam@example.com', phone: '9547706622', sms_consent: true, ...patch,
});
const logRow = (patch: Record<string, unknown> = {}) => ({
  lead_id: LEAD_ID, to_phone: TO, template_id: 'phone_demo_recap', status: 'delivered', ...patch,
});
const tables = (patch: Record<string, Record<string, unknown>[]> = {}) => ({
  leads: [leadRow()],
  sms_opt_outs: [],
  sms_delivery_log: [],
  implementation_calls: [],
  ...patch,
});

let twilioBodies: URLSearchParams[] = [];
let twilioOk = true;

beforeEach(() => {
  twilioBodies = [];
  twilioOk = true;
  // twilio-sms.ts reads its env through the Deno global (it declares a
  // minimal local Deno type), so stub that global — same pattern
  // booking-ics tests use for Deno-shaped modules.
  vi.stubGlobal('Deno', { env: { get: (name: string) => ({
    TWILIO_ACCOUNT_SID: 'AC-test',
    TWILIO_AUTH_TOKEN: 'auth-test',
    SUPABASE_URL: 'https://example.supabase.co',
  } as Record<string, string>)[name] } });
  vi.stubGlobal('fetch', async (_url: string, init: { body: URLSearchParams }) => {
    twilioBodies.push(init.body);
    return {
      ok: twilioOk,
      status: twilioOk ? 201 : 400,
      json: async () => (twilioOk ? { sid: 'SM-test-1', status: 'queued' } : { message: 'bad number', code: 21211 }),
    };
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('resolvePhoneDemoRescue (phone-demo-rescue handler logic)', () => {
  test('happy path: sends exactly once, with the rescue template and the exact body', async () => {
    const { db, inserted } = fakeDb(tables());
    const result = await resolvePhoneDemoRescue(db, LEAD_ID);
    expect(result).toEqual({ sent: true, messageSid: 'SM-test-1' });
    expect(twilioBodies).toHaveLength(1);
    expect(twilioBodies[0].get('To')).toBe(TO);
    expect(twilioBodies[0].get('Body')).toBe(EXPECTED_BODY);
    expect(twilioBodies[0].get('MessagingServiceSid')).toBeTruthy();
    const logged = inserted.filter(i => i.table === 'sms_delivery_log');
    expect(logged).toHaveLength(1);
    expect(logged[0].row.template_id).toBe(RESCUE_TEMPLATE_ID);
    expect(logged[0].row.lead_id).toBe(LEAD_ID);
  });

  test('repeat invocation is a no-op: the ledger row the first send wrote blocks the second', async () => {
    const { db } = fakeDb(tables());
    const first = await resolvePhoneDemoRescue(db, LEAD_ID);
    expect(first.sent).toBe(true);
    const second = await resolvePhoneDemoRescue(db, LEAD_ID);
    expect(second).toEqual({ sent: false, reason: 'already_sent' });
    expect(twilioBodies).toHaveLength(1);
  });

  test('consent false → no send', async () => {
    const { db } = fakeDb(tables({ leads: [leadRow({ sms_consent: false })] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'no_consent' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('consent never recorded (null) → no send', async () => {
    const { db } = fakeDb(tables({ leads: [leadRow({ sms_consent: null })] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'no_consent' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('opted out (STOP on file) → no send', async () => {
    const { db } = fakeDb(tables({ sms_opt_outs: [{ phone: TO }] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'opted_out' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('a prior RECAP send blocks the rescue (never recap + rescue)', async () => {
    const { db } = fakeDb(tables({ sms_delivery_log: [logRow()] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'already_sent' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('a prior RESCUE send blocks a second rescue', async () => {
    const { db } = fakeDb(tables({ sms_delivery_log: [logRow({ template_id: RESCUE_TEMPLATE_ID })] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'already_sent' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('a FAILED prior attempt in either template counts against the cross-template retry budget', async () => {
    const oneFail = fakeDb(tables({ sms_delivery_log: [logRow({ status: 'failed' })] }));
    expect((await resolvePhoneDemoRescue(oneFail.db, LEAD_ID)).sent).toBe(true); // one retry allowed
    const twoFails = fakeDb(tables({
      sms_delivery_log: [
        logRow({ status: 'failed' }),
        logRow({ template_id: RESCUE_TEMPLATE_ID, status: 'failed' }),
      ],
    }));
    expect(await resolvePhoneDemoRescue(twoFails.db, LEAD_ID)).toEqual({ sent: false, reason: 'retry_exhausted' });
    expect(twilioBodies).toHaveLength(1); // only the retry send above
  });

  test('a non-cancelled booking for the lead email → skip as already_booked', async () => {
    const { db } = fakeDb(tables({ implementation_calls: [{ id: 'b1', email: 'sam@example.com', status: 'confirmed' }] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'already_booked' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('a CANCELLED booking does not block the rescue', async () => {
    const { db } = fakeDb(tables({ implementation_calls: [{ id: 'b1', email: 'sam@example.com', status: 'cancelled' }] }));
    expect((await resolvePhoneDemoRescue(db, LEAD_ID)).sent).toBe(true);
  });

  test('a booking under a DIFFERENT email does not block the rescue', async () => {
    const { db } = fakeDb(tables({ implementation_calls: [{ id: 'b1', email: 'other@example.com', status: 'confirmed' }] }));
    expect((await resolvePhoneDemoRescue(db, LEAD_ID)).sent).toBe(true);
  });

  test('unknown lead → lead_not_found; empty lead id → lead_required', async () => {
    const { db } = fakeDb(tables({ leads: [] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'lead_not_found' });
    expect(await resolvePhoneDemoRescue(db, '')).toEqual({ sent: false, reason: 'lead_required' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('no usable mobile on the lead → no_mobile', async () => {
    const { db } = fakeDb(tables({ leads: [leadRow({ phone: null })] }));
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'no_mobile' });
    expect(twilioBodies).toHaveLength(0);
  });

  test('a Twilio failure reports send_failed (and the failed attempt is ledgered)', async () => {
    twilioOk = false;
    const { db, inserted } = fakeDb(tables());
    expect(await resolvePhoneDemoRescue(db, LEAD_ID)).toEqual({ sent: false, reason: 'send_failed' });
    const logged = inserted.filter(i => i.table === 'sms_delivery_log');
    expect(logged).toHaveLength(1);
    expect(logged[0].row.status).toBe('failed');
  });
});

describe('phone-demo-rescue wiring (source pins)', () => {
  const stream = readFileSync(new URL('../../supabase/functions/telephony-stream/index.ts', import.meta.url), 'utf8');
  test('the action is registered behind the phone-demo gate and delegates to the shared resolver', () => {
    expect(stream).toContain("b.action === 'phone-demo-rescue'");
    expect(stream).toContain('resolvePhoneDemoRescue');
    const actionAt = stream.indexOf("b.action === 'phone-demo-rescue'");
    expect(stream.slice(actionAt, actionAt + 200)).toContain('phoneDemoOn');
  });
  test('the bridge-secret gate still precedes every bridge action', () => {
    expect(stream.indexOf("x-telephony-secret")).toBeGreaterThan(-1);
    expect(stream.indexOf("x-telephony-secret")).toBeLessThan(stream.indexOf("b.action === 'phone-demo-rescue'"));
  });
});
