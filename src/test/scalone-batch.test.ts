// Scalone batch (2026-11-12) — regression tests for the fixes built
// from Ron's Alexa Scalone demo tests + the row-pull addendum
// (~/workspace/ron-scalone-test-forensics-2026-11-12.md):
//   Item 1 — the example-listings layer + approved script reach SARA's
//            segment prompt for sample sessions (F4: the stamp landed
//            on the Aspen parent only; her fresh segment build dropped
//            it). Non-sample segments stay byte-identical; Aspen's
//            builds never carry the layer.
//   Item 2 — summon-aspen: Sara hands back LIVE when the visitor names
//            Aspen or asks an AI Hidden Leads pricing/platform
//            question (F3), plus her own goodbye/hang-up handling
//            (addendum: "I am unable to hang up the line from my
//            side" must never be said again).
//   Item 3 — out-of-area seller rule (F5): service areas are color,
//            never a wall — in the simulation segment AND the realtor
//            conversation layer.
//   Item 4 — greeting name hygiene (F6): "CRM Prospect" & kin are NO
//            name, server-side.
//   Item 5 — greeting clock + segment timezone (F7, solved by the row
//            pull): segment spawns inherit the parent's configured
//            timezone; the greeting hour derives from the configured
//            zone, not the authorizing browser's clock.
//   Item 6 — swap-gap hardening (F1): the forced-execute run was the
//            painful one — a bridging line covers the hold, a forced
//            swap lands Sara voice-first, a refused face never blocks
//            the voice path, drop recovery stays intact.
//   Item 7 — Alexa Scalone is out of the examples (13 remain).
//   Drive-by — the code greeting variants assemble without seams
//            (the stored seam lives in the snapshot's data, not code).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { personaSegmentPrompt } from '../../supabase/functions/_shared/personas';
import {
  REALTOR_EXAMPLE_PACKS,
  REALTOR_EXAMPLE_SIMULATION_SCRIPT,
  buildExampleListingsLayer,
  examplePackBySlug,
  stampExampleListings,
  topExampleListings,
} from '../../supabase/functions/_shared/realtor-example-listings';
import {
  DEMO_SITE_GREETING_VARIANTS,
  DEMO_SITE_STAT_LINES,
  SIMULATION_RECEPTIONIST_SEGMENT,
  greeting,
  hourInTimeZone,
  isPlaceholderVisitorName,
  openingFor,
  sanitizeVisitorName,
  segmentTimeZone,
  timeGreeting,
} from '../../supabase/functions/_shared/voice-config';
import { REALTOR_CONVERSATION_LAYER } from '../../supabase/functions/_shared/homepage-knowledge';
import { BOUNDARY_ANCHORS, swapOpeningInstruction } from '../../supabase/functions/_shared/session-opening';
import { detectFarewell } from '../../supabase/functions/_shared/farewell';
import {
  BOUNDARY_TARGET,
  INITIAL_SWAP_STATE,
  PHASE_AFTER_BOUNDARY,
  SWAP_ARM_DEADLINE_MS,
  SWAP_BRIDGE_AFTER_MS,
  boundaryForAssistantLine,
  cutoverMode,
  gateWaitContinues,
  noteAspenIntent,
  reconnectTarget,
  swapBridgeDue,
  swapWatchdogAction,
  visitorRequestsAspen,
  type SwapState,
} from '@/lib/personaSwap';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', '..', rel), 'utf8');
const sessionSource = read('supabase/functions/gemini-session/index.ts');
const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');
const conversationSource = read('src/components/GeminiConversation.tsx');

const simState = (over: Partial<SwapState> = {}): SwapState => ({
  ...INITIAL_SWAP_STATE, phase: 'simulation', persona: 'sara', done: ['doorway'], ...over,
});

