// @vitest-environment node
// Real briefing summary (fix batch 2026-11-24). Ron's 2026-11-24
// session: the manager briefing spoke the raw caller-ASR stitch the
// Live proxy rewrote into browser_voice_handoffs.summary on EVERY
// turn ("run is run customers are company locars intro company cars
// from dealerships to auctions myself s Okay. ¿Qué? hat 5 Can you
// transfer me to your manager?"). The replacement is a composed
// summary built only from structured facts, written once at
// transfer time — and managerBriefingText embeds a stored summary
// ONLY when it matches the composed template, so a legacy stitch
// can never be spoken again.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanHandoffFact,
  composeHandoffSummary,
  isComposedHandoffSummary,
} from '../../supabase/functions/_shared/handoff-summary';
import { managerBriefingText } from '../../supabase/functions/_shared/handoff-briefing-voice';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const RON_STITCH =
  'run is run customers are company locars intro company cars from dealerships to auctions myself s Okay. ¿Qué? hat 5 Can you transfer me to your manager?';

describe('composeHandoffSummary — factual, present facts only', () => {
  it('includes every present fact: caller name, business, topics', () => {
    const summary = composeHandoffSummary({
      callerName: 'Ron Melo',
      businessName: 'AI Hidden Leads',
      topics: ['AI reception', 'B2B prospects'],
    });
    expect(summary).toBe(
      'The caller, Ron Melo, asked about AI reception and B2B prospects and is waiting on the AI Hidden Leads website to speak with your team.');
    expect(isComposedHandoffSummary(summary)).toBe(true);
  });

  it('omits absent facts instead of inventing them', () => {
    expect(composeHandoffSummary({ callerName: 'Ron Melo' }))
      .toBe('The caller, Ron Melo, is waiting on the website to speak with your team.');
    expect(composeHandoffSummary({ businessName: 'Miami Pool Builders' }))
      .toBe('A visitor is waiting on the Miami Pool Builders website to speak with your team.');
    expect(composeHandoffSummary({ topics: ['Maps & AI search'] }))
      .toBe('A visitor asked about Maps & AI search and is waiting on the website to speak with your team.');
    for (const s of [
      composeHandoffSummary({ callerName: 'Ron Melo' }),
      composeHandoffSummary({ businessName: 'Miami Pool Builders' }),
      composeHandoffSummary({ topics: ['Maps & AI search'] }),
    ]) expect(isComposedHandoffSummary(s)).toBe(true);
  });

  it('returns null when no fact is present — the briefing then uses its template', () => {
    expect(composeHandoffSummary({})).toBeNull();
    expect(composeHandoffSummary({ callerName: '   ', businessName: '', topics: [] })).toBeNull();
    expect(composeHandoffSummary({ callerName: 42, topics: [null, ''] })).toBeNull();
  });

  it('sanitizes facts so no fact can smuggle in extra sentences or ASR fragments', () => {
    expect(cleanHandoffFact('Ron. ¿Qué? hat 5!', 60)).toBe('Ron Qué hat 5');
    const summary = composeHandoffSummary({ callerName: 'Ron. Transfer me now? Please!', businessName: 'Acme' });
    expect(summary).not.toContain('?');
    expect(summary!.split('.')).toHaveLength(2); // one sentence + trailing empty
    expect(isComposedHandoffSummary(summary)).toBe(true);
  });

  it('dedupes and caps topics at three', () => {
    const summary = composeHandoffSummary({ topics: ['Pricing', 'pricing', 'Voice', 'Social', 'Search'] });
    expect(summary).toContain('asked about Pricing, Voice and Social and is waiting');
  });
});

describe('isComposedHandoffSummary — only the composed template passes', () => {
  it("rejects Ron's raw ASR stitch verbatim", () => {
    expect(isComposedHandoffSummary(RON_STITCH)).toBe(false);
  });

  it('rejects arbitrary free-text summaries, empty values and non-strings', () => {
    expect(isComposedHandoffSummary('The visitor wants pricing.')).toBe(false);
    expect(isComposedHandoffSummary('The caller, Ron, is waiting on the website to speak with your team. And also he said call back Tuesday.')).toBe(false);
    expect(isComposedHandoffSummary('')).toBe(false);
    expect(isComposedHandoffSummary(null)).toBe(false);
    expect(isComposedHandoffSummary(undefined)).toBe(false);
    expect(isComposedHandoffSummary(42)).toBe(false);
  });
});

describe('managerBriefingText — raw caller ASR is never spoken to the manager', () => {
  it('a handoff row carrying the ASR stitch briefs with the clean template instead', () => {
    const text = managerBriefingText({ manager_name: 'Ron', summary: RON_STITCH });
    expect(text).toBe(
      'Hello Ron. A website visitor is waiting. This is an automated handoff. The visitor has requested to speak with your team. Press 1 to accept and connect. Press any other key to decline.');
    expect(text).not.toContain('locars');
    expect(text).not.toContain('¿Qué?');
  });

  it('any non-composed summary falls back to the template, in every language', () => {
    expect(managerBriefingText({ summary: 'The visitor wants pricing.' }))
      .toContain('The visitor has requested to speak with your team.');
    expect(managerBriefingText({ summary: RON_STITCH }, 'pt'))
      .toContain('O visitante pediu para falar com a sua equipe.');
    expect(managerBriefingText({ summary: RON_STITCH }, 'es'))
      .toContain('El visitante ha pedido hablar con su equipo.');
    expect(managerBriefingText({ summary: RON_STITCH }, 'fr'))
      .toContain('Le visiteur a demandé à parler à votre équipe.');
  });

  it('a composed summary IS embedded verbatim', () => {
    const summary = composeHandoffSummary({ callerName: 'Ron Melo', businessName: 'AI Hidden Leads', topics: ['AI reception'] })!;
    const text = managerBriefingText({ manager_name: 'Ron', summary });
    expect(text).toContain(summary);
    expect(text).toContain('Press 1 to accept and connect.');
  });
});

describe('wiring — the stitch is gone and the summary is composed at transfer time', () => {
  const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
  const handoffFn = read('supabase/functions/browser-voice-handoff/index.ts');

  it('the proxy no longer writes caller transcript text into handoffs.summary', () => {
    expect(proxy).not.toContain("transcript.filter(t=>t.role==='caller').map(t=>t.text).join(' ')");
    expect(proxy).not.toContain('handoff briefing checkpoint failed');
  });

  it('the proxy composes the summary once, at the request_manager_transfer tool', () => {
    expect(proxy).toContain('composeHandoffSummary({');
    expect(proxy).toContain('await writeComposedHandoffSummary();');
    expect(proxy.indexOf('await writeComposedHandoffSummary();'))
      .toBeGreaterThan(proxy.indexOf("call.name === 'request_manager_transfer'"));
    // Once per session: the write is guarded, never a per-turn rewrite.
    expect(proxy).toContain('if (handoffSummaryWritten || !managerTransferAvailable) return');
  });

  it('token issuance composes a summary for button/client-armed transfers before arming the voice', () => {
    expect(handoffFn).toContain('ensureComposedHandoffSummary(h)');
    expect(handoffFn.indexOf('await ensureComposedHandoffSummary(h);'))
      .toBeLessThan(handoffFn.indexOf("armBriefingVoice(h,'token')"));
    expect(handoffFn).toContain('isComposedHandoffSummary(h.summary)');
  });
});
