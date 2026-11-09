// Avatar swap Stage 1 tests (spec §11 + Ron's 2026-11-09 requirements).
//
// Coverage:
//  - persona registry integrity (Sara/Alex ids; Aspen face is snapshot-
//    resolved, never hardcoded; SARA_VOICE is the single named constant)
//  - SIMULATION_PROMPT byte-identity after the segment split + Q4 beat
//  - segment prompt assembly (Sara binding, Alex guest, host doorway)
//  - OPENING PRIORITY regressions: (1) planned boundary → no apology, no
//    "you're back", no resume opening — for every boundary; (2) unplanned
//    reconnect mid-Sara → Sara returns with a rotating apology + recap,
//    no re-greeting; (3) two drops → different apology wording each time
//  - legacy opening parity (pre-swap chain, verbatim)
//  - segment authorization inheritance pins (gemini-session source)
//  - client state-machine units (anchors, recap, cut-over gate, drops)
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  PERSONAS, SARA_VOICE, SARA_FACE_ID, avatarSwapEnabled, personaRegistryProblems, personaSegmentPrompt,
} from '../../supabase/functions/_shared/personas';
import { ALEX_FACE_ID, ALEX_DEMO_GREETING, alexDemoGuestConfig } from '../../supabase/functions/_shared/alex-guide';
import { SIMULATION_PROMPT, SIMULATION_HOST_SEGMENT, SIMULATION_RECEPTIONIST_SEGMENT, SIMULATION_CLOSE_SEGMENT, resumeInstruction } from '../../supabase/functions/_shared/voice-config';
import { openingText, swapOpeningInstruction, personaDropInstruction, dropReconnectInstruction, dropApology, DROP_APOLOGY_VARIANTS } from '../../supabase/functions/_shared/session-opening';
import { boundaryForAssistantLine, buildSwapRecap, cutoverReady, INITIAL_SWAP_STATE, reconnectTarget, visitorSignalsStepOut, type SwapState } from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const RECAP = 'The visitor is Dana from Durgin Electric. Website: durginelectric.com.';

describe('persona registry', () => {
  test('integrity: all three personas resolve; Aspen face is NOT hardcoded', () => {
    expect(personaRegistryProblems()).toEqual([]);
    expect(PERSONAS.aspen.faceId).toBeNull(); // snapshot-resolved at runtime
    expect(PERSONAS.sara.faceId).toBe('f735e62c-dce7-4c0b-8e85-1c7e21774c45');
    expect(PERSONAS.alex.faceId).toBe(ALEX_FACE_ID);
    expect(ALEX_FACE_ID).toBe('a36d66df-a23d-4569-996b-d0e990019857');
    expect(SARA_FACE_ID).toBe(PERSONAS.sara.faceId);
  });
  test('voices: Aspen Kore, Alex Puck, Sara = the SARA_VOICE constant', () => {
    expect(PERSONAS.aspen.voiceName).toBe('Kore');
    expect(PERSONAS.alex.voiceName).toBe('Puck');
    expect(PERSONAS.sara.voiceName).toBe(SARA_VOICE);
    expect(SARA_VOICE).toBe('Leda');
  });
  test('flag: AVATAR_SWAP_ENABLED defaults OFF', () => {
    const envOf = (m: Record<string, string>) => (n: string) => m[n];
    expect(avatarSwapEnabled(envOf({}))).toBe(false);
    expect(avatarSwapEnabled(envOf({ AVATAR_SWAP_ENABLED: 'false' }))).toBe(false);
    expect(avatarSwapEnabled(envOf({ AVATAR_SWAP_ENABLED: 'true' }))).toBe(true);
  });
});

