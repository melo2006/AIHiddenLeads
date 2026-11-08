// @vitest-environment node
/**
 * Demo Script v2 (Ron's spec 2026-11-09; audit ~/workspace/demo-entry-sequence-audit-2026-11-09.md §C).
 * Pins the new demo choreography: the entry doorway, the proxy turn-1 fix,
 * the resume-hijack fix, transfer honesty, the scripted step-out close and
 * the Alex seam — plus the phone-demo adaptation.
 */
import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SIMULATION_GREETING, SIMULATION_PROMPT } from '../../supabase/functions/_shared/voice-config';
import { DEMO_SALES_POLICY } from '../../supabase/functions/_shared/demo-sales';
import { PHONE_DEMO_HOST_POLICY } from '../../supabase/functions/_shared/phone-demo';
import { GATE_LINES } from '../lib/demoVerification';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

test('C1a: simulation greeting carries mock-up framing + Alex comfort line; transfer-priming sentence removed', () => {
  expect(SIMULATION_GREETING).toContain('I read the public pages of {businessName} the way any visitor would');
  expect(SIMULATION_GREETING).toContain('Nothing was changed on the real website and nothing was installed on it');
  expect(SIMULATION_GREETING).toContain('Our support specialist, Alex, walks you through setup personally');
  expect(SIMULATION_GREETING).not.toContain('Your own calendar and warm transfers require setup');
  expect(SIMULATION_GREETING).toContain('{timeGreeting}, {visitorFirstName}.');
});

test('C1b: the entry sequence runs the six beats in order', () => {
  const beats = ['THE ANNOUNCEMENT', 'EXPECTATIONS', 'THE PAUSE', 'THE IN-ROLE GREETING', 'THE BUSINESS OVERVIEW', 'THE NAME, THEN THE OPENING QUESTION'];
  let last = -1;
  for (const beat of beats) {
    const idx = SIMULATION_PROMPT.indexOf(beat);
    expect(idx, beat).toBeGreaterThan(last);
    last = idx;
  }
  expect(SIMULATION_PROMPT).toContain('now we are stepping into simulation mode');
  expect(SIMULATION_PROMPT).toContain('pricing, details, a manager, anything they want to know');
  expect(SIMULATION_PROMPT).toContain('about 2 minutes of learning');
  expect(SIMULATION_PROMPT).toContain('keeps perfecting and expanding my knowledge base');
  expect(SIMULATION_PROMPT).toContain('a slow count of 3 in silence');
  expect(SIMULATION_PROMPT).toContain('Never open the role with "how can I help you."');
  expect(SIMULATION_PROMPT).toContain('30 to 45 second overview');
  expect(SIMULATION_PROMPT).toContain('skip this ask entirely if the visitor\'s name is already known');
  expect(SIMULATION_PROMPT).toContain('Is there anything specific you would like to find out about {businessName}?');
  // The old conflicting choreography is gone (audit C-4).
  expect(SIMULATION_PROMPT).not.toContain('at most 30 seconds, ask how you can help');
});

test('C6: transfer/booking honesty line is present, once-per-conversation per topic', () => {
  expect(SIMULATION_PROMPT).toContain('TRANSFERS AND BOOKINGS — THE HONESTY LINE');
  expect(SIMULATION_PROMPT).toContain('In your live setup I would warm-transfer you to the owner right here — in this demo I cannot complete the transfer');
  expect(SIMULATION_PROMPT).toContain('In your live setup that appointment would go straight into the real calendar');
  expect(SIMULATION_PROMPT).toContain('without repeating the disclaimer');
});

test('C7a: the step-out close runs its beats in order, incl. the Alex seam before next steps', () => {
  const beats = ['ANNOUNCE THE STEP-OUT', 'ASK FOR THEIR GENUINE REACTION', 'RECAP THIS DEMO', 'OPEN THE FLOOR', 'MEET ALEX', 'NEXT STEPS come last'];
  let last = -1;
  for (const beat of beats) {
    const idx = SIMULATION_PROMPT.indexOf(beat);
    expect(idx, beat).toBeGreaterThan(last);
    last = idx;
  }
  expect(SIMULATION_PROMPT).toContain('I am stepping out of simulation mode now. This is Aspen from AI Hidden Leads again.');
  expect(SIMULATION_PROMPT).toContain('did you like it?');
  expect(SIMULATION_PROMPT).toContain('helping you win more leads and close more business?');
  expect(SIMULATION_PROMPT).toContain('This is Alex — our support specialist.');
  expect(SIMULATION_PROMPT).toContain('Alex — say hello.');
});

test('C7b: the sales policy defers to the single close (no double wrap-up)', () => {
  expect(DEMO_SALES_POLICY).toContain('the step-out and close follow the STEPPING OUT AND CLOSING sequence');
  expect(DEMO_SALES_POLICY).toContain('Do not run a second, separate close.');
  expect(DEMO_SALES_POLICY).not.toContain('give the visitor a brief report of what the demonstration produced');
});

test('C2: proxy opening — host-phase branch precedes the simulation branch; old no-pause order removed', () => {
  const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
  const hostBranch = proxy.indexOf('config.verificationGate === true || config.inviteArrival === true');
  const simBranch = proxy.indexOf('run the SIMULATION ENTRY sequence from your instructions');
  expect(hostBranch).toBeGreaterThan(-1);
  expect(simBranch).toBeGreaterThan(hostBranch);
  expect(proxy).toContain('a host phase comes first, and your instructions govern it');
  expect(proxy).not.toContain('in the same turn and without pausing for a reply');
  expect(proxy).not.toContain('30 to 60 second overview');
});

test('C3: GeminiConversation clears the visit-memory bucket on the pending→verified flip', () => {
  const convo = read('src/components/GeminiConversation.tsx');
  expect(convo).toContain("prevVerificationRef.current === 'pending' && verification === 'verified'");
  expect(convo).toContain("visitMemory.delete(agentId || 'homepage')");
});

test('C5: on-screen unlock line sets up the new doorway', () => {
  expect(GATE_LINES.verified).toContain('I will step into simulation mode and become your business');
  expect(GATE_LINES.verified).toContain('treat me like a brand-new caller');
});

test('C9: phone demo doorway — announcement, pause, in-role greeting, bounded overview, reaction question', () => {
  expect(PHONE_DEMO_HOST_POLICY).toContain('ROLE SWITCH (the doorway — never flip roles unannounced)');
  expect(PHONE_DEMO_HOST_POLICY).toContain('now we are stepping into simulation mode');
  expect(PHONE_DEMO_HOST_POLICY).toContain('a slow count of 3 in silence');
  expect(PHONE_DEMO_HOST_POLICY).toContain("I'm Aspen — thanks for calling");
  expect(PHONE_DEMO_HOST_POLICY).toContain('20 to 30 second overview of the business built ONLY from the facts the caller stated');
  expect(PHONE_DEMO_HOST_POLICY).toContain('In your live setup I would warm-transfer you right here — in this demo I cannot complete the transfer');
  expect(PHONE_DEMO_HOST_POLICY).toContain('Ask for their genuine reaction first');
  expect(PHONE_DEMO_HOST_POLICY).toContain('did you like it?');
});
