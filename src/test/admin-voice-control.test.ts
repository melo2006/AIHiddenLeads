// Admin voice control (2026-11-14) — Ron directs the demo personas'
// voices from the admin Demo Voices tab instead of a code publish.
//
// Coverage:
//  - Part A: Frank's code default is Gacrux now (personas.ts
//    FRANK_VOICE + the wizard library's matched voice agree); Charon
//    was ruled too hoarse for Frank's face by Ron.
//  - The server resolver (persona-voice-overrides.ts): a stored
//    override WINS, and every failure shape — no row, read error,
//    invalid stored voice, a client that throws (e.g. the table is
//    not applied yet) — falls back to the code default. It never throws.
//  - The client row table (demoPersonaVoices.ts): the defaults it
//    displays are pinned against BOTH sources of truth (the server
//    registry for the six session personas, the avatar library's
//    matched voices for all eight), so the admin page can never show
//    a default the demos do not actually use.
//  - The IO helpers: fetch maps rows, save upserts on the persona key,
//    reset deletes the row.
//  - The migration is additive-only (one new table + policies).
//  - gemini-session source pins: the segment, presenter-parent,
//    Aspen-parent and Alex-guide stamps all resolve through the
//    override module; the old direct registry stamps are gone.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { PERSONAS, FRANK_VOICE, personaRegistryProblems } from '../../supabase/functions/_shared/personas';
import {
  fetchPersonaVoiceOverride,
  personaVoiceFromOverride,
  personaVoiceOverrideValue,
  resolvePersonaVoice,
} from '../../supabase/functions/_shared/persona-voice-overrides';
import { AVATAR_LIBRARY } from '@/lib/avatarLibrary';
import {
  DEMO_PERSONA_VOICE_ROWS,
  effectivePersonaVoice,
  fetchPersonaVoiceOverrides,
  resetPersonaVoiceOverride,
  savePersonaVoiceOverride,
} from '@/lib/demoPersonaVoices';

const fakeDb = (result: { data?: { voice_name?: unknown } | null; error?: unknown } | 'throw') => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (result === 'throw') throw new Error('relation "persona_voice_overrides" does not exist');
          return { data: result.data ?? null, error: result.error ?? null };
        },
      }),
    }),
  }),
});

describe('Part A — Frank’s code default', () => {
  test('FRANK_VOICE is Gacrux and the registry binding follows it', () => {
    expect(FRANK_VOICE).toBe('Gacrux');
    expect(PERSONAS.frank.voiceName).toBe('Gacrux');
    expect(personaRegistryProblems()).toEqual([]);
  });

  test('the wizard library applies the same voice for Frank’s tile', () => {
    expect(AVATAR_LIBRARY.find((e) => e.key === 'frank')?.matchedVoice).toBe('Gacrux');
  });

  test('no other persona’s code default moved', () => {
    expect(PERSONAS.aspen.voiceName).toBe('Kore');
    expect(PERSONAS.sara.voiceName).toBe('Leda');
    expect(PERSONAS.alex.voiceName).toBe('Puck');
    expect(PERSONAS.latina.voiceName).toBe('Sulafat');
    expect(PERSONAS['black-professional-lady'].voiceName).toBe('Despina');
  });
});

describe('server resolver — DB wins, code default is the fallback', () => {
  test('a stored override wins over the code default', async () => {
    await expect(resolvePersonaVoice(fakeDb({ data: { voice_name: 'Schedar' } }), 'frank'))
      .resolves.toEqual({ voice: 'Schedar', source: 'override' });
  });

  test('no row → the code default (Frank: Gacrux)', async () => {
    await expect(resolvePersonaVoice(fakeDb({ data: null }), 'frank'))
      .resolves.toEqual({ voice: 'Gacrux', source: 'default' });
    await expect(fetchPersonaVoiceOverride(fakeDb({ data: null }), 'frank')).resolves.toBeNull();
  });

  test('a read error → the code default, never a throw', async () => {
    await expect(resolvePersonaVoice(fakeDb({ error: new Error('boom') }), 'sara'))
      .resolves.toEqual({ voice: 'Leda', source: 'default' });
  });

  test('a missing table (client throws) → the code default, never a throw', async () => {
    await expect(resolvePersonaVoice(fakeDb('throw'), 'aspen'))
      .resolves.toEqual({ voice: 'Kore', source: 'default' });
    await expect(fetchPersonaVoiceOverride(fakeDb('throw'), 'aspen')).resolves.toBeNull();
  });

  test('an invalid stored voice is treated as no override', async () => {
    await expect(resolvePersonaVoice(fakeDb({ data: { voice_name: 'NotAVoice' } }), 'frank'))
      .resolves.toEqual({ voice: 'Gacrux', source: 'default' });
    expect(personaVoiceOverrideValue('NotAVoice')).toBeNull();
    expect(personaVoiceOverrideValue(42)).toBeNull();
    expect(personaVoiceOverrideValue('Gacrux')).toBe('Gacrux');
  });

  test('the pure core resolves both ways', () => {
    expect(personaVoiceFromOverride('latina', 'Aoede')).toEqual({ voice: 'Aoede', source: 'override' });
    expect(personaVoiceFromOverride('latina', null)).toEqual({ voice: 'Sulafat', source: 'default' });
    expect(personaVoiceFromOverride('alex', undefined)).toEqual({ voice: 'Puck', source: 'default' });
  });
});

