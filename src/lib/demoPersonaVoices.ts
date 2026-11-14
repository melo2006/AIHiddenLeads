/**
 * Demo persona voices — the client half of the admin voice control
 * (2026-11-14). The Demo Voices tab (Voice Agents → Demo Voices) lets
 * a platform admin set each DEMO persona's voice without a publish:
 * saves land in `persona_voice_overrides` and gemini-session stamps
 * the override on the next demo session (DB wins; see
 * supabase/functions/_shared/persona-voice-overrides.ts).
 *
 * `defaultVoice` below is the CODE default each persona falls back to
 * with no override row. For the six registry personas it mirrors
 * supabase/functions/_shared/personas.ts (Aspen=Kore, Sara=Leda,
 * Alex=Puck, Frank=Gacrux, Monica=Sulafat, Black Professional
 * Lady=Despina); Executive and Middle-Aged Pro have no server persona
 * (they are library faces — they front no demo session today), so
 * their default is the avatar library's matched voice and an override
 * saved for them is stored/displayed, ready for any future resolver.
 * A test pins this table against both sources so they cannot drift.
 *
 * The customer setup wizard's library defaults are NOT read from here
 * and are never mutated by the admin tab.
 */
import { supabase } from "@/integrations/supabase/client";

export const PERSONA_VOICE_OVERRIDES_TABLE = "persona_voice_overrides";

export interface DemoPersonaVoiceRow {
  /** Override-table key (the persona id; Monica's stays "latina"). */
  persona: string;
  /** Avatar-library key, for the row's portrait. */
  libraryKey: string;
  /** Display name shown on the row. */
  label: string;
  /** Code default voice (the fallback with no override row). */
  defaultVoice: string;
  /** True when gemini-session resolves this persona's voice live
   *  (registry personas); false for the library-only faces. */
  sessionResolved: boolean;
}

export const DEMO_PERSONA_VOICE_ROWS: DemoPersonaVoiceRow[] = [
  { persona: "aspen", libraryKey: "aspen", label: "Aspen", defaultVoice: "Kore", sessionResolved: true },
  { persona: "sara", libraryKey: "sara", label: "Sara", defaultVoice: "Leda", sessionResolved: true },
  { persona: "alex", libraryKey: "alex", label: "Alex", defaultVoice: "Puck", sessionResolved: true },
  { persona: "frank", libraryKey: "frank", label: "Frank", defaultVoice: "Gacrux", sessionResolved: true },
  { persona: "latina", libraryKey: "latina", label: "Monica", defaultVoice: "Sulafat", sessionResolved: true },
  { persona: "black-professional-lady", libraryKey: "black-professional-lady", label: "Black Professional Lady", defaultVoice: "Despina", sessionResolved: true },
  { persona: "executive", libraryKey: "executive", label: "Executive", defaultVoice: "Sadaltager", sessionResolved: false },
  { persona: "middle-aged-pro", libraryKey: "middle-aged-pro", label: "Middle-Aged Pro", defaultVoice: "Rasalgethi", sessionResolved: false },
];

export type PersonaVoiceOverrides = Record<string, string>;

export interface EffectivePersonaVoice {
  voice: string;
  source: "override" | "default";
}

/** The voice a persona actually demos with: the admin override when a
 *  row exists, else the code default. Mirrors the server resolver. */
export function effectivePersonaVoice(
  row: DemoPersonaVoiceRow,
  overrides: PersonaVoiceOverrides,
): EffectivePersonaVoice {
  const override = overrides[row.persona];
  return override
    ? { voice: override, source: "override" }
    : { voice: row.defaultVoice, source: "default" };
}

/** The structural slice of the Supabase client the IO helpers need —
 *  the overrides table is not in the generated Database types yet, so
 *  the helpers narrow the real client here instead of casting at
 *  every call site. Tests pass a fake with the same shape. */
export interface PersonaVoiceOverrideStore {
  from(table: string): {
    select(columns: string): PromiseLike<{ data: { persona: string; voice_name: string }[] | null; error: unknown }>;
    upsert(row: Record<string, unknown>, options: { onConflict: string }): PromiseLike<{ error: unknown }>;
    delete(): { eq(column: string, value: string): PromiseLike<{ error: unknown }> };
  };
}

const store = (client: unknown): PersonaVoiceOverrideStore => client as PersonaVoiceOverrideStore;

/** Load every override row as a persona → voice map. Throws on a real
 *  read error so the tab can say so instead of silently showing
 *  defaults that are not in force. */
export async function fetchPersonaVoiceOverrides(client: unknown = supabase): Promise<PersonaVoiceOverrides> {
  const { data, error } = await store(client)
    .from(PERSONA_VOICE_OVERRIDES_TABLE)
    .select("persona, voice_name");
  if (error) throw new Error("Could not load the saved voice overrides.");
  const map: PersonaVoiceOverrides = {};
  for (const row of data ?? []) {
    if (typeof row?.persona === "string" && typeof row?.voice_name === "string") {
      map[row.persona] = row.voice_name;
    }
  }
  return map;
}

/** Save (insert or replace) one persona's override voice. */
export async function savePersonaVoiceOverride(
  client: unknown,
  persona: string,
  voice: string,
  updatedBy: string | null,
): Promise<void> {
  const { error } = await store(client)
    .from(PERSONA_VOICE_OVERRIDES_TABLE)
    .upsert(
      { persona, voice_name: voice, updated_at: new Date().toISOString(), updated_by: updatedBy },
      { onConflict: "persona" },
    );
  if (error) throw new Error("Could not save the voice override.");
}

/** Reset one persona to its code default (deletes the override row). */
export async function resetPersonaVoiceOverride(client: unknown, persona: string): Promise<void> {
  const { error } = await store(client)
    .from(PERSONA_VOICE_OVERRIDES_TABLE)
    .delete()
    .eq("persona", persona);
  if (error) throw new Error("Could not reset the voice override.");
}
