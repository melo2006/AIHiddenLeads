// Persona registry — avatar swap, Stage 1 (spec:
// ~/workspace/avatar-swap-mechanism-spec-2026-11-09.md §5.1).
//
// ONE server-side registry binds each demo persona to its face, voice and
// prompt segment. Both edge functions read their half from here:
//   - gemini-session: voice + prompt segment + display name for a segment
//     authorization (the personaSegment branch);
//   - simli-avatar: the face for a persona session token (server-fixed,
//     following the guide:'alex' precedent — a client may name a persona,
//     never a raw faceId).
//
// Face sources (spec §5.1 + Stage-0 spike findings):
//   - aspen: resolved from the published agent snapshot's videoAvatar at
//     request time — NEVER from a constant here. The snapshot currently
//     points at the custom Aspen face; the ASPEN_SIMLI_FACE pair constant
//     is only the snapshot-missing fallback (video-avatar.ts).
//   - sara: the Simli library preset "Sara" (catalogue
//     src/lib/simliFaceCatalog.ts) — a fixed constant, mirroring
//     ALEX_FACE_ID. Trinity-2, floats (Stage-0 spike 1).
//   - alex: ALEX_FACE_ID from alex-guide.ts — imported, never duplicated.
//
// Segment prompts live with their owners: the simulation segments in
// voice-config.ts (split at the script's natural seams; SIMULATION_PROMPT
// stays assembled byte-identical), the Alex guest segment in alex-guide.ts.
import { ALEX_FACE_ID, ALEX_VOICE } from './alex-guide.ts';
import {
  ALEX_CAMEO_PROMPT,
  INTRO_BOUNDARIES,
  SARA_CAMEO_PROMPT,
  TEAM_INTRO_CALLBACK_CLOSE,
  TEAM_INTRO_CALLBACK_DOORWAY,
  TEAM_INTRO_HOST_SEGMENT,
  type IntroBoundary,
} from './team-intro.ts';
import {
  SIMULATION_CLOSE_SEGMENT,
  SIMULATION_HOST_SEGMENT,
  SIMULATION_RECEPTIONIST_SEGMENT,
  VOICES,
} from './voice-config.ts';

export type PersonaId = 'aspen' | 'sara' | 'alex';
/** All segment boundaries: the Stage 1 simulation family plus the team
 *  intro family (design: team-intro-design-2026-11-09.md §4.1). The two
 *  families are disjoint and phase-gated against their own parent class
 *  (gemini-session refuses cross-family requests). */
export type PersonaBoundary =
  | 'doorway' | 'stepout' | 'meet-alex' | 'return'
  | IntroBoundary;
export type { IntroBoundary };

export interface PersonaBinding {
  id: PersonaId;
  /** Spoken/display name: config.name, the {agentName} substitution, and
   *  the client's shell identity (name + catalogue portrait key). */
  displayName: string;
  /** Gemini prebuilt voice — must be a member of VOICES (voice-config.ts). */
  voiceName: string;
  /** Simli face for personas whose face is a server-side constant. Aspen
   *  has NO constant: her face resolves from the published snapshot in
   *  simli-avatar / gemini-session, so this field is null for her. */
  faceId: string | null;
  /** Client catalogue face id whose portrait the shell shows for this
   *  persona (src/lib/simliFaceCatalog.ts). Aspen's entry is her custom
   *  snapshot face, which the catalogue lists first. */
  portraitFaceId: string;
  role: 'host' | 'receptionist' | 'guide';
}

/** Sara's voice. ONE named constant: locked to Leda — Ron's pick from his
 *  live audition (2026-11-09); a future change is a one-line edit here
 *  and nowhere else. */
export const SARA_VOICE = 'Leda';
/** The Simli library preset "Sara" — the demo receptionist's face. */
export const SARA_FACE_ID = 'f735e62c-dce7-4c0b-8e85-1c7e21774c45';
/** Aspen's catalogue portrait key (her custom snapshot face). */
export const ASPEN_PORTRAIT_FACE_ID = 'ed8fedd9-6c86-4dc5-bb3a-017c06146efc';

export const PERSONAS: Record<PersonaId, PersonaBinding> = {
  aspen: {
    id: 'aspen',
    displayName: 'Aspen',
    voiceName: 'Kore',
    faceId: null, // snapshot-resolved — never hardcode (Stage-0 spike 1)
    portraitFaceId: ASPEN_PORTRAIT_FACE_ID,
    role: 'host',
  },
  sara: {
    id: 'sara',
    displayName: 'Sara',
    voiceName: SARA_VOICE,
    faceId: SARA_FACE_ID,
    portraitFaceId: SARA_FACE_ID,
    role: 'receptionist',
  },
  alex: {
    id: 'alex',
    displayName: 'Alex',
    voiceName: ALEX_VOICE,
    faceId: ALEX_FACE_ID,
    portraitFaceId: ALEX_FACE_ID,
    role: 'guide',
  },
};

