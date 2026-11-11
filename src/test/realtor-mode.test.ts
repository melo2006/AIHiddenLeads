// Realtor mode — the realtor conversation layer (owner-directed
// 2026-11-11: "The questions to an R.E. agent should be different than
// to a regular business. We need to ask and talk their lingo.").
//
// The greeting rotation changed only the OPENING of a realtor-landing
// session; the conversation after it still ran the generic homepage
// discovery. Coverage here:
//  - the layer's content: the never-ask-what-they-do rule, the realtor
//    lingo, Ron's qualification angles (solo vs team, closings in the
//    last 6 months, listings vs buyers, farm areas, call sources, the
//    showing/closing missed-call question) and the answer→help mapping
//    anchors (answering, Maps + AI search, sphere revival, speed-to-
//    lead, social, reputation, website) with the pricing anchors
//  - the stamp mechanism: stampRealtorLanding gives a fresh
//    /agents/realtors authorization BOTH the greeting rotation and the
//    layer (layer appended to the system prompt — the instructions
//    channel — while knowledge/reference data stays untouched)
//  - reconnect retention: a re-authorization builds a fresh snapshot
//    config and re-applies the stamp, so the layer lands exactly once;
//    re-applying to an already-stamped config never stacks it
//  - absence: the shared homepage prompt constant carries no layer, so
//    unstamped sessions stay byte-identical; gemini-session calls the
//    stamp only under the slug + entryPath condition (with the
//    reachability fix: no !b.agentId term — the public widget addresses
//    the homepage agent by its resolved public id, so every genuine
//    widget session is agentId-addressed and the old term silently
//    disabled the stamp in production)
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_GREETING,
  HOMEPAGE_KNOWLEDGE,
  HOMEPAGE_SALES_PROMPT,
  REALTOR_CONVERSATION_LAYER,
  REALTOR_GREETING_VARIANTS,
  stampRealtorLanding,
} from '../../supabase/functions/_shared/homepage-knowledge';
import { openingFor } from '../../supabase/functions/_shared/voice-config';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

// A realistic published-snapshot config, shaped the way the homepage
// branch of gemini-session assembles it before any stamp.
const snapshotConfig = () => ({
  name: 'Aspen',
  businessName: 'AI Hidden Leads',
  systemPrompt: HOMEPAGE_SALES_PROMPT,
  greeting: HOMEPAGE_GREETING,
  greetings: [HOMEPAGE_GREETING],
  knowledge: HOMEPAGE_KNOWLEDGE,
  homepageSales: true,
});

describe('the realtor conversation layer — identity and the never-ask rule', () => {
  it('frames the visitor as a real estate professional and supersedes generic discovery', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('REALTOR SESSION LAYER');
    expect(REALTOR_CONVERSATION_LAYER).toContain('real estate agent, a broker, or a team leader');
    expect(REALTOR_CONVERSATION_LAYER).toContain('supersedes the generic discovery');
    expect(REALTOR_CONVERSATION_LAYER).toContain('never ask what they do');
    expect(REALTOR_CONVERSATION_LAYER).toContain('what business or industry they are in');
    expect(REALTOR_CONVERSATION_LAYER).toContain('how can I help you?');
  });

  it('speaks the lingo', () => {
    for (const term of ['listings', 'buyers', 'sellers', 'showings', 'closings', 'under contract', 'brokerage', 'team', 'farm area', 'sphere', 'yard signs', 'Zillow', 'Realtor.com', 'open houses', 'lockboxes', 'price points']) {
      expect(REALTOR_CONVERSATION_LAYER).toContain(term);
    }
  });
});

