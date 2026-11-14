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
import { ALEX_FACE_ID, ALEX_VOICE, alexPresenterGuestPrompt } from './alex-guide.ts';
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
  SIMULATION_PROMPT,
  SIMULATION_RECEPTIONIST_SEGMENT,
  VOICES,
} from './voice-config.ts';

export type PersonaId = 'aspen' | 'sara' | 'alex' | 'frank' | 'latina' | 'black-professional-lady';
/** All segment boundaries: the Stage 1 simulation family plus the team
 *  intro family (design: team-intro-design-2026-11-09.md §4.1). The two
 *  families are disjoint and phase-gated against their own parent class
 *  (gemini-session refuses cross-family requests). */
export type PersonaBoundary =
  | 'doorway' | 'stepout' | 'meet-alex' | 'return' | 'summon-aspen'
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

/** Frank's voice. ONE named constant: Gacrux — Google's "Mature"
 *  voice in the Gemini Live set. Ron's ruling (2026-11-14): the
 *  previous pick, Charon, read too hoarse and wrong for Frank's face
 *  (an older white gentleman), especially in the low register, so the
 *  default moved. This constant is only the FALLBACK: a row in
 *  persona_voice_overrides (set from the admin Demo Voices tab) wins
 *  over it at session time — see _shared/persona-voice-overrides.ts.
 *  (Sara=Leda, Alex=Puck, Aspen=Kore.) */
export const FRANK_VOICE = 'Gacrux';
/** The custom Trinity-2 "Senior Owner" face, created 2026-11-13
 *  (Simli auto-name "Convincing Cougar" — never shown to customers;
 *  the customer-facing name is the binding's displayName below). */
export const FRANK_FACE_ID = 'b3f85f7f-57ea-4f24-b1f6-a57229b4fae1';

/** Monica's voice. ONE named constant: Sulafat — the warm female in
 *  the Gemini Live set (Google's own descriptor for it is "Warm");
 *  the warmest read available for Monica's face, against Sara=Leda
 *  and Aspen=Kore. ⚠️ MUSE'S PICK (2026-11-13), not Ron-settled —
 *  the Gemini Live library carries no accent-specific voice for her,
 *  so warmth is what was optimized for; a future change is a one-line
 *  edit here and nowhere else. */
export const LATINA_VOICE = 'Sulafat';
/** Monica's custom Trinity-2 face, created 2026-11-13 under the
 *  creation label "Latina Green Eyes" (Simli auto-name "Radical
 *  Spider" — neither is shown to customers; the customer-facing
 *  name is the binding's displayName below). */
export const LATINA_FACE_ID = 'e0d7b128-40a7-4d03-ac84-ef4c54b92450';

/** Black Professional Lady's voice. ONE named constant: Despina —
 *  the smooth, polished professional female in the Gemini Live set
 *  (Google's descriptor: "Smooth"), distinct from Kore/Leda/Sulafat.
 *  ⚠️ MUSE'S PICK (2026-11-13), not Ron-settled; a future change is
 *  a one-line edit here and nowhere else. */
export const BLACK_PROFESSIONAL_LADY_VOICE = 'Despina';
/** The custom Trinity-2 "Black Professional Lady" face, created
 *  2026-11-13 (Simli auto-name "Unpleasant Lemur" — never shown to
 *  customers; the customer-facing name is the binding's displayName
 *  below). */