describe('Item 1 — example listings reach Sara (F4)', () => {
  const pack = REALTOR_EXAMPLE_PACKS.find((p) => p.slug === 'michael-martinez')!;
  const layer = buildExampleListingsLayer(pack);

  it('the listings-strong pack leads with the agent\'s OWN listings', () => {
    expect(pack).toBeDefined();
    expect(topExampleListings(pack, 3)[0].source).toBe('site');
    expect(layer).toContain('EXAMPLE LISTINGS LAYER');
    expect(layer).toContain(REALTOR_EXAMPLE_SIMULATION_SCRIPT.replace(/\{agentName\}/g, pack.agentName).slice(0, 80));
  });

  it('a SAMPLE Sara segment contains the listings + the approved script', () => {
    const built = personaSegmentPrompt('sara', 'doorway', pack.agentName, 'PARENT PROMPT', undefined, false, undefined, { layer });
    expect(built.systemPrompt).toContain('EXAMPLE LISTINGS LAYER');
    expect(built.systemPrompt).toContain('SIMULATION SCRIPT — OWNER-APPROVED WORDING');
    expect(built.systemPrompt).toContain('Are you calling about one of our listings today?');
    expect(built.systemPrompt).toContain(topExampleListings(pack, 3)[0].descriptor);
    // The script's not-my-listing narration rides along too.
    expect(built.systemPrompt).toContain('In a real call I\'d whisper a summary and transfer you to');
  });

  it('a NON-sample Sara segment contains neither — and stays byte-identical', () => {
    const plain = personaSegmentPrompt('sara', 'doorway', pack.agentName, 'PARENT PROMPT');
    expect(plain.systemPrompt).not.toContain('EXAMPLE LISTINGS LAYER');
    expect(plain.systemPrompt).not.toContain('SIMULATION SCRIPT');
    expect(plain.systemPrompt).not.toContain('EXAMPLE LISTINGS');
    // An explicitly empty layer option changes nothing.
    const emptyOption = personaSegmentPrompt('sara', 'doorway', pack.agentName, 'PARENT PROMPT', undefined, false, undefined, { layer: '' });
    expect(emptyOption.systemPrompt).toBe(plain.systemPrompt);
  });

  it('Aspen\'s builds never carry the layer, even if the option is passed', () => {
    const withOption = personaSegmentPrompt('aspen', 'stepout', 'Biz', 'PARENT PROMPT', undefined, false, undefined, { layer });
    const plain = personaSegmentPrompt('aspen', 'stepout', 'Biz', 'PARENT PROMPT');
    expect(withOption.systemPrompt).toBe(plain.systemPrompt);
    expect(withOption.systemPrompt).not.toContain('EXAMPLE LISTINGS LAYER');
  });

  it('the stamp → marker → slug → layer chain resolves (and Scalone\'s slug is dead)', () => {
    const cfg: Record<string, unknown> = { systemPrompt: 'BASE' };
    stampExampleListings(cfg, pack);
    const marker = cfg.exampleListings as { slug: string };
    expect(marker.slug).toBe(pack.slug);
    expect(examplePackBySlug(marker.slug)?.slug).toBe(pack.slug);
    expect(examplePackBySlug('alexa-scalone')).toBeNull();
    expect(examplePackBySlug(undefined)).toBeNull();
    expect(examplePackBySlug('')).toBeNull();
  });

  it('gemini-session wires the layer into the SARA segment build only', () => {
    expect(sessionSource).toContain("b.personaSegment.persona==='sara'?examplePackBySlug((parent.exampleListings as {slug?:unknown}|undefined)?.slug)");
    expect(sessionSource).toContain('examplePack?{layer:buildExampleListingsLayer(examplePack)}:undefined');
  });
});