describe('the realtor conversation layer — qualification angles', () => {
  it('asks solo vs team / agents under them at a brokerage', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('solo agent');
    expect(REALTOR_CONVERSATION_LAYER).toContain('run a team');
    expect(REALTOR_CONVERSATION_LAYER).toContain('agents under them at their brokerage');
  });

  it('asks closings volume over the last 6 months', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('how many closings');
    expect(REALTOR_CONVERSATION_LAYER).toContain('last 6 months');
  });

  it('asks listings (sellers) vs buyers mix', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('mostly work listings (sellers) or buyers');
  });

  it('asks which areas they farm and where calls come from', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('Which areas do they farm');
    expect(REALTOR_CONVERSATION_LAYER).toContain('yard signs, the portals, referrals, open houses');
  });

  it('asks what happens to a call during a showing or closing — conversationally, not an interrogation', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('at a showing or a closing, what happens to that call today');
    expect(REALTOR_CONVERSATION_LAYER).toContain('never as an interrogation');
    expect(REALTOR_CONVERSATION_LAYER).toContain('never more than one question per reply');
  });
});

describe('the realtor conversation layer — answers mapped to help', () => {
  it('missed calls map to the 24/7 answering core offer', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('you answer 24/7 in seconds');
    expect(REALTOR_CONVERSATION_LAYER).toContain('book the showing on their calendar');
    expect(REALTOR_CONVERSATION_LAYER).toContain('warm-transfer a hot lead straight to their phone');
  });

  it('growth maps to Google Maps + AI search and sphere revival — never the B2B prospect lists', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('do not pitch the B2B prospect lists');
    expect(REALTOR_CONVERSATION_LAYER).toContain('better Google Maps ranking');
    expect(REALTOR_CONVERSATION_LAYER).toContain('Gemini, Claude and ChatGPT');
    expect(REALTOR_CONVERSATION_LAYER).toContain('sphere and past-client database');
    expect(REALTOR_CONVERSATION_LAYER).toContain('$299');
    expect(REALTOR_CONVERSATION_LAYER).toContain('$499');
  });

  it('cold portal leads map to speed-to-lead follow-up', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('speed-to-lead follow-up');
    expect(REALTOR_CONVERSATION_LAYER).toContain('first agent to answer wins the client');
  });

  it('no time to post maps to social creation + management; reviews and a dated site map to their offers', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('social media management');
    expect(REALTOR_CONVERSATION_LAYER).toContain('we create the content, publish it, and answer comments');
    expect(REALTOR_CONVERSATION_LAYER).toContain('reputation management');
    expect(REALTOR_CONVERSATION_LAYER).toContain('website revamp');
  });

  it('keeps the pricing anchors: $99 / 400 minutes core, $79 avatar as a separate add-on', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('Premium is $99 a month with 400 minutes included');
    expect(REALTOR_CONVERSATION_LAYER).toContain('separate optional add-on at $79 a month');
    expect(REALTOR_CONVERSATION_LAYER).toContain('never present the plan as its price plus the add-on');
  });

  it('keeps the standard session behaviors and honesty rules', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('free live demo on their own website');
    expect(REALTOR_CONVERSATION_LAYER).toContain('capturing their name, email and phone');
    expect(REALTOR_CONVERSATION_LAYER).toContain('never invent facts about their business');
    expect(REALTOR_CONVERSATION_LAYER).toContain('never claim we only serve realtors');
  });

  it('one thread at a time — never a menu recital', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('ONE THREAD AT A TIME, NEVER A MENU RECITAL');
  });
});

describe('the stamp — a fresh /agents/realtors authorization carries greeting AND layer', () => {
  it('stamps the flag, swaps the rotation and appends the layer to the system prompt', () => {
    const config = stampRealtorLanding(snapshotConfig());
    expect(config.realtorLanding).toBe(true);
    expect(config.greeting).toBe(REALTOR_GREETING_VARIANTS[0]);
    expect(config.greetings).toEqual([...REALTOR_GREETING_VARIANTS]);
    expect(config.systemPrompt.startsWith(HOMEPAGE_SALES_PROMPT)).toBe(true);
    expect(config.systemPrompt.endsWith(REALTOR_CONVERSATION_LAYER)).toBe(true);
    expect(occurrences(config.systemPrompt, 'REALTOR SESSION LAYER')).toBe(1);
  });

  it('the stamped config still rotates the realtor greetings through openingFor', () => {
    const config = stampRealtorLanding(snapshotConfig());
    for (let i = 0; i < 100; i++) {
      expect(REALTOR_GREETING_VARIANTS).toContain(openingFor(config, 10));
    }
  });

  it('the layer rides the instructions channel only — knowledge/reference data is untouched', () => {
    const config = stampRealtorLanding(snapshotConfig());
    expect(config.knowledge).toBe(HOMEPAGE_KNOWLEDGE);
    expect(config.knowledge).not.toContain('REALTOR SESSION LAYER');
  });
});