describe('prompt split', () => {
  test('SIMULATION_PROMPT is byte-identical to its three segments joined', () => {
    expect(SIMULATION_HOST_SEGMENT + SIMULATION_RECEPTIONIST_SEGMENT + SIMULATION_CLOSE_SEGMENT).toBe(SIMULATION_PROMPT);
  });
  test('Sara segment binds her name and the in-role beats', () => {
    const built = personaSegmentPrompt('sara', 'doorway', 'Durgin Electric', SIMULATION_PROMPT);
    expect(built.systemPrompt).toContain("I'm Sara");
    expect(built.systemPrompt).toContain('Durgin Electric');
    expect(built.systemPrompt).not.toContain('{agentName}');
    expect(PERSONAS.sara.voiceName).toBe(SARA_VOICE); // segment sessions take the registry voice
  });
  test('Aspen step-out segment: close segment bound to Aspen (preamble + close)', () => {
    const built = personaSegmentPrompt('aspen', 'stepout', 'Durgin Electric', SIMULATION_PROMPT);
    expect(built.systemPrompt).toContain('STEPPING OUT AND CLOSING');
    expect(built.systemPrompt).toContain('Durgin Electric');
    expect(built.systemPrompt).not.toContain('{agentName}');
    expect(PERSONAS.aspen.voiceName).toBe('Kore');
  });
  test('Q4: Sara speaks the hand-back beat herself at the step-out', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('she says it in her own voice instead');
    expect(SIMULATION_CLOSE_SEGMENT).toContain("I'll hand you back to Aspen");
  });
  test('Alex guest segment: greeting + guest prompt via parent chain', () => {
    const guest = alexDemoGuestConfig('Durgin Electric');
    expect(ALEX_DEMO_GREETING).toContain("Hi, I'm Alex");
    expect(ALEX_DEMO_GREETING).toContain('10 to 15 minutes');
    expect(ALEX_DEMO_GREETING).toContain('install snippet');
    const built = personaSegmentPrompt('alex', 'meet-alex', 'Durgin Electric', SIMULATION_PROMPT, guest);
    expect(built.systemPrompt).toContain('support specialist at AI Hidden Leads');
    expect(built.greeting).toBe(ALEX_DEMO_GREETING);
    expect(PERSONAS.alex.voiceName).toBe('Puck');
    expect(PERSONAS.alex.faceId).toBe(ALEX_FACE_ID);
  });
});