describe('Item 2 — summon-aspen (F3)', () => {
  it('the boundary registry routes summon-aspen to an Aspen close-phase segment', () => {
    expect(BOUNDARY_TARGET['summon-aspen']).toBe('aspen');
    expect(PHASE_AFTER_BOUNDARY['summon-aspen']).toBe('close');
    expect(BOUNDARY_ANCHORS['summon-aspen']).toEqual(['bring aspen back']);
  });

  it('visitor triggers: naming Aspen, or an AI Hidden Leads pricing/platform question', () => {
    for (const line of [
      'Can I talk to Aspen?',
      'Bring Aspen back, please',
      'Ask Aspen about that',
      'What is your pricing?',
      'How much do you charge?',
      'Tell me about AI Hidden Leads',
      'What does your service cost?',
      'What are your plans?',
    ]) expect(visitorRequestsAspen(line), line).toBe(true);
  });

  it('visitor non-triggers: business roleplay questions stay Sara\'s', () => {
    for (const line of [
      'How much is this house?',
      'What is the price of the condo on the corner?',
      'How much is it?',
      'Can you show me the kitchen?',
      'Do you have anything with a pool?',
      'What time do you close?',
    ]) expect(visitorRequestsAspen(line), line).toBe(false);
  });

  it('noteAspenIntent folds only in simulation, and is one-shot', () => {
    const before = simState();
    const after = noteAspenIntent(before, 'What is your pricing?');
    expect(after.pendingAspen).toBe(true);
    // Host / close / intro phases never set it (Aspen is already there).
    const host = { ...INITIAL_SWAP_STATE };
    expect(noteAspenIntent(host, 'What is your pricing?')).toBe(host);
    // Once done, later matches never re-fire.
    const doneState = simState({ done: ['doorway', 'summon-aspen'], pendingAspen: false });
    expect(noteAspenIntent(doneState, 'Bring Aspen back')).toBe(doneState);
    // A business question changes nothing (same object back).
    expect(noteAspenIntent(before, 'How much is the house?')).toBe(before);
  });

  it('Sara\'s next line executes summon-aspen when the visitor asked — anchor or no anchor', () => {
    const state = simState({ pendingAspen: true });
    expect(boundaryForAssistantLine('Sure, the kitchen was renovated last year.', state)).toBe('summon-aspen');
  });

  it('Sara\'s scripted hand-back line arms summon-aspen in simulation — and stays the return in alex-guest', () => {
    const line = "That's one for Aspen — let me bring Aspen back for that.";
    expect(boundaryForAssistantLine(line, simState())).toBe('summon-aspen');
    const guest: SwapState = { ...INITIAL_SWAP_STATE, phase: 'alex-guest', persona: 'alex', done: ['doorway', 'stepout', 'meet-alex'] };
    expect(boundaryForAssistantLine(line, guest)).toBe('return');
  });

  it('the summon opening: Aspen answers the question directly — no step-out close', () => {
    const text = swapOpeningInstruction({ to: 'aspen', boundary: 'summon-aspen' }, 'REACP-FACTS');
    expect(text).toContain('brought you back LIVE, mid-simulation');
    expect(text).toContain('Do NOT run the step-out close');
    expect(text).toContain('Answer the visitor\'s actual question directly');
    expect(text).toContain('REACP-FACTS');
    expect(text).not.toBe(swapOpeningInstruction({ to: 'aspen', boundary: 'stepout' }, 'REACP-FACTS'));
  });

  it('Sara\'s segment teaches the live hand-back, and the client + server are wired for it', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('BRING ASPEN BACK, LIVE');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('or asks for Aspen by name');
    expect(sessionSource).toContain("'summon-aspen'");
    expect(conversationSource.match(/noteAspenIntent\(swapStateRef\.current, userLineRef\.current\)/g)).toHaveLength(2);
    expect(conversationSource.match(/armSwapRef\.current\('summon-aspen'\)/g)).toHaveLength(2);
    expect(conversationSource).toContain("pendingAspen: boundary === 'summon-aspen' ? false : swapStateRef.current.pendingAspen");
  });

  it('goodbye handling (addendum): Sara can always end the call — the refusal is untaught', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('GOODBYES — YOU CAN ALWAYS END THE CALL');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('never say you are unable to hang up or end the line from your side');
    const built = personaSegmentPrompt('sara', 'doorway', 'Biz', 'PARENT PROMPT');
    expect(built.systemPrompt).toContain('GOODBYES — YOU CAN ALWAYS END THE CALL');
    // The proxy-side farewell detector (Aspen's mechanism, shared by
    // every session) fires on the whole-utterance forms.
    expect(detectFarewell('hang up')).toBe(true);
    expect(detectFarewell('okay, goodbye')).toBe(true);
  });
});

describe('Item 3 — out-of-area seller rule (F5)', () => {
  it('the simulation segment: areas are color, never a wall', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('OUT-OF-AREA LEADS — NEVER TURN A CALLER AWAY OVER GEOGRAPHY');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('If a caller wants to sell or buy outside those areas, never refuse them');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('never say the business does not serve their area');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('a valuation or evaluation of their property');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('a referral to someone who can');
  });

  it('the realtor conversation layer carries the same rule for realtor-mode sessions', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('OUT-OF-AREA SELLER LEADS — SPECIALIZATION IS COLOR, NEVER A WALL');
    expect(REALTOR_CONVERSATION_LAYER).toContain('she NEVER turns a seller away for being outside the stated areas');
    expect(REALTOR_CONVERSATION_LAYER).toContain('takes the lead, notes the location');
  });

  it("Ron's scenario shape: a Fort Lauderdale condo offered to a Delray/Boca agent is a lead, not a refusal", () => {
    // The rule is stated for exactly this geometry: the caller's
    // location is noted and the next step offered — the segment text
    // contains no instruction that would reject an out-of-area seller.
    const rule = SIMULATION_RECEPTIONIST_SEGMENT.slice(SIMULATION_RECEPTIONIST_SEGMENT.indexOf('OUT-OF-AREA LEADS'));
    expect(rule).toContain('note the location plainly');
    expect(rule).toContain('Take the lead exactly as you would an in-area one');
    expect(rule.toLowerCase()).not.toContain('outside your service area, so');
  });
});

