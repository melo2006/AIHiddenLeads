// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COPY_TOKEN_MAX_LENGTH,
  COPY_TOKEN_MIN_LENGTH,
  resolveConversationCopy,
  sha256Hex,
  validCopyToken,
} from '../../supabase/functions/_shared/conversation-copy';

// Executing tests for the conversation-records `copy` action.
// Before 2026-11-21 this branch had no executing test: when the deployed
// bundle diverged from source it returned HTTP 500 for valid private copy
// links and the suite stayed green. These tests run the real resolver
// (supabase/functions/_shared/conversation-copy.ts) against an in-memory
// PostgREST-shaped fake, so the hash lookup, expiry/revocation filters,
// record fetch and summary reshape are all actually exercised.

const NOW = new Date('2026-11-21T12:00:00.000Z');
// Real copy tokens are two concatenated UUIDs = 72 chars (sendRecordCopy).
const TOKEN =
  '123e4567-e89b-42d3-a456-426614174000' + '9abcdef0-1234-4abc-8def-0123456789ab';
const UNKNOWN_TOKEN =
  '00000000-0000-4000-8000-000000000000' + '00000000-0000-4000-8000-000000000000';

type Row = Record<string, any>;

/** Minimal PostgREST chain fake: applies eq/is/gt filters to in-memory
 *  rows and projects the requested select columns, like the real client. */
function mockDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let columns: string[] | null = null;
      const project = (row: Row): Row =>
        columns ? Object.fromEntries(columns.map((c) => [c, row[c]])) : row;
      const matching = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const query: any = {
        select: (cols: string) => {
          columns = cols.split(',').map((c) => c.trim());
          return query;
        },
        eq: (col: string, val: any) => {
          filters.push((r) => r[col] === val);
          return query;
        },
        is: (col: string, val: any) => {
          filters.push((r) => r[col] === val);
          return query;
        },
        gt: (col: string, val: any) => {
          filters.push((r) => r[col] > val);
          return query;
        },
        maybeSingle: async () => {
          const rows = matching();
          return rows.length === 1
            ? { data: project(rows[0]), error: null }
            : { data: null, error: rows.length ? { message: 'multiple rows' } : null };
        },
        single: async () => {
          const rows = matching();
          return rows.length === 1
            ? { data: project(rows[0]), error: null }
            : { data: null, error: { message: 'Results contain 0 rows' } };
        },
      };
      return query;
    },
  };
}

const RECORD: Row = {
  id: 'record-1',
  business_name: 'SunBay Roofing',
  transcript: [
    { role: 'visitor', text: 'My roof is leaking.' },
    { role: 'assistant', text: 'Sorry to hear that — let me help.' },
  ],
  summary: {
    summary: 'Visitor reported a roof leak and asked for a quote.',
    needs: ['Roof repair quote'],
    nextSteps: ['Send the quote by email'],
    outreachDraft: 'ADMIN-ONLY DRAFT — must never reach the recipient copy',
  },
  summary_status: 'ready',
  created_at: '2026-11-20T15:04:05.000Z',
};

async function dbWithLink(linkOverrides: Row = {}, records: Row[] = [RECORD]) {
  return mockDb({
    conversation_copy_links: [
      {
        record_id: 'record-1',
        token_hash: await sha256Hex(TOKEN),
        revoked_at: null,
        expires_at: '2026-11-28T12:00:00.000Z',
        ...linkOverrides,
      },
    ],
    conversation_records: records,
  });
}

describe('conversation-records copy action (executing)', () => {
  it('valid unexpired token → 200 with the full record payload shape', async () => {
    const res = await resolveConversationCopy(await dbWithLink(), TOKEN, NOW);
    expect(res).toEqual({
      status: 200,
      record: {
        business_name: 'SunBay Roofing',
        transcript: RECORD.transcript,
        summary: {
          summary: 'Visitor reported a roof leak and asked for a quote.',
          needs: ['Roof repair quote'],
          nextSteps: ['Send the quote by email'],
        },
        summary_status: 'ready',
        created_at: '2026-11-20T15:04:05.000Z',
      },
    });
    // The stored summary's admin-only outreachDraft must be stripped.
    if (res.status === 200) expect(res.record.summary).not.toHaveProperty('outreachDraft');
  });

  it('record without a summary → 200 with summary null', async () => {
    const bare = { ...RECORD, summary: null, summary_status: 'pending' };
    const res = await resolveConversationCopy(await dbWithLink({}, [bare]), TOKEN, NOW);
    expect(res.status).toBe(200);
    if (res.status === 200) {
      expect(res.record.summary).toBeNull();
      expect(res.record.summary_status).toBe('pending');
    }
  });

  it('unknown token → 404 with the expired/revoked message', async () => {
    const res = await resolveConversationCopy(await dbWithLink(), UNKNOWN_TOKEN, NOW);
    expect(res).toEqual({
      status: 404,
      error: 'This private link has expired or was revoked.',
    });
  });

  it('expired token → 404 with the same message', async () => {
    const db = await dbWithLink({ expires_at: '2026-11-20T12:00:00.000Z' });
    const res = await resolveConversationCopy(db, TOKEN, NOW);
    expect(res).toEqual({
      status: 404,
      error: 'This private link has expired or was revoked.',
    });
  });

  it('token expiring exactly now → 404 (expiry comparison is strict)', async () => {
    const db = await dbWithLink({ expires_at: NOW.toISOString() });
    const res = await resolveConversationCopy(db, TOKEN, NOW);
    expect(res.status).toBe(404);
  });

  it('revoked token → 404 with the same message', async () => {
    const db = await dbWithLink({ revoked_at: '2026-11-21T00:00:00.000Z' });
    const res = await resolveConversationCopy(db, TOKEN, NOW);
    expect(res).toEqual({
      status: 404,
      error: 'This private link has expired or was revoked.',
    });
  });

  it('valid link whose record is gone → 404 Conversation unavailable', async () => {
    const res = await resolveConversationCopy(await dbWithLink({}, []), TOKEN, NOW);
    expect(res).toEqual({ status: 404, error: 'Conversation unavailable' });
  });

  it('sha256Hex matches the published SHA-256 test vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await sha256Hex(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('token bounds mirror the request schema (breach → handler 400 Invalid request)', () => {
    expect(COPY_TOKEN_MIN_LENGTH).toBe(50);
    expect(COPY_TOKEN_MAX_LENGTH).toBe(100);
    expect(validCopyToken('x'.repeat(49))).toBe(false);
    expect(validCopyToken('x'.repeat(50))).toBe(true);
    expect(validCopyToken('x'.repeat(100))).toBe(true);
    expect(validCopyToken('x'.repeat(101))).toBe(false);
    expect(validCopyToken(TOKEN)).toBe(true);
    expect(validCopyToken(42)).toBe(false);
    expect(validCopyToken(null)).toBe(false);
    expect(validCopyToken(undefined)).toBe(false);
  });

  it('wiring pin: the handler delegates the copy branch to the shared resolver', () => {
    const src = readFileSync(
      new URL('../../supabase/functions/conversation-records/index.ts', import.meta.url),
      'utf8',
    );
    expect(src).toContain("from '../_shared/conversation-copy.ts'");
    expect(src).toContain('resolveConversationCopy(db');
    expect(src).toContain('.min(COPY_TOKEN_MIN_LENGTH).max(COPY_TOKEN_MAX_LENGTH)');
    // The branch must not grow its own inline link query again.
    expect(src).not.toContain("from('conversation_copy_links')");
  });
});