describe('opening priority — planned boundaries (Ron regression 1)', () => {
  const boundaries = ['doorway', 'stepout', 'meet-alex', 'return'] as const;
  const targets = { doorway: 'sara', stepout: 'aspen', 'meet-alex': 'alex', return: 'aspen' } as const;
  for (const boundary of boundaries) {
    test(`boundary ${boundary}: swap opening, NO apology, NO "you're back", NO resume text`, () => {
      const text = openingText({
        preview: false, opening: 'Hi there',
        personaSwap: { to: targets[boundary], boundary },
        personaDrop: null,
        resumeContext: RECAP, reconnect: true, drops: 1,
        simulation: true, verificationGate: true, inviteArrival: false,
      });
      expect(text).toBe(swapOpeningInstruction({ to: targets[boundary], boundary }, RECAP));
      expect(text).not.toMatch(/Say briefly and warmly in English, in your own words: "Hey, you're back!/);
      expect(text).not.toContain('Sorry');
      expect(text).not.toContain('Apologies');
      expect(text).not.toContain('hiccuped');
      expect(text).toContain('A planned persona handoff just happened');
      expect(text).toContain(RECAP);
    });
  }
  test('swap opening outranks even the preview branch? no — preview stays first (voice lab)', () => {
    const text = openingText({ preview: true, opening: 'Preview line', personaSwap: { to: 'sara', boundary: 'doorway' }, resumeContext: RECAP });
    expect(text).not.toContain('planned persona handoff');
  });
});

describe('opening priority — unplanned drops (Ron regressions 2 & 3)', () => {
  test('mid-Sara drop: Sara returns, ONE rotating apology, recap continuation, no re-greeting', () => {
    const text = openingText({
      preview: false, opening: 'Hi',
      personaSwap: null,
      personaDrop: { persona: 'sara', drops: 0 },
      resumeContext: RECAP, reconnect: true, drops: 0, simulation: true,
    });
    expect(text).toBe(personaDropInstruction({ persona: 'sara', drops: 0 }, RECAP));
    expect(text).toContain('You are still Sara');
    expect(text).toContain(DROP_APOLOGY_VARIANTS[0]);
    expect(text).toContain(RECAP);
    expect(text).not.toContain("you're back");
    expect(text).not.toContain('The caller just connected');
  });
  test('two drops in one conversation → different apology wording each time', () => {
    const first = dropApology(0);
    const second = dropApology(1);
    const third = dropApology(2);
    expect(new Set([first, second, third]).size).toBe(3);
    expect(dropApology(3)).toBe(first); // rotation cycles, never repeats back-to-back
    const d1 = personaDropInstruction({ persona: 'sara', drops: 0 }, RECAP);
    const d2 = personaDropInstruction({ persona: 'sara', drops: 1 }, RECAP);
    expect(d1).not.toBe(d2);
    expect(d2).toContain(DROP_APOLOGY_VARIANTS[1]);
  });
  test('drop apology never blames the visitor', () => {
    for (const v of DROP_APOLOGY_VARIANTS) {
      expect(v.toLowerCase()).not.toContain('your connection');
      expect(v.toLowerCase()).not.toContain('your network');
    }
  });
  test('persona drop outranks the legacy drop + resume branches', () => {
    const text = openingText({ preview: false, personaDrop: { persona: 'alex', drops: 2 }, resumeContext: RECAP, reconnect: true });
    expect(text).toContain('You are still Alex');
    expect(text).toContain(DROP_APOLOGY_VARIANTS[2]);
  });
});

describe('legacy opening parity (flag-off behavior is unchanged)', () => {
  test('plain resume still uses resumeInstruction', () => {
    expect(openingText({ preview: false, resumeContext: RECAP })).toBe(resumeInstruction(RECAP));
    expect(resumeInstruction(RECAP)).toContain("Hey, you're back!");
  });
  test('legacy drop reconnect still uses the rotating drop instruction', () => {
    expect(openingText({ preview: false, resumeContext: RECAP, reconnect: true })).toBe(dropReconnectInstruction(RECAP));
  });
  test('simulation host phase precedes plain simulation entry', () => {
    const host = openingText({ preview: false, opening: 'G', simulation: true, verificationGate: true });
    const sim = openingText({ preview: false, opening: 'G', simulation: true });
    expect(host).toContain('a host phase comes first');
    expect(sim).toContain('run the SIMULATION ENTRY sequence');
    expect(host).not.toBe(sim);
  });
  test('default greeting branch unchanged', () => {
    expect(openingText({ preview: false, opening: 'G' })).toContain('That greeting is your entire first turn');
  });
});

describe('segment authorization inheritance (gemini-session source pins)', () => {
  const session = read('supabase/functions/gemini-session/index.ts');
  test('segment branch exists and precedes the guide branch', () => {
    expect(session).toContain('personaSegment');
    expect(session.indexOf('if(b.personaSegment)')).toBeGreaterThan(-1);
    expect(session.indexOf('if(b.personaSegment)')).toBeLessThan(session.indexOf("if(b.guide==='alex')"));
  });
  test('Q3: segments carry quotaClass persona_segment (visitor cap counts the parent only)', () => {
    expect(session).toContain("segmentParentId?'persona_segment'");
    expect(session).toContain('quotaClass');
  });
  test('flag gate: segment branch 404s when the flag is off', () => {
    expect(session).toContain('avatarSwapEnabled(');
    const segAt = session.indexOf('if(b.personaSegment)');
    expect(session.slice(segAt, segAt + 1400)).toContain('404');
  });
  test('parent validation binds row id + visitor hash + simulation', () => {
    expect(session).toContain('introParentOk');
    expect(session).toContain('parent.simulation!==true');
    expect(session).toContain("eq('visitor_hash',visitorHash)");
  });
  test('simli-avatar persona selector requires parent proof', () => {
    const simli = read('supabase/functions/simli-avatar/index.ts');
    expect(simli).toContain("persona: z.enum(['aspen', 'sara', 'alex'])");
    expect(simli).toContain('A parent demo session is required for a persona avatar');
    expect(simli).toContain('parentConfig.personaSwapEnabled !== true');
    // Team intro widens the proof to the either/or parent class
    // (simulation parent OR team-intro parent) — same visitor-hash proof.
    expect(simli).toContain('parentConfig.teamIntroEnabled === true');
  });
});

describe('client swap state machine units', () => {
  test('anchors arm only in the right phase', () => {
    const host: SwapState = { ...INITIAL_SWAP_STATE };
    expect(boundaryForAssistantLine("Perfect — I'm stepping into simulation mode now.", host)).toBe('doorway');
    expect(boundaryForAssistantLine('Let me tell you about our simulation packages.', host)).toBeNull();
    const sim: SwapState = { ...INITIAL_SWAP_STATE, phase: 'simulation', persona: 'sara', armed: [], done: ['doorway'] };
    expect(boundaryForAssistantLine("I'm stepping out of simulation mode now — let me hand you back to Aspen.", sim)).toBe('stepout');
    expect(boundaryForAssistantLine('Our simulation is very realistic.', sim)).toBeNull();
  });
  test('visitor step-out phrases arm the soft trigger', () => {
    expect(visitorSignalsStepOut("That's enough, thanks")).toBe(true);
    expect(visitorSignalsStepOut("I've seen enough")).toBe(true);
    expect(visitorSignalsStepOut('What are the next steps?')).toBe(true);
    expect(visitorSignalsStepOut('Tell me more about your hours')).toBe(false);
  });
  test('recap is bounded and framed as an ongoing demo', () => {
    const turns = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? 'user' : 'assistant') as 'user' | 'assistant', text: `Line ${i} `.repeat(20) }));
    const recap = buildSwapRecap(turns, { visitorName: 'Dana', businessName: 'Durgin Electric', facts: [] }, 'sara');
    expect(recap.length).toBeLessThanOrEqual(2400);
    expect(recap).toContain('Persona handoff inside one ongoing demo');
    expect(recap).toContain('Dana');
  });
  test('cut-over gate truth table', () => {
    expect(cutoverReady({ authorized: true, videoRequested: false, faceReady: false })).toBe(true);
    expect(cutoverReady({ authorized: true, videoRequested: true, faceReady: true })).toBe(true);
    expect(cutoverReady({ authorized: true, videoRequested: true, faceReady: false })).toBe(false);
    expect(cutoverReady({ authorized: false, videoRequested: false, faceReady: true })).toBe(false);
  });
  test('drop recovery re-authorizes the SAME persona under the ORIGINAL parent', () => {
    const state: SwapState = { phase: 'simulation', persona: 'sara', segment: 1, armed: ['doorway'], done: ['doorway'], drops: 1, pendingStepout: false, pendingAlex: false, pendingDoorway: false, teamIntroDone: false, teamIntroSeen: false };
    const target = reconnectTarget(state, 'parent-123');
    expect(target.personaSegment).toEqual({ persona: 'sara', boundary: 'doorway', parentSessionId: 'parent-123' });
    const hostTarget = reconnectTarget({ ...INITIAL_SWAP_STATE }, 'parent-123');
    expect(hostTarget.personaSegment).toBeUndefined(); // host drops stay legacy
  });
  test('client shows no connecting state at boundaries (source pin)', () => {
    const convo = read('src/components/GeminiConversation.tsx');
    expect(convo).toContain('swapTransition ? phase :');
    expect(convo).toContain('onPersonaChange');
    const widget = read('src/components/GeminiAgentWidget.tsx');
    expect(widget).toContain('handlePersonaChange');
    expect(widget).toContain('displayName');
  });
});