describe('the stamp — reconnect/resume retention', () => {
  it('a re-authorization (fresh snapshot config, as a reconnect builds) carries the layer exactly once', () => {
    // A reconnect re-enters the homepage branch and rebuilds the config
    // from the stored snapshot; the stamp re-applies to that clean
    // config. Simulate exactly that second authorization:
    const reconnected = stampRealtorLanding(snapshotConfig());
    expect(reconnected.realtorLanding).toBe(true);
    expect(occurrences(reconnected.systemPrompt, 'REALTOR SESSION LAYER')).toBe(1);
    expect(reconnected.greetings).toEqual([...REALTOR_GREETING_VARIANTS]);
  });

  it('re-applying the stamp to an already-stamped config never stacks the layer', () => {
    const config = stampRealtorLanding(snapshotConfig());
    const again = stampRealtorLanding(config);
    expect(occurrences(again.systemPrompt, 'REALTOR SESSION LAYER')).toBe(1);
    expect(again.systemPrompt.endsWith(REALTOR_CONVERSATION_LAYER)).toBe(true);
  });
});

describe('absence — non-realtor sessions stay byte-identical', () => {
  it('the shared homepage prompt constant carries no realtor layer', () => {
    expect(HOMEPAGE_SALES_PROMPT).not.toContain('REALTOR SESSION LAYER');
    expect(HOMEPAGE_KNOWLEDGE).not.toContain('REALTOR SESSION LAYER');
  });

  it('an unstamped snapshot config has no layer and resolves the standard greeting', () => {
    const config = snapshotConfig();
    expect(config.systemPrompt).toBe(HOMEPAGE_SALES_PROMPT);
    expect(openingFor(config, 10)).toBe(HOMEPAGE_GREETING);
    expect(REALTOR_GREETING_VARIANTS).not.toContain(openingFor(config, 10));
  });

  it('gemini-session applies the stamp only under the slug + entryPath condition, before opening assembly', () => {
    const src = read('supabase/functions/gemini-session/index.ts');
    expect(occurrences(src, 'stampRealtorLanding(config);')).toBe(1);
    const conditionAt = src.indexOf("if(agent.slug==='aspen-homepage' && b.campaign?.entryPath==='/agents/realtors')");
    const callAt = src.indexOf('stampRealtorLanding(config);');
    const assemblyAt = src.indexOf('opening:openingFor(');
    expect(conditionAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(conditionAt);
    expect(assemblyAt).toBeGreaterThan(callAt);
  });

  it('the reachability fix holds: the realtor condition carries no !b.agentId term', () => {
    const src = read('supabase/functions/gemini-session/index.ts');
    expect(src).not.toContain("!b.agentId && agent.slug==='aspen-homepage' && b.campaign?.entryPath==='/agents/realtors'");
    expect(src).not.toContain("teamIntroOn && !b.agentId && agent.slug==='aspen-homepage' && b.campaign?.entryPath==='/agents/realtors'");
  });

  it('the client channel facts behind the fix: the widget addresses the homepage agent by its resolved public id', () => {
    // voice-agent-public returns the homepage agent row id for the
    // no-agentId lookup, and GeminiAgentWidget passes identity.id into
    // GeminiConversation — the production request shape that made the
    // old !b.agentId condition unreachable.
    const pub = read('supabase/functions/voice-agent-public/index.ts');
    expect(pub).toContain("query.eq('slug','aspen-homepage')");
    expect(pub).toContain('id:agent.id');
    const widget = read('src/components/GeminiAgentWidget.tsx');
    expect(widget).toContain('agentId={isGuide ? undefined : identity.id || agentId}');
    const template = read('src/components/landing/AgentLandingTemplate.tsx');
    expect(template).toContain('<GeminiAgentWidget floating />');
  });
});
