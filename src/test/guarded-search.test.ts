// @vitest-environment node
// GUARDED WEB SEARCH (owner-approved 2026-11-21) — Gemini Live Google
// Search grounding for the public browser voice sessions, sales AND
// simulation, each with its own guardrails (see
// supabase/functions/_shared/guarded-search.ts).
//
// Ron's direction: everywhere the avatar talks to the public she may
// answer a small outside-world aside like a person — one or two
// sentences, friendly — then come back to the point, briefly, so she
// doesn't burn minutes on long off-topic conversations. Sales bridges
// back to the demo/offer; in simulation she stays the business's
// receptionist, bridges back to the caller's need, and never pitches
// AI Hidden Leads off an aside.
//
// Split like the booking gate's tests:
//  - MECHANICAL: _shared/guarded-search.ts — the mode resolver, the
//    two policy texts and the setup tools entries, pure functions of
//    the stored session config (the same homepageSales / simulation
//    stamps gemini-session already writes and the sales gate keys on).
//  - WIRING: the proxy composes the Live setup, and the Deno function
//    cannot be imported under vitest, so the wiring is source-pinned
//    here: the import, the guardrail block appended to the system
//    instruction, and the grounding entry spread into the setup tools
//    beside the untouched functionDeclarations.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GUARDED_SEARCH_SALES_POLICY,
  GUARDED_SEARCH_SIMULATION_POLICY,
  guardedSearchModeFor,
  guardedSearchPolicyFor,
  guardedSearchToolEntriesFor,
} from '../../supabase/functions/_shared/guarded-search';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('guarded search — mode resolution from the stored config stamps', () => {
  it('homepage sales sessions are sales mode', () => {
    expect(guardedSearchModeFor({ homepageSales: true })).toBe('sales');
    expect(guardedSearchModeFor({ homepageSales: true, simulation: false })).toBe('sales');
    // The /demo explainer parent: homepage agent + team-intro stamp.
    expect(guardedSearchModeFor({ homepageSales: true, teamIntroEnabled: true })).toBe('sales');
  });

  it('business-demo parents and their segments are simulation mode', () => {
    expect(guardedSearchModeFor({ simulation: true })).toBe('simulation');
    // Presenter demo parent (Frank solo): simulation + presenter stamp.
    expect(guardedSearchModeFor({ simulation: true, demoPresenter: 'frank', platformFollowup: true })).toBe('simulation');
    // A persona segment under a simulation parent.
    expect(guardedSearchModeFor({ simulation: true, homepageSales: false, personaSegment: { persona: 'sara', boundary: 'doorway' } })).toBe('simulation');
  });

  it('simulation wins when both stamps are present (proxy precedence: the sales gate requires simulation !== true)', () => {
    expect(guardedSearchModeFor({ homepageSales: true, simulation: true })).toBe('simulation');
  });

  it('everything else stays ungrounded', () => {
    // Tenant live agent (published snapshot: neither stamp).
    expect(guardedSearchModeFor({})).toBeNull();
    expect(guardedSearchModeFor({ businessName: 'Some Tenant' })).toBeNull();
    // Alex guide + team-intro cameo segment shapes carry both stamps false.
    expect(guardedSearchModeFor({ homepageSales: false, simulation: false, platformGuide: true })).toBeNull();
    expect(guardedSearchModeFor({ homepageSales: false, simulation: false, teamIntroSegment: true })).toBeNull();
    // Draft / preview / share shapes earn nothing on their own.
    expect(guardedSearchModeFor({ preview: true })).toBeNull();
    expect(guardedSearchModeFor({ sharedDemo: true })).toBeNull();
  });
});

describe('guarded search — grounding tool in the composed setup', () => {
  it('sales mode adds exactly the clean-room-proven googleSearch entry', () => {
    expect(guardedSearchToolEntriesFor({ homepageSales: true })).toEqual([{ googleSearch: {} }]);
  });

  it('simulation mode adds the same entry', () => {
    expect(guardedSearchToolEntriesFor({ simulation: true })).toEqual([{ googleSearch: {} }]);
  });

  it('ungrounded sessions add nothing — their setup tools stay the single functionDeclarations entry', () => {
    expect(guardedSearchToolEntriesFor({})).toEqual([]);
    expect(guardedSearchToolEntriesFor({ homepageSales: false, simulation: false })).toEqual([]);
  });
});