describe('client row table — displayed defaults are the real defaults', () => {
  test('exactly the eight demo personas, in the directed order', () => {
    expect(DEMO_PERSONA_VOICE_ROWS.map((r) => r.persona)).toEqual([
      'aspen', 'sara', 'alex', 'frank', 'latina', 'black-professional-lady', 'executive', 'middle-aged-pro',
    ]);
  });

  test('registry personas: displayed default === personas.ts voice', () => {
    for (const row of DEMO_PERSONA_VOICE_ROWS.filter((r) => r.sessionResolved)) {
      expect(row.defaultVoice, row.persona).toBe(PERSONAS[row.persona as keyof typeof PERSONAS].voiceName);
    }
  });

  test('all eight: displayed default === the avatar library matched voice', () => {
    for (const row of DEMO_PERSONA_VOICE_ROWS) {
      expect(AVATAR_LIBRARY.find((e) => e.key === row.libraryKey)?.matchedVoice, row.persona).toBe(row.defaultVoice);
    }
  });

  test('effectivePersonaVoice marks the source honestly', () => {
    const frank = DEMO_PERSONA_VOICE_ROWS.find((r) => r.persona === 'frank')!;
    expect(effectivePersonaVoice(frank, {})).toEqual({ voice: 'Gacrux', source: 'default' });
    expect(effectivePersonaVoice(frank, { frank: 'Schedar' })).toEqual({ voice: 'Schedar', source: 'override' });
  });
});

describe('client IO helpers', () => {
  const store = (rows: { persona: string; voice_name: string }[]) => {
    const calls: { upsert?: unknown; deleted?: string } = {};
    return {
      calls,
      client: {
        from: () => ({
          select: async () => ({ data: rows, error: null }),
          upsert: async (row: Record<string, unknown>) => { calls.upsert = row; return { error: null }; },
          delete: () => ({ eq: async (_c: string, v: string) => { calls.deleted = v; return { error: null }; } }),
        }),
      },
    };
  };

  test('fetch maps rows to a persona → voice record', async () => {
    const { client } = store([{ persona: 'frank', voice_name: 'Schedar' }]);
    await expect(fetchPersonaVoiceOverrides(client)).resolves.toEqual({ frank: 'Schedar' });
  });

  test('save upserts the picked voice on the persona key', async () => {
    const { client, calls } = store([]);
    await savePersonaVoiceOverride(client, 'frank', 'Schedar', 'user-1');
    expect(calls.upsert).toMatchObject({ persona: 'frank', voice_name: 'Schedar', updated_by: 'user-1' });
  });

  test('reset deletes the persona’s row', async () => {
    const { client, calls } = store([]);
    await resetPersonaVoiceOverride(client, 'frank');
    expect(calls.deleted).toBe('frank');
  });
});

describe('the migration', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/migrations/20261114150000_persona_voice_overrides.sql'),
    'utf8',
  );

  test('creates exactly one new table, with RLS gated on the platform role table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.persona_voice_overrides');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('voice_platform_roles');
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(1);
  });

  test('is additive-only: nothing existing is dropped, altered or deleted', () => {
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/ALTER TABLE public\.(?!persona_voice_overrides)/);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/UPDATE public\./i);
  });

  test('the persona key admits exactly the eight admin rows', () => {
    for (const key of ['aspen', 'sara', 'alex', 'frank', 'latina', 'black-professional-lady', 'executive', 'middle-aged-pro']) {
      expect(sql).toContain(`'${key}'`);
    }
  });
});

describe('gemini-session wiring (source pins)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/functions/gemini-session/index.ts'),
    'utf8',
  );

  test('stamps segment and presenter voices through the resolver', () => {
    expect(src).toContain("from '../_shared/persona-voice-overrides.ts'");
    expect(src).toContain('resolvePersonaVoice(db, persona.id)');
    expect(src).toContain('resolvePersonaVoice(db, presenter.id)');
    expect(src).not.toContain('voice:persona.voiceName');
    expect(src).not.toContain('voice:presenter.voiceName');
  });

  test('applies overrides to the Aspen demo parent and the Alex guide, override-only', () => {
    expect(src).toContain("fetchPersonaVoiceOverride(db,'aspen')");
    expect(src).toContain("fetchPersonaVoiceOverride(db,'alex')");
  });
});
