// Example presenter tests (Frank batch, 2026-11-13).
//
// Coverage:
//  - the Frank registry binding (name lives in exactly one config
//    place — PERSONAS.frank.displayName; voice Charon; the Senior
//    Owner face created 2026-11-13) + registry integrity
//  - the presenter map: exactly the three male agents' examples map
//    to Frank, keyed by slug AND by pinned leadId, in BOTH the
//    server copy (_shared) and the client copy (src/data)
//  - presenterSimulationPrompt: the solo rewrites fire on the real
//    SIMULATION_PROMPT (no Sara doorway, no Aspen step-out lines),
//    and the simulation substance (in-role greeting shape, overview,
//    listings-era receptionist beats) survives untouched
//  - gemini-session / simli-avatar source pins: the presenter stamp
//    composes the legacy parent, withholds the swap stamp, and the
//    face token is authorized against the server map by leadId
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  PERSONAS, FRANK_FACE_ID, FRANK_VOICE, personaFor, personaRegistryProblems, presenterSimulationPrompt,
} from '../../supabase/functions/_shared/personas';
import { SIMULATION_PROMPT } from '../../supabase/functions/_shared/voice-config';
import {
  REALTOR_EXAMPLE_PINNED_LEADS as SERVER_PINNED_LEADS,
  examplePresenterForSlug, examplePresenterForLeadId,
} from '../../supabase/functions/_shared/realtor-example-pinned-leads';
import {
  REALTOR_EXAMPLE_PINNED_LEADS as CLIENT_PINNED_LEADS,
  REALTOR_EXAMPLE_PRESENTERS as CLIENT_PRESENTERS,
  presenterForExampleLeadId,
} from '@/data/realtorExamplePinnedLeads';

const FRANK_SLUGS = ['michael-martinez', 'richard-steinberg', 'paul-saperstein'];
const FRANK_LEAD_IDS = [
  '10e46ba2-677d-4783-bcb2-1ddbe82e9fd3', // michael-martinez
  '51353057-8b1d-4e89-828b-ae12287efb3c', // richard-steinberg
  '8db3a00c-b24c-4c5c-a371-67db376c28ef', // paul-saperstein
];

describe('frank registry binding', () => {
  test('binds the approved name, the mature male voice and the Senior Owner face', () => {
    const frank = personaFor('frank');
    expect(frank.displayName).toBe('Frank');
    expect(frank.voiceName).toBe('Charon');
    expect(FRANK_VOICE).toBe('Charon');
    expect(frank.faceId).toBe('b3f85f7f-57ea-4f24-b1f6-a57229b4fae1');
    expect(FRANK_FACE_ID).toBe(frank.faceId);
    expect(frank.portraitFaceId).toBe(frank.faceId);
    expect(PERSONAS.frank).toBe(frank);
  });

  test('registry integrity covers frank (voice is a real Gemini voice, face is a UUID)', () => {
    expect(personaRegistryProblems()).toEqual([]);
  });
});

describe('example presenter map', () => {
  test('exactly the three male agents map to frank by slug; every other example stays Aspen→Sara', () => {
    for (const slug of FRANK_SLUGS) expect(examplePresenterForSlug(slug)).toBe('frank');
    for (const entry of SERVER_PINNED_LEADS) {
      if (FRANK_SLUGS.includes(entry.slug)) continue;
      expect(examplePresenterForSlug(entry.slug)).toBeNull();
    }
    expect(examplePresenterForSlug('not-an-example')).toBeNull();
    expect(examplePresenterForSlug(undefined)).toBeNull();
    expect(examplePresenterForSlug(null)).toBeNull();
  });

  test('the same three map to frank by pinned leadId (server copy)', () => {
    for (const leadId of FRANK_LEAD_IDS) expect(examplePresenterForLeadId(leadId)).toBe('frank');
    for (const entry of SERVER_PINNED_LEADS) {
      if (FRANK_LEAD_IDS.includes(entry.leadId)) continue;
      expect(examplePresenterForLeadId(entry.leadId)).toBeNull();
    }
    expect(examplePresenterForLeadId('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(examplePresenterForLeadId(undefined)).toBeNull();
  });

  test('client copy agrees with the server copy for every pinned lead', () => {
    expect(CLIENT_PRESENTERS).toEqual({
      'michael-martinez': 'frank',
      'richard-steinberg': 'frank',
      'paul-saperstein': 'frank',
    });
    expect(CLIENT_PINNED_LEADS.map(e => e.leadId)).toEqual(SERVER_PINNED_LEADS.map(e => e.leadId));
    for (const entry of CLIENT_PINNED_LEADS) {
      expect(presenterForExampleLeadId(entry.leadId)).toBe(examplePresenterForLeadId(entry.leadId));
    }
    expect(presenterForExampleLeadId(undefined)).toBeNull();
    expect(presenterForExampleLeadId(null)).toBeNull();
  });
});

describe('presenter simulation prompt', () => {
  const prompt = presenterSimulationPrompt(personaFor('frank'));

  test('the two-persona beats are rewritten for the solo presenter', () => {
    // No Sara doorway: nobody to transfer to in a solo demo.
    expect(prompt).not.toContain('Can I transfer you to Sara now?');
    expect(prompt).not.toContain('that ask IS the doorway');
    expect(prompt).toContain('you are the host and the receptionist in one');
    expect(prompt).toContain('never claim a transfer to them is happening');
    // The honesty note is the presenter's own.
    expect(prompt).not.toContain('belongs to Sara');
    expect(prompt).toContain('the spoken disclaimer belongs to you, the one standing on the mock-up');
    // The step-out is Frank's, and follow-ups are answered as Frank.
    expect(prompt).not.toContain('This is Aspen from AI Hidden Leads again');
    expect(prompt).not.toContain('hand you back to Aspen');
    expect(prompt).toContain('This is Frank from AI Hidden Leads again');
    expect(prompt).toContain('Answer follow-ups as Frank from AI Hidden Leads under the sales policy.');
  });

  test('the simulation substance survives untouched', () => {
    expect(prompt).toContain('THE SIMULATION ENTRY');
    expect(prompt).toContain("I'm {agentName}, thanks for calling. How can I help you?");
    expect(prompt).toContain('THE BUSINESS OVERVIEW');
    expect(prompt).toContain('STEPPING OUT AND CLOSING THE DEMO');
    expect(prompt).not.toBe(SIMULATION_PROMPT);
  });
});

describe('authorization source pins', () => {
  const geminiSession = fs.readFileSync(path.join(__dirname, '../../supabase/functions/gemini-session/index.ts'), 'utf8');
  const simliAvatar = fs.readFileSync(path.join(__dirname, '../../supabase/functions/simli-avatar/index.ts'), 'utf8');

  test('gemini-session stamps the presenter parent and withholds the swap stamp', () => {
    expect(geminiSession).toContain('examplePresenterForSlug(examplePack.slug)');
    expect(geminiSession).toContain('simulationPrompt:presenterSimulationPrompt(presenter)');
    expect(geminiSession).toContain('config.demoPresenter=presenter.id');
    expect(geminiSession).toContain('!config.demoPresenter) config.personaSwapEnabled=true');
  });

  test('simli-avatar authorizes the presenter face against the server map by leadId', () => {
    expect(simliAvatar).toContain('examplePresenterForLeadId(b.leadId) !== b.persona');
    expect(simliAvatar).toContain("persona: z.enum(['aspen', 'sara', 'alex', 'frank'])");
  });
});
