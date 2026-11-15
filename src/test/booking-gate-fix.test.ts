// @vitest-environment node
// Booking-gate fix (2026-11-14) — Publish #54 server trio, fixes 1+3.
//
// Live session 19b82691 proved the divergence: gemini-session built
// the homepage session config from the agent's published snapshot,
// which never carried platformFollowup, so the proxy withheld ALL
// platform booking tools (they are gated on
// config.platformFollowup && !preview) — while the PLATFORM BOOKING
// POLICY + slot-offer method were injected into the system
// instruction UNCONDITIONALLY. Aspen was told she could book, held
// no tools, and deflected a booking ask to the /book page. The same
// session quoted the dead Nov 9 launch promotion, purged from the
// stored snapshots by migration 20261115010000.
//
// Fix shape: (a) gemini-session stamps platformFollowup:true
// code-side for the aspen-homepage agent path only; (b) the booking
// instruction text now comes from platformBookingInstruction()
// (_shared/phone-demo.ts), gated on the SAME condition as the tools,
// byte-identical when the gate is on. The proxy wiring is
// source-pinned (the Deno function cannot be imported under vitest),
// the helper behavior is unit-tested directly.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { platformBookingInstruction } from '../../supabase/functions/_shared/phone-demo';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('platformBookingInstruction — the gate matrix', () => {
  it('returns the booking instruction ONLY for platformFollowup && !preview', () => {
    expect(platformBookingInstruction(true, false)).not.toBe('');
    expect(platformBookingInstruction(true, true)).toBe('');
    expect(platformBookingInstruction(false, false)).toBe('');
    expect(platformBookingInstruction(undefined, false)).toBe('');
    expect(platformBookingInstruction(null, false)).toBe('');
    // Truthiness-based, exactly like the tools gate it mirrors
    // (config.platformFollowup && !preview): any truthy stamp earns
    // the text, any falsy one withholds it.
    expect(platformBookingInstruction(1, false)).not.toBe('');
  });

  it('when on, carries the scope note, the booking policy and the slot-offer method with the website path filled in', () => {
    const text = platformBookingInstruction(true, false);
    expect(text.startsWith(' Platform follow-up tools, if supplied, act only for AI Hidden Leads, not this demo business.')).toBe(true);
    expect(text).toContain('PLATFORM BOOKING POLICY (overrides older booking instructions)');
    expect(text).toContain('Would you have 15 to 20 minutes for a quick introductory meeting');
    expect(text).toContain('BOOKING THE IMPLEMENTATION CALL — RON\'S SLOT-OFFER METHOD');
    expect(text).toContain('Ask the visitor to confirm the exact slot on screen (request_platform_appointment)');
    expect(text).not.toContain('[path]');
  });
});

describe('proxy wiring — tools and policy share one gate', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('all eight platform tools stay declared under the platformFollowup && !preview gate', () => {
    expect(src).toContain('...(config.platformFollowup && !preview ? [');
    for (const tool of ['request_conversation_copy', 'recommend_plan', 'platform_availability', 'request_platform_followup', 'request_platform_appointment', 'get_availability', 'check_time', 'book_call']) {
      expect(src).toContain(`{name:'${tool}'`);
      expect(src.indexOf(`{name:'${tool}'`)).toBeGreaterThan(src.indexOf('...(config.platformFollowup && !preview ? ['));
    }
  });

  it('the setup instruction takes the booking text from the gated helper, never inline', () => {
    expect(src).toContain("import { platformBookingInstruction } from '../_shared/phone-demo.ts'");
    expect(src).toContain('${platformBookingInstruction(config.platformFollowup, preview)}${managerTransferBlock}${overageBlock}');
    // The policy text lives in the helper only — no second, ungated copy.
    expect(occurrences(src, 'PLATFORM BOOKING POLICY')).toBe(0);
    expect(occurrences(src, 'ASPEN_SLOT_OFFER_METHOD')).toBe(0);
  });

  it('the dispatch rejection for non-platform sessions stays intact', () => {
    expect(src).toContain("} else if (!config.platformFollowup || preview) { respond({error:'Action unavailable.'});");
  });
});

describe('gemini-session wiring — the homepage stamp', () => {
  const src = read('supabase/functions/gemini-session/index.ts');

  it('the agent path stamps platformFollowup:true for the aspen-homepage agent ONLY', () => {
    expect(src).toContain("homepageSales:agent.slug==='aspen-homepage', ...(agent.slug==='aspen-homepage' ? {platformFollowup:true} : {})");
  });

  it('platformFollowup:true is stamped in exactly two places: the business-demo path and the homepage conditional', () => {
    expect(occurrences(src, 'platformFollowup:true')).toBe(2);
    expect(src).toContain('visitorContact, platformFollowup:true}');
  });

  it('segment and intro configs still force platformFollowup off or inherit it from a simulation parent only', () => {
    expect(src).toContain('platformFollowup:false,\n        platformGuide:false,\n        homepageSales:false,\n        teamIntroEnabled:true,');
    expect(src).toContain('platformFollowup:parent.platformFollowup===true,');
  });
});

describe('migration 20261115010000 — the stale-promotion purge', () => {
  const sql = read('supabase/migrations/20261115010000_homepage_permanent_pricing_fix.sql');

  it('targets only the homepage agent row, both snapshots, knowledge + systemPrompt', () => {
    expect(sql).toContain("WHERE slug = 'aspen-homepage'");
    expect(sql).toContain('published->>pair.field');
    expect(sql).toContain('draft->>pair.field');
    expect(sql).toContain("'knowledge'");
    expect(sql).toContain("'systemPrompt'");
  });

  it('replaces the launch promotion with the permanent-pricing wording', () => {
    expect(sql).toContain('Launch promotion: 50% off every plan for the first 3 months');
    expect(sql).toContain('Current offers: the plan prices are permanent — there is no introductory discount and no price step-up, ever.');
    expect(sql).toContain('WAIVED FREE through the end of the month');
    expect(sql).toContain('These are the permanent prices — there is no introductory discount and the price never steps up.');
    expect(sql).toContain('the setup fee is waived through the end of the month; never quote a calendar date for any offer.');
  });

  it('is replace()-based (no-op when a stale string is absent) and reports leftovers instead of failing', () => {
    expect(sql).toContain('replace(published->>pair.field, pair.stale, pair.replacement)');
    expect(sql).toContain('RAISE NOTICE');
    expect(sql).not.toContain('RAISE EXCEPTION');
  });
});