describe('guarded search — sales guardrails', () => {
  it('the sales policy is served for sales sessions only', () => {
    expect(guardedSearchPolicyFor({ homepageSales: true })).toBe(GUARDED_SEARCH_SALES_POLICY);
    expect(guardedSearchPolicyFor({})).toBe('');
  });

  it('knowledge wins, brief answer, bridge back to the demo, no errands, never invent, few searches', () => {
    const p = GUARDED_SEARCH_SALES_POLICY;
    expect(p).toContain('ALWAYS wins');
    expect(p).toContain('never let a search result change, correct or override it');
    expect(p).toContain('one or two sentences');
    expect(p).toContain('bridge straight back to the demo and the offer');
    expect(p).toContain('Never run research errands');
    expect(p).toContain('never invent an answer');
    expect(p).toContain('a few searches in the whole conversation');
    // The sales block never borrows the receptionist framing.
    expect(p).not.toContain('receptionist');
  });
});

describe('guarded search — simulation guardrails', () => {
  it('the simulation policy is served for simulation sessions only', () => {
    expect(guardedSearchPolicyFor({ simulation: true })).toBe(GUARDED_SEARCH_SIMULATION_POLICY);
    expect(guardedSearchPolicyFor({ homepageSales: true })).not.toBe(GUARDED_SEARCH_SIMULATION_POLICY);
  });

  it('the business fed knowledge wins absolutely — a disagreeing search result is dropped silently', () => {
    const p = GUARDED_SEARCH_SIMULATION_POLICY;
    expect(p).toContain('ALWAYS wins');
    expect(p).toContain("the business's hours, services, prices or policies");
    expect(p).toContain('use what you were given and do not mention the difference');
  });

  it('bridges back to the caller need and NEVER to selling AI Hidden Leads', () => {
    const p = GUARDED_SEARCH_SIMULATION_POLICY;
    expect(p).toContain("come back to the caller's need");
    expect(p).toContain('never use an aside to talk about or sell AI Hidden Leads');
    expect(p).toContain("You are this business's receptionist");
    expect(p).toContain('one or two sentences');
    expect(p).toContain('No research errands');
    expect(p).toContain('never invent an answer');
    expect(p).toContain('a few searches in the whole conversation');
    // The simulation block never carries the sales bridge.
    expect(p).not.toContain('bridge straight back to the demo');
  });
});

describe('guarded search — proxy wiring (source-pinned; the Deno function cannot run under vitest)', () => {
  const proxy = read('supabase/functions/gemini-live-proxy/index.ts');

  it('the proxy imports the shared guarded-search module', () => {
    expect(proxy).toContain("from '../_shared/guarded-search.ts'");
    expect(proxy).toContain('guardedSearchPolicyFor');
    expect(proxy).toContain('guardedSearchToolEntriesFor');
  });

  it('the guardrail block rides the prompt right after the mode policy slot, and the pinned setup suffix is untouched', () => {
    expect(proxy).toContain('const guardedSearchBlock = guardedSearchPolicy ? `\\n${guardedSearchPolicy}` : \'\'');
    expect(proxy).toContain("SALES_ACTION_POLICY : ''}${guardedSearchBlock}${config.homepageSales === true ? `\\n${HOMEPAGE_OPENING_PRIORITY}` : ''}");
    // The transfer/overage suffix keeps its exact pre-change shape.
    expect(proxy).toContain('${managerTransferBlock}${overageBlock}` }] }');
  });

  it('the grounding entry is spread into the setup tools beside the functionDeclarations entry', () => {
    expect(proxy).toContain('...guardedSearchToolEntriesFor(config)');
    // The existing function declarations are still there, unchanged.
    expect(proxy).toContain("tools:[{functionDeclarations:[");
    expect(proxy).toContain("{name:'select_conversation_language'");
    expect(proxy).toContain("{name:'book_call'");
    expect(proxy).toContain("{name:'lookup_business_detail'");
  });

  it('the mint is untouched — the gate lives in the proxy, keyed on the stamps gemini-session already writes', () => {
    const mint = read('supabase/functions/gemini-session/index.ts');
    expect(mint).not.toContain('guarded-search');
    expect(mint).not.toContain('googleSearch');
    expect(proxy).not.toContain('google_search');
  });
});