describe('Item 4 — greeting name hygiene (F6)', () => {
  it('placeholder sentinels are NO name; real names pass', () => {
    for (const p of ['CRM Prospect', 'crm prospect', '  CRM  Prospect ', 'Prospect', 'Guest', 'Unknown', 'Demo Visitor', 'CRM Lead', 'test user']) {
      expect(isPlaceholderVisitorName(p), p).toBe(true);
    }
    for (const r of ['Ron Melo', 'John Doe', 'Dana', 'Maria Garcia', 'Chris']) {
      expect(isPlaceholderVisitorName(r), r).toBe(false);
    }
    expect(sanitizeVisitorName('CRM Prospect')).toBe('');
    expect(sanitizeVisitorName('  Dana  ')).toBe('Dana');
    expect(sanitizeVisitorName('')).toBe('');
    expect(sanitizeVisitorName(undefined)).toBe('');
  });

  it('the greeting built from "CRM Prospect" is the generic one', () => {
    const cfg = { name: 'Aspen', businessName: 'Biz', greeting: '{timeGreeting}, {visitorFirstName}. {nameQuestion}' };
    const out = greeting(cfg, 10, 'CRM Prospect');
    expect(out).not.toContain('CRM');
    expect(out).toContain('welcome');
    expect(out).toContain('What is your name?');
    expect(greeting(cfg, 10, 'Dana')).toContain('Dana');
  });

  it('rotation openings never personalize to the placeholder', () => {
    const cfg = { name: 'Aspen', businessName: 'Biz', greeting: 'x', greetings: ['{timeGreeting}, friend. And may I have your name, so I can greet you by it?'] };
    const anon = openingFor(cfg, 10, 'CRM Prospect');
    expect(anon).not.toContain('CRM');
    expect(anon).toContain('may I have your name');
    expect(openingFor(cfg, 10, 'Dana')).toContain("It's great to speak with you, Dana.");
  });

  it('gemini-session sanitizes the resolved greeting name server-side', () => {
    expect(sessionSource).toContain('sanitizeVisitorName(b.visitorName');
    expect(sessionSource).toContain('openingFor(config,greetingHour,greetingName)');
  });
});

describe('Item 5 — greeting clock + segment timezone propagation (F7)', () => {
  // Ron's moment: 19:32 EST on 2026-11-12 = 00:32 UTC on 2026-11-13.
  const instant = new Date(Date.UTC(2026, 10, 13, 0, 32));

  it('the hour derives from the configured zone — the same instant, three zones', () => {
    expect(hourInTimeZone(instant, 'America/New_York')).toBe(19);
    expect(hourInTimeZone(instant, 'UTC')).toBe(0);
    expect(hourInTimeZone(instant, 'Australia/Sydney')).toBe(11);
    expect(timeGreeting(hourInTimeZone(instant, 'America/New_York'))).toBe('Good evening');
    // The bug, reproduced: under the UTC default the same instant
    // reads as morning — exactly what Sara said.
    expect(timeGreeting(hourInTimeZone(instant, 'UTC'))).toBe('Good morning');
  });

  it('missing/invalid zones fall back sanely (undefined → caller fallback)', () => {
    expect(hourInTimeZone(instant, 'Not/AZone')).toBeUndefined();
    expect(hourInTimeZone(instant, '')).toBeUndefined();
    expect(hourInTimeZone(instant, undefined)).toBeUndefined();
    expect(hourInTimeZone(instant, null)).toBeUndefined();
  });

  it('a segment spawned from an America/New_York parent carries America/New_York', () => {
    expect(segmentTimeZone({ timeZone: 'America/New_York' }, 'UTC')).toBe('America/New_York');
    expect(segmentTimeZone({ timeZone: 'America/New_York' }, undefined)).toBe('America/New_York');
    // Fallbacks: a parent without a usable zone keeps the request's.
    expect(segmentTimeZone({}, 'UTC')).toBe('UTC');
    expect(segmentTimeZone({ timeZone: 'Bogus/Zone' }, 'America/Chicago')).toBe('America/Chicago');
    expect(segmentTimeZone(undefined, undefined)).toBe('UTC');
  });

  it('gemini-session stamps the EFFECTIVE zone and derives the greeting hour from it', () => {
    expect(sessionSource).toContain('segmentTimeZone(');
    expect(sessionSource).toContain('timeZone:effectiveTimeZone');
    expect(sessionSource).toContain('hourInTimeZone(new Date(),effectiveTimeZone)');
  });
});