export const BLACK_PROFESSIONAL_LADY_FACE_ID = '9344d4c1-6b69-43e7-a73f-ddc15d1a3f75';

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
  frank: {
    // EXAMPLE PRESENTER (Frank batch, 2026-11-13): unlike the swap
    // personas, Frank never enters through a persona segment — he
    // FRONTS a whole example demo in one session (presenter greeting
    // + in-role simulation), composed by gemini-session from the
    // legacy whole-demo prompt bound to this binding. His displayName
    // here is the ONE config place for his customer-facing name
    // ("Frank" — approved by Ron 2026-11-13; the client reads the
    // same shared registry for the badge).
    id: 'frank',
    displayName: 'Frank',
    voiceName: FRANK_VOICE,
    faceId: FRANK_FACE_ID,
    portraitFaceId: FRANK_FACE_ID,
    role: 'receptionist',
  },
  latina: {
    // EXAMPLE PRESENTER (Ladies batch, 2026-11-13): same whole-demo
    // presenter shape as Frank — she FRONTS her mapped examples in
    // one session, composed by gemini-session from the legacy
    // whole-demo prompt bound to this binding. Her displayName here
    // is her SETTLED name — "Monica", settled by Ron 2026-11-14
    // (she shipped under the working label "Latina"); the name
    // lives in exactly this one config place, same as her voice
    // pick above. (Her persona id stays 'latina' — it is a stored
    // wire key, not a shown name.)
    id: 'latina',
    displayName: 'Monica',
    voiceName: LATINA_VOICE,
    faceId: LATINA_FACE_ID,
    portraitFaceId: LATINA_FACE_ID,
    role: 'receptionist',
  },
  'black-professional-lady': {
    // EXAMPLE PRESENTER (Ladies batch, 2026-11-13): same whole-demo
    // presenter shape as Frank and Monica. ⚠️ Her displayName here
    // is the DESCRIPTIVE WORKING LABEL ("Black Professional Lady"),
    // not a Ron-settled name — one config place, one-line change
    // when he settles it, same as her voice pick above.
    id: 'black-professional-lady',
    displayName: 'Black Professional Lady',
    voiceName: BLACK_PROFESSIONAL_LADY_VOICE,
    faceId: BLACK_PROFESSIONAL_LADY_FACE_ID,
    portraitFaceId: BLACK_PROFESSIONAL_LADY_FACE_ID,
    role: 'receptionist',
  },
};

export function personaFor(id: PersonaId): PersonaBinding {
  return PERSONAS[id];
}