export function personaFor(id: PersonaId): PersonaBinding {
  return PERSONAS[id];
}

export function isPersonaId(value: unknown): value is PersonaId {
  return value === 'aspen' || value === 'sara' || value === 'alex';
}

/** Integrity guard used by tests: every bound voice must be a real Gemini
 *  prebuilt voice, and every constant face a valid Simli face id shape. */
export function personaRegistryProblems(): string[] {
  const problems: string[] = [];
  for (const p of Object.values(PERSONAS)) {
    if (!VOICES.includes(p.voiceName)) problems.push(`${p.id}: voice "${p.voiceName}" is not in VOICES`);
    if (p.faceId !== null && !/^[0-9a-f-]{36}$/i.test(p.faceId)) problems.push(`${p.id}: faceId is not a UUID`);
    if (!p.displayName) problems.push(`${p.id}: missing displayName`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Whole-demo persona feature flag (Stage 1 lands DARK).
// Server-side env, following the repo's existing flag pattern
// (DEMO_VERIFICATION_SMS_ENABLED in demo-verification): the swap flow is
// enabled only when AVATAR_SWAP_ENABLED is exactly 'true'. gemini-session
// is the single decision point: it stamps config.personaSwapEnabled on the
// parent demo authorization and echoes personaSwapEnabled in its response;
// the client runs the swap state machine only when it sees the flag, and
// segment authorizations are refused while it is off. With the flag off,
// behaviour is byte-identical to the pre-swap build.
// ---------------------------------------------------------------------------
export function avatarSwapEnabled(env: (name: string) => string | undefined): boolean {
  return env('AVATAR_SWAP_ENABLED') === 'true';
}

// ---------------------------------------------------------------------------
// Team intro sub-flag (design: team-intro-design-2026-11-09.md §7). The
// team intro rides the swap family but is enabled SEPARATELY:
// TEAM_INTRO_ENABLED is its own server env, same pattern, and it can
// never outlive the master flag — master off ⇒ team intro dark
// regardless of its own value. gemini-session is the single decision
// point for both stamps.
// ---------------------------------------------------------------------------
export function teamIntroEnabled(env: (name: string) => string | undefined): boolean {
  return avatarSwapEnabled(env) && env('TEAM_INTRO_ENABLED') === 'true';
}

// ---------------------------------------------------------------------------
// Segment prompt assembly (spec §5.1). A segment session's system prompt
// carries ONLY that persona's segment + the shared framing below; the
// business knowledge rides separately as reference data, exactly as in the
// legacy whole-demo config (businessDemoConfig). {agentName} inside the
// receptionist segment resolves to the BOUND persona (Sara), so her
// in-role greeting introduces her by her own name.
// ---------------------------------------------------------------------------
const BUSINESS_ASSISTANT_PREAMBLE = (businessName: string) =>
  `You are the virtual customer-service assistant for ${businessName}. Use only facts supported by the supplied website and documents. Prefer original page evidence over generated summaries; questions are not evidence of answers. Never invent rates, policies or financial advice. If an answer is missing, say so. Keep replies natural and concise.`;

/** Substitute the bound persona's name for the segment's {agentName}. */
export function bindSegmentNames(segment: string, persona: PersonaBinding): string {
  return segment.split('{agentName}').join(persona.displayName);
}

export interface PersonaSegmentBuild {
  /** Full systemPrompt for the segment session config. */
  systemPrompt: string;
  /** Spoken greeting TEMPLATE for the segment (template vars intact —
   *  the proxy templates it the legacy way); '' when the segment needs
   *  no greeting (host/close segments open via the swap opening only). */
  greeting: string;
}

/** Team-intro segment build options (the intro family's parent is the
 *  homepage explainer, not a business demo). */
export interface TeamIntroSegmentOptions {
  /** The parent homepage session's full systemPrompt — the Aspen host
   *  segment rides it (the sales prompt + the cameo teaching block), so
   *  beats 3–5 keep the whole sales context. The cameo segments do NOT
   *  inherit it (their bounded prompt packs stand alone). */
  parentPrompt: string;
}

/**
 * Build the segment prompt + greeting for one persona inside one business
 * demo. `parentPrompt` is the PARENT session's full systemPrompt: the
 * host→Sara doorway keeps the parent's own prompt head (the business
 * preamble + any verification/invite host-phase block gemini-session
 * prepended) ahead of the host segment, so gate/invite behaviour survives
 * the split untouched; the receptionist and close segments stand alone.
 * The Alex build needs alex-guide's guest config; it is passed in as
 * `alexGuest` by the caller (gemini-session imports both modules) to keep
 * this module free of an import cycle with alex-guide.ts.
 */
export function personaSegmentPrompt(
  persona: PersonaId,
  boundary: PersonaBoundary,
  businessName: string,
  parentPrompt: string,
  alexGuest?: { systemPrompt: string; greeting: string },
  teamIntroSeen?: boolean,
  teamIntro?: TeamIntroSegmentOptions,
): PersonaSegmentBuild {
  const binding = PERSONAS[persona];
  // TEAM INTRO FAMILY (design §4.3 P3–P5): segments of a homepage parent.
  // The cameo prompts stand alone (bounded material, no tenant business,
  // no parent sales prompt); the Aspen host segment rides the parent's
  // own prompt so beats 3–5 keep the sales context. No greeting: the
  // proxy's swap opening serves the first beat.
  if ((INTRO_BOUNDARIES as readonly string[]).includes(boundary)) {
    if (boundary === 'intro-sara' && persona === 'sara') {
      return { systemPrompt: SARA_CAMEO_PROMPT, greeting: '' };
    }
    if (boundary === 'intro-return-1' && persona === 'aspen') {
      if (!teamIntro) throw new Error('personaSegmentPrompt: teamIntro options are required for intro segments');
      return { systemPrompt: `${teamIntro.parentPrompt}\n${TEAM_INTRO_HOST_SEGMENT}`, greeting: '' };
    }
    if (boundary === 'intro-alex' && persona === 'alex') {
      return { systemPrompt: ALEX_CAMEO_PROMPT, greeting: '' };
    }
    if (boundary === 'intro-return-2' && persona === 'aspen') {
      // No new authorization: the return to Aspen after Alex is a SEGMENT
      // REQUEST from the client like every other boundary (Stage 1's
      // chained-authorization pattern — every hop re-authorized against
      // the ORIGINAL parent), landing on the same host-segment build the
      // first return used. Beats after the landing are governed by the
      // host segment's "show is over" rule either way.
      if (!teamIntro) throw new Error('personaSegmentPrompt: teamIntro options are required for intro segments');
      return { systemPrompt: `${teamIntro.parentPrompt}\n${TEAM_INTRO_HOST_SEGMENT}`, greeting: '' };
    }
    throw new Error(`personaSegmentPrompt: persona ${persona} cannot enter boundary ${boundary}`);
  }
  if (persona === 'sara') {
    return {
      systemPrompt: `${BUSINESS_ASSISTANT_PREAMBLE(businessName)}\n${bindSegmentNames(SIMULATION_RECEPTIONIST_SEGMENT, binding)}`,
      // The in-role greeting is beat 4 of the segment itself; the swap
      // opening instructs her to run beats 4–6, so no separate greeting
      // line is delivered — this field carries the bound beat-4 template
      // for reference/logging only.
      greeting: `"Good morning, {businessName}, I'm ${binding.displayName} — thanks for calling."`,
    };
  }
  if (persona === 'alex') {
    if (!alexGuest) throw new Error('personaSegmentPrompt: alexGuest is required for the alex segment');
    return { systemPrompt: alexGuest.systemPrompt, greeting: alexGuest.greeting };
  }
  // Aspen: the closing segment after Sara (stepout), the return after Alex
  // (return), or — at the doorway in reverse — the host segment that opens
  // the demo. Host sessions normally come from the legacy authorization;
  // the host build exists so a segment chain can also START at Aspen.
  if (boundary === 'doorway') {
    return {
      // §5.1 callback (teamIntroSeen only): the doorway gains the "here's
      // Sara again — as promised" clause as an APPENDED instruction. The
      // shared segment constants are never edited, so without the signal
      // this build is byte-identical to the pre-callback assembly.
      systemPrompt: `${parentPrompt}\n${bindSegmentNames(SIMULATION_HOST_SEGMENT, binding)}${teamIntroSeen ? `\n${TEAM_INTRO_CALLBACK_DOORWAY}` : ''}`,
      greeting: '',
    };
  }
  return {
    systemPrompt: `${BUSINESS_ASSISTANT_PREAMBLE(businessName)}\n${bindSegmentNames(SIMULATION_CLOSE_SEGMENT, binding)}${teamIntroSeen ? `\n${TEAM_INTRO_CALLBACK_CLOSE}` : ''}`,
    greeting: '',
  };
}