describe('Item 6 — swap-gap hardening (F1: the forced-execute run)', () => {
  const due = { holdBoundary: 'doorway' as const, armedAt: 1_000, bridgeSentFor: 0, turnInFlight: false };

  it('the bridging line is due once per arm, only while the hold outlasts the bound in silence', () => {
    expect(swapBridgeDue({ ...due, now: 1_000 + SWAP_BRIDGE_AFTER_MS - 1 })).toBe(false);
    expect(swapBridgeDue({ ...due, now: 1_000 + SWAP_BRIDGE_AFTER_MS })).toBe(true);
    // Already sent for THIS arm stamp → never repeats.
    expect(swapBridgeDue({ ...due, now: 999_999, bridgeSentFor: 1_000 })).toBe(false);
    // A retry arm carries a different stamp → it earns its own line.
    expect(swapBridgeDue({ holdBoundary: 'doorway', armedAt: 50_000, now: 50_000 + SWAP_BRIDGE_AFTER_MS, bridgeSentFor: 1_000, turnInFlight: false })).toBe(true);
    // No hold, no arm stamp, or a turn in flight (she IS speaking) → no bridge.
    expect(swapBridgeDue({ ...due, holdBoundary: null, now: 999_999 })).toBe(false);
    expect(swapBridgeDue({ ...due, armedAt: 0, now: 999_999 })).toBe(false);
    expect(swapBridgeDue({ ...due, now: 999_999, turnInFlight: true })).toBe(false);
  });

  it('the watchdog FORCES a decision at the arm deadline even when the face never readied (the F1 shape)', () => {
    expect(swapWatchdogAction({
      boundary: 'doorway', now: 1 + SWAP_ARM_DEADLINE_MS, armedAt: 1,
      stagePresent: true, stageAuthorizedAt: 500, faceFailed: false,
      gateReady: false, turnInFlight: false,
    })).toBe('force');
  });

  it('voice-first: a forced or face-less swap still lands Sara in VOICE — the face never gates her', () => {
    expect(cutoverMode({ videoRequested: true, faceReady: false })).toBe('voice-first');
    expect(cutoverMode({ videoRequested: true, faceReady: true })).toBe('face-first');
    expect(cutoverMode({ videoRequested: false, faceReady: false })).toBe('face-first');
    // The gate-wait stops waiting the moment the face settles FAILED
    // (a refused pre-warm under the 2-concurrent cap included).
    expect(gateWaitContinues({ stagePresent: true, boundaryMatches: true, faceReady: false, faceFailed: true, tokenStale: false }, true)).toBe(false);
    // And the watchdog executes immediately on a latched face failure.
    expect(swapWatchdogAction({
      boundary: 'doorway', now: 100, armedAt: 1,
      stagePresent: true, stageAuthorizedAt: 50, faceFailed: true,
      gateReady: false, turnInFlight: false,
    })).toBe('execute');
  });

  it('the bridge rides the proxy idle_prompt channel, simulation-gated, and the client sends it from the watchdog', () => {
    expect(proxySource).toContain("msg.stage === 'bridge' && config.simulation === true");
    expect(proxySource).toContain('bridging line');
    expect(conversationSource).toContain("type: 'idle_prompt', stage: 'bridge'");
    expect(conversationSource).toContain('swapBridgeDue({');
  });

  it('drop recovery is intact: a resumed simulation session re-authorizes SARA (may start with Sara)', () => {
    expect(reconnectTarget(simState(), 'parent-id')).toEqual({
      persona: 'sara',
      personaSegment: { persona: 'sara', boundary: 'doorway', parentSessionId: 'parent-id' },
    });
  });
});

describe('Item 7 + drive-by — examples count and greeting-variant assembly', () => {
  it('13 example packs remain and Scalone is not among them', () => {
    expect(REALTOR_EXAMPLE_PACKS).toHaveLength(13);
    expect(REALTOR_EXAMPLE_PACKS.map((p) => p.slug)).not.toContain('alexa-scalone');
    expect(examplePackBySlug('alexa-scalone')).toBeNull();
  });

  it('the CODE greeting variants assemble whole — the stored seam is snapshot data, not this template', () => {
    expect(DEMO_SITE_GREETING_VARIANTS).toHaveLength(3);
    for (const variant of DEMO_SITE_GREETING_VARIANTS) {
      expect(variant).toContain('thanks for trying the demo I built for {businessName}.');
      expect(variant).not.toContain('thanks for trying the demo is');
      expect(DEMO_SITE_STAT_LINES.some((s) => variant.includes(s))).toBe(true);
      expect(variant).toContain('meet Sara');
    }
  });
});