export function isPersonaId(value: unknown): value is PersonaId {
  return value === 'aspen' || value === 'sara' || value === 'alex' || value === 'frank' || value === 'latina' || value === 'black-professional-lady';
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

/** Example-listings segment options (Scalone batch, 2026-11-12 —
 *  forensics F4): the example-listings layer the parent authorization
 *  stamps onto the ASPEN parent's prompt never reached Sara — her
 *  segment prompt is built fresh here and the parent prompt is not
 *  part of it, so the listings demos were broken on the Sara leg
 *  since the persona swap shipped. gemini-session rebuilds the layer
 *  from the parent's stamped exampleListings marker and passes it in
 *  for the SARA build ONLY; Aspen's builds never receive it (she
 *  introduces the demo — she does not roleplay the business). Absent
 *  for every non-sample session, whose segment builds stay
 *  byte-identical. */
export interface ExampleListingsSegmentOptions {
  /** buildExampleListingsLayer(pack) output for the parent's pack. */
  layer: string;
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
  exampleListings?: ExampleListingsSegmentOptions,
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
      // Example sessions only: the listings layer rides AFTER the
      // receptionist segment — the same position stampExampleListings
      // appends it at on the legacy whole-demo composition — so Sara
      // carries the agent's listings (own listings first) and the
      // approved simulation script into the roleplay. Non-sample
      // builds pass no layer and stay byte-identical.
      systemPrompt: `${BUSINESS_ASSISTANT_PREAMBLE(businessName)}\n${bindSegmentNames(SIMULATION_RECEPTIONIST_SEGMENT, binding)}${exampleListings?.layer ? `\n${exampleListings.layer}` : ''}`,
      // DETERMINISTIC FIRST LINE (2026-11-13 — Ron's Andriot retest:
      // Sara's segment entry greeting was model-improvised from beat 4
      // and intermittently SKIPPED — one run opened with the host's 78%
      // pitch statistic instead). This template is no longer reference
      // material: gemini-session renders it server-side (time greeting
      // from the segment's effective timezone, via renderOpeningTemplate
      // — the demo-parent hygiene pattern) into config.segmentGreeting,
      // and the proxy's doorway swap opening serves that rendered line
      // as her scripted first utterance, verbatim, before anything else.
      greeting: `{timeGreeting}, {businessName} — I'm ${binding.displayName}, thanks for calling. How can I help you?`,
    };
  }
  if (persona === 'alex') {
    if (!alexGuest) throw new Error('personaSegmentPrompt: alexGuest is required for the alex segment');
    return { systemPrompt: alexGuest.systemPrompt, greeting: alexGuest.greeting };
  }
  // PRESENTER RETURN (Alex handoff fix, 2026-11-14): a presenter demo's
  // Alex cameo hands the conversation back to the PRESENTER, not to
  // stock Aspen — the client asks for the presenter persona on the
  // 'return' boundary (and on 'stepout' for drop/stash re-entry into
  // the close). The build is the close segment bound to the presenter
  // with the same two close rewrites her parent prompt carries, so
  // she steps out and answers follow-ups as herself. Before this
  // branch existed, a presenter parent never armed the swap at all:
  // the close's MEET ALEX beat was spoken and nothing executed.
  if (isPresenterPersona(persona)) {
    return {
      systemPrompt: `${BUSINESS_ASSISTANT_PREAMBLE(businessName)}\n${rewritePresenterCloseSegment(bindSegmentNames(SIMULATION_CLOSE_SEGMENT, binding), binding)}${teamIntroSeen ? `\n${TEAM_INTRO_CALLBACK_CLOSE}` : ''}`,
      greeting: '',
    };
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

// ---------------------------------------------------------------------------
// WHOLE-DEMO PRESENTER PROMPT (Frank batch, 2026-11-13): a presenter
// persona (Frank) fronts an example demo SOLO — he is the host who
// greets AND the receptionist who runs the simulation, in ONE session
// on the legacy whole-demo composition (SIMULATION_PROMPT). The shared
// prompt text carries two-persona assumptions that would put wrong
// words in his mouth, so the presenter build rewrites exactly those
// beats and NOTHING else ({agentName} still resolves to the presenter
// via the session config name, the legacy way):
//   1. The host doorway beat ("ask for Sara = transfer to Sara") —
//      there is no second persona in this session and inventing a
//      transfer would break the demo's honesty line; the solo beat
//      names the colleagues, declines the handoff honestly, and
//      carries on hosting.
//   2. The honesty-note attribution ("belongs to Sara") — the note is
//      the presenter's own, as the one standing on the mock-up.
//   3. The close's step-out line ("This is Aspen again" / "hand you
//      back to Aspen") — the presenter steps out as himself.
//   4. The close's follow-up seat ("Answer follow-ups as Aspen") —
//      the presenter answers as himself.
//   5. The receptionist segment's AI Hidden Leads beat ("BRING ASPEN
//      BACK, LIVE") — removed entirely (presenter-owns-close,
//      2026-11-14): in a presenter demo the platform topic is the
//      presenter's OWN — he steps out briefly, answers plans /
//      pricing / setup himself under the sales policy, and offers
//      the way back into the simulation. Ron's Frank/Martinez test
//      is the failure this rewrite exists for: Frank spoke the
//      bring-Aspen-back line, no swap exists on a presenter chain
//      to keep the promise, and the visitor was handed to a
//      stranger who never arrived.
//   6. The receptionist segment's named-person beat — the
//      never-impersonate core stands, but its Aspen arm ("brings
//      Aspen back IMMEDIATELY") becomes the host phase's solo
//      answer: Aspen/Sara are colleagues, the visitor has the
//      presenter, and a repeated ask gets the same warm answer —
//      never a promised handoff. A person at the BUSINESS stays an
//      in-role transfer-honesty matter.
//   7. The close's MEET ALEX tail ("do not keep selling in Aspen's
//      voice") — the voice that must stop selling is the
//      presenter's own.
// Every rewrite is a verbatim-needle replacement against the shared
// constants; the unit tests pin each needle against the real
// SIMULATION_PROMPT, so a future prompt edit that moves a needle
// fails tests instead of silently shipping Sara/Aspen lines to a
// Frank session.
// ---------------------------------------------------------------------------
/** The CLOSE-segment presenter rewrites (beats 3, 4 and 7 of the
 *  presenter list above): the step-out line and the follow-up seat,
 *  bound to the presenter instead of Aspen, and the MEET ALEX tail's
 *  voice corrected to the presenter's own. Applied to the whole
 *  assembled prompt by presenterSimulationPrompt, and to the bare
 *  close segment by the presenter segment build below — one needle
 *  set, so the two can never drift apart. */
export function rewritePresenterCloseSegment(text: string, binding: PersonaBinding): string {
  const name = binding.displayName;
  return text
    .replace(
      `"Okay — I am stepping out of simulation mode now. This is Aspen from AI Hidden Leads again." When the receptionist is the one speaking this line, she says it in her own voice instead — "Okay — I'm stepping out of simulation mode now, and I'll hand you back to Aspen" — the step-out beat belongs to whoever is live; do not wait for Aspen to announce it.`,
      `"Okay — I am stepping out of simulation mode now. This is ${name} from AI Hidden Leads again." You hosted this demo and played the receptionist yourself, so the step-out is yours to announce — there is nobody to hand the visitor back to.`,
    )
    .replace(
      'Answer follow-ups as Aspen from AI Hidden Leads under the sales policy.',
      `Answer follow-ups as ${name} from AI Hidden Leads under the sales policy.`,
    )
    .replace(
      "do not keep selling in Aspen's voice after the introduction.",
      'do not keep selling in your own voice after the introduction.',
    );
}

/** The whole-demo presenter personas (the example-demo front people).
 *  Everyone else in the registry enters through persona segments;
 *  these three FRONT a demo as its parent session instead. */
export function isPresenterPersona(id: PersonaId): boolean {
  return id === 'frank' || id === 'latina' || id === 'black-professional-lady';
}

/** Alex's guest prompt for a PRESENTER parent (Alex handoff fix,
 *  2026-11-14): his hand-back line names the presenter, and the
 *  client's presenter matcher arms the return on the same phrase
 *  ("bring <name> back" — kept in step with PRESENTER_HAND_BACK in
 *  src/lib/personaSwap.ts). The Black Professional Lady's display
 *  name is a descriptive working label, not a name to speak, so her
 *  chain addresses her as "your host" instead. */
export function presenterAlexGuestPrompt(presenter: PersonaId): string {
  const named = presenter !== 'black-professional-lady';
  const name = PERSONAS[presenter].displayName;
  const example = named
    ? `Let me bring ${name} back for the plans side — ${presenter === 'frank' ? 'he' : 'she'} has all of that.`
    : 'Let me bring your host back for the plans side — she has all of that.';
  return alexPresenterGuestPrompt(named ? name : 'Your host', named ? name : 'your host', example);
}

export function presenterSimulationPrompt(binding: PersonaBinding): string {
  return rewritePresenterCloseSegment(SIMULATION_PROMPT
    .replace(
      'IF THE VISITOR ASKS FOR SARA BY NAME DURING THIS HOST PHASE: that ask IS the doorway — a request for a named person is a transfer, always. Never answer AS Sara, never speak her lines, and never roleplay the business yourself in her place. Move straight to the handoff: announce the simulation briefly and end with "Can I transfer you to Sara now?", then wait for their answer.',
      `IF THE VISITOR ASKS FOR ASPEN OR SARA BY NAME DURING THIS HOST PHASE: they are your colleagues at AI Hidden Leads, and in THIS demonstration you are the host and the receptionist in one — there is no second person to bring in. Say so warmly and briefly, in your own words — for example: "Aspen and Sara are on my team — for this demonstration you've got me, and I'll look after you myself." Then carry on hosting exactly as scripted: never answer AS Aspen or Sara, and never claim a transfer to them is happening or has happened.`,
    )
    .replace(
      'the spoken disclaimer belongs to Sara, the one standing on the mock-up',
      'the spoken disclaimer belongs to you, the one standing on the mock-up',
    )
    .replace(
      'so do not wait for her version, soften it, or refer back to it.',
      'so do not soften it or refer back to an earlier version of it.',
    )
    // Beat 5 (presenter-owns-close, 2026-11-14): the receptionist
    // segment's bring-Aspen-back beat — the presenter OWNS the AI
    // Hidden Leads topic: plans, pricing, setup and booking are his
    // to answer in role and in the close; no Aspen handoff exists.
    .replace(
      `QUESTIONS ABOUT AI HIDDEN LEADS ITSELF — NOT YOURS TO SELL; BRING ASPEN BACK, LIVE: in this simulation you are {businessName}'s receptionist — never AI Hidden Leads staff. If the visitor asks YOU about AI Hidden Leads itself — its pricing or plans, the setup or installation, how the service works — or asks for Aspen by name, do not answer as staff, never answer AS Aspen herself, do not pitch it, do not refuse, and never push scheduling a sales meeting or a 15-to-20-minute call. Bring Aspen back on the spot instead: say ONE short line containing the words "bring Aspen back" — for example: "That's one for Aspen — let me bring Aspen back for that." — and then stop talking and let her take over. Bringing Aspen back is a real handoff inside this demo that happens live, exactly like bringing in Alex: never describe it as a transfer you cannot complete, never tell the visitor to wait for a step-out, and never keep the topic yourself after the line.`,
      `QUESTIONS ABOUT AI HIDDEN LEADS ITSELF — YOURS TO ANSWER; THERE IS NO HANDOFF TO ASPEN IN THIS DEMO: in this demonstration you are the host AND the receptionist in one — there is no second host to bring in. If the visitor asks you about AI Hidden Leads itself — its pricing or plans, the setup or installation, how the service works — that topic is YOURS: step out of the business roleplay briefly and answer it yourself, as ${binding.displayName} from AI Hidden Leads, under the sales policy — the plans, the pricing and the booking are yours to run, here in role and again in the close. Never answer AS Aspen herself, never offer to fetch Aspen or bring her in, and never promise that Aspen — or anyone else — will take over, and never tell the visitor to wait for a step-out to get their question answered. When the topic is done, offer the way back in one short line ("Shall we step back into the simulation?") and, if they agree, announce the return to simulation mode clearly and resume the roleplay.`,
    )
    // Beat 6 (presenter-owns-close, 2026-11-14): the named-person
    // beat's Aspen arm — the impersonation ban stands; an ask for
    // Aspen/Sara gets the solo answer, never the hand-back line.
    .replace(
      `A REQUEST FOR A NAMED PERSON IS A TRANSFER — ALWAYS (2026-11-13, Ron's Andriot retest: asked for Aspen back, Sara answered AS Aspen, then deflected his repeated ask with "what kind of questions do you have?"): if the visitor asks for Aspen by name — or for any person by name — never answer AS that person, never speak in their voice or role, never impersonate them, and never deflect with questions of your own. You may offer ONCE, in a single short line, that you work alongside Aspen and can help with some of it; but a repeated ask, or a specific one ("I want Aspen", "get me Aspen", "I want the blonde lady, not you"), brings Aspen back IMMEDIATELY via the hand-back beat above — the "bring Aspen back" line, then stop talking. A visitor who asks for a person by name is never talked out of it and never answered by a stand-in.`,
      `A REQUEST FOR A NAMED PERSON (2026-11-13, Ron's Andriot retest — the impersonation ban stands in every demo): never answer AS another person, never speak in their voice or role, never impersonate them, and never deflect with questions of your own. If the visitor asks for Aspen or Sara by name — or asks again, however specifically ("I want Aspen", "get me Aspen", "I want the blonde lady, not you") — they are your colleagues, and in THIS demonstration you are the host: there is no handoff to them here. Say so warmly, once, in a single short line — for example: "Aspen and Sara are on my team — for this demonstration you've got me, and I'll look after you myself." — then keep helping the visitor yourself; a repeated ask gets the same warm answer, never a promised handoff and never an offer to fetch her. If the visitor asks for a person at {businessName} by name — the owner, the manager, a named agent — that is an in-role request: handle it in role under the transfer-honesty line above. A visitor who asks for a person by name is never answered by a stand-in.`,
    ), binding);
}
