// Persona voice overrides (admin voice control, 2026-11-14).
//
// Ron directs the DEMO personas' voices from the admin Demo Voices tab
// (Voice Agents → Demo Voices) instead of waiting on a code publish.
// The admin writes one row per persona into persona_voice_overrides
// (migration 20261114150000_persona_voice_overrides.sql); gemini-session
// reads the row when it stamps a demo session's voice:
//
//   override row present + voice is a real Gemini Live voice → DB WINS
//   no row / unreadable row / invalid voice / table missing   → the
//     code default in personas.ts (PERSONAS[id].voiceName), exactly
//     the pre-override resolution.
//
// FAIL-SAFE IS THE CONTRACT: this module never throws and never lets a
// database problem break or delay a session — every failure path lands
// on the code default. The extra read is one indexed PK lookup per
// session authorization, on the same service-role client gemini-session
// already holds (RLS does not apply to it; the table's policies gate
// the ADMIN's browser client only).
import { PERSONAS, type PersonaId } from './personas.ts';
import { VOICES } from './voice-config.ts';

export const PERSONA_VOICE_OVERRIDES_TABLE = 'persona_voice_overrides';

export interface PersonaVoiceResolution {
  voice: string;
  source: 'override' | 'default';
}

/** The structural slice of the Supabase client this module needs —
 *  kept minimal so tests can fake it without the whole client. */
export interface PersonaVoiceOverrideClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { voice_name?: unknown } | null; error: unknown }>;
      };
    };
  };
}

/** Validate a raw stored value: only a real Gemini Live voice name may
 *  ever win. Anything else (legacy junk, a hand-edited row, a voice
 *  Google retired) is treated as NO override, never stamped. */
export function personaVoiceOverrideValue(raw: unknown): string | null {
  return typeof raw === 'string' && (VOICES as readonly string[]).includes(raw) ? raw : null;
}

/** Pure resolution core (unit-tested directly): a valid override wins;
 *  absence/invalidity falls back to the persona's code default. */
export function personaVoiceFromOverride(personaId: PersonaId, overrideVoice: unknown): PersonaVoiceResolution {
  const voice = personaVoiceOverrideValue(overrideVoice);
  return voice
    ? { voice, source: 'override' }
    : { voice: PERSONAS[personaId].voiceName, source: 'default' };
}

/** Read one persona's override voice (null when none/invalid/error).
 *  Never throws. Accepts the caller's full Supabase client as unknown
 *  and narrows it here, so call sites stay clean. */
export async function fetchPersonaVoiceOverride(
  db: unknown,
  personaId: PersonaId,
): Promise<string | null> {
  try {
    const client = db as PersonaVoiceOverrideClient;
    const { data, error } = await client
      .from(PERSONA_VOICE_OVERRIDES_TABLE)
      .select('voice_name')
      .eq('persona', personaId)
      .maybeSingle();
    if (error) return null;
    return personaVoiceOverrideValue(data?.voice_name);
  } catch {
    return null;
  }
}

/** The full resolution gemini-session stamps with: DB wins, code
 *  default (personas.ts) is the fallback. Never throws. */
export async function resolvePersonaVoice(
  db: unknown,
  personaId: PersonaId,
): Promise<PersonaVoiceResolution> {
  const override = await fetchPersonaVoiceOverride(db, personaId);
  return personaVoiceFromOverride(personaId, override);
}
