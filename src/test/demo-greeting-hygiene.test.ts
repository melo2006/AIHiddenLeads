// Demo-site greeting hygiene (2026-11-12 late) — regression tests for
// the defect in Ron's live retest of the Scalone batch, proven by the
// Supabase row pull of demo-site session 96d54121 (entryPath
// /demo-site, business Michael Martinez Group, exampleListings
// michael-martinez, config.timeZone America/New_York, created
// 2026-11-13 02:30 UTC = 21:30 EST):
//
//   visitorContact = {"name":"CRM Prospect","email":"","phone":""}
//   opening AS SPOKEN = "Good morning, CRM Prospect. I am Aspen from
//   AI Hidden Leads — welcome, and thanks for trying the demo I built
//   for Michael Martinez Group…"
//
// BOTH Scalone hygiene rules failed on this path. Root cause:
// openingFor() returns a picked rotation variant VERBATIM (pinned —
// the homepage/realtor rotations are placeholder-free prose), but the
// DEMO-SITE variants are TEMPLATES whose heads carry {timeGreeting} /
// {visitorFirstName} / {agentName} / {businessName}. The stored
// config.opening was the bare template (944 chars), so the model
// improvised the substitution at speak time from the raw visitorContact
// in its system prompt and its own UTC sense of the hour. The fix
// renders the picked demo-parent opening server-side in gemini-session
// (renderOpeningTemplate — the same vars greeting() uses), with the
// sanitized name and the configured-zone hour, and sanitizes the
// stored visitorContact name so no surface of the session carries the
// placeholder. The tests below rebuild the proof row's shape and run
// the exact composition gemini-session runs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_SITE_GREETING_VARIANTS,
  SIMULATION_GREETING_LEGACY_SLIM,
  businessDemoConfig,
  greeting,
  hourInTimeZone,
  openingFor,
  renderOpeningTemplate,
  sanitizeVisitorName,
  timeGreeting,
} from '../../supabase/functions/_shared/voice-config';
import {
  DEMO_INVITE_GREETING_VARIANTS,
  DEMO_VERIFICATION_GREETING,
} from '../../supabase/functions/_shared/demo-sales';

const read = (rel: string) =>
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', rel), 'utf8');
const sessionSource = read('supabase/functions/gemini-session/index.ts');

/** The demo-parent final assembly, composed exactly as gemini-session
 *  composes it for a lead/prospect (non-segment) authorization:
 *  greetingHour from the session's configured zone, greetingName =
 *  sanitize(visitorName || visitorContact.name) with the
 *  visitorContact name itself already sanitized at the lead read, and
 *  the picked opening rendered through renderOpeningTemplate. */
function demoParentOpening(opts: {
  businessName: string;
  visitorName: string;
  leadFullName: string;
  at: Date;
  timeZone: string;
  identity?: Record<string, unknown>;
  greetingsOverride?: string[];
}) {
  const config = businessDemoConfig(opts.businessName, 'website knowledge', opts.identity) as Record<string, unknown>;
  if (opts.greetingsOverride) config.greetings = opts.greetingsOverride;
  // The lead read in gemini-session, post-fix:
  const visitorContact = { name: sanitizeVisitorName(opts.leadFullName), email: '', phone: '' };
  const greetingHour = hourInTimeZone(opts.at, opts.timeZone);
  const greetingName = sanitizeVisitorName(opts.visitorName || visitorContact.name || '');
  const picked = openingFor(config, greetingHour, greetingName);
  return {
    config,
    visitorContact,
    greetingHour,
    greetingName,
    picked,
    opening: renderOpeningTemplate(picked, config, greetingHour, greetingName),
  };
}

describe('the proof row shape — session 96d54121 rebuilt', () => {
  // 2026-11-13 02:30 UTC = 21:30 EST (America/New_York), the moment of
  // Ron's retest. No callerName arrived on the parent authorization;
  // the lead row's full_name is the literal placeholder /demo creates.
  const at = new Date('2026-11-13T02:30:00Z');

  it('the ingredients: zone hour is 21 (evening), the placeholder is NO name', () => {
    expect(hourInTimeZone(at, 'America/New_York')).toBe(21);
    expect(timeGreeting(21)).toBe('Good evening');
    expect(sanitizeVisitorName('CRM Prospect')).toBe('');
  });

  it('the defect, documented: openingFor alone serves the bare template', () => {
    const r = demoParentOpening({ businessName: 'Michael Martinez Group', visitorName: '', leadFullName: 'CRM Prospect', at, timeZone: 'America/New_York' });
    // What gemini-session stored BEFORE this fix — the model was left
    // to improvise {timeGreeting} and {visitorFirstName} at speak time.
    expect(r.picked).toContain('{timeGreeting}');
    expect(r.picked).toContain('{visitorFirstName}');
    expect(r.greetingName).toBe('');
    expect(r.visitorContact.name).toBe('');
  });

  it('every rotation variant renders hygienic: no placeholder name, no morning, no braces left', () => {
    const random = vi.spyOn(Math, 'random');
    try {
      DEMO_SITE_GREETING_VARIANTS.forEach((variant, i) => {
        random.mockReturnValue(i / DEMO_SITE_GREETING_VARIANTS.length);
        const r = demoParentOpening({ businessName: 'Michael Martinez Group', visitorName: '', leadFullName: 'CRM Prospect', at, timeZone: 'America/New_York' });
        expect(r.picked).toBe(variant);
        expect(r.opening).not.toContain('CRM');
        expect(r.opening).not.toContain('Good morning');
        expect(r.opening).not.toContain('{');
        expect(r.opening).toContain('Good evening, welcome.');
        expect(r.opening).toContain('I am Aspen from AI Hidden Leads');
        expect(r.opening).toContain('thanks for trying the demo I built for Michael Martinez Group');
      });
    } finally {
      random.mockRestore();
    }
  });

  it('the stored visitorContact can no longer offer the model a placeholder name', () => {
    const r = demoParentOpening({ businessName: 'Michael Martinez Group', visitorName: '', leadFullName: 'CRM Prospect', at, timeZone: 'America/New_York' });
    expect(JSON.stringify(r.visitorContact)).not.toContain('CRM');
  });
});

describe('the morning control — a real name at a morning hour still greets by name', () => {
  // 2026-11-13 14:30 UTC = 09:30 EST: morning in the configured zone.
  const at = new Date('2026-11-13T14:30:00Z');

  it('good morning + the visitor’s first name, from the callerName channel', () => {
    const r = demoParentOpening({ businessName: 'Michael Martinez Group', visitorName: 'John Doe', leadFullName: 'CRM Prospect', at, timeZone: 'America/New_York' });
    expect(r.greetingHour).toBe(9);
    expect(r.greetingName).toBe('John Doe');
    expect(r.opening).toContain('Good morning, John.');
    expect(r.opening).not.toContain('CRM');
    expect(r.opening).not.toContain('{');
  });

  it('a real lead name (form submitter) is used when no callerName arrives', () => {
    const r = demoParentOpening({ businessName: 'Michael Martinez Group', visitorName: '', leadFullName: 'Maria Garcia', at, timeZone: 'America/New_York' });
    expect(r.greetingName).toBe('Maria Garcia');
    expect(r.opening).toContain('Good morning, Maria.');
    // The stored contact keeps the real name too — one visitor, one name.
    expect(r.visitorContact.name).toBe('Maria Garcia');
  });
});

describe('the other demo-parent opening shapes', () => {
  const at = new Date('2026-11-13T02:30:00Z');

  it('invite variants render too — {nameConfirm} resolves, never leaks a placeholder', () => {
    const anon = demoParentOpening({ businessName: 'Michael Martinez Group', visitorName: '', leadFullName: 'CRM Prospect', at, timeZone: 'America/New_York', greetingsOverride: [...DEMO_INVITE_GREETING_VARIANTS] });
    expect(anon.opening).not.toContain('{');
    expect(anon.opening).not.toContain('CRM');
    expect(anon.opening).toContain('Good evening, welcome.');
    expect(anon.opening).toContain('And by the way, what is your name?');
    const named = demoParentOpening({ businessName: 'Michael Martinez Group', visitorName: 'John Doe', leadFullName: 'CRM Prospect', at, timeZone: 'America/New_York', greetingsOverride: [...DEMO_INVITE_GREETING_VARIANTS] });
    expect(named.opening).toContain('Good evening, John.');
    expect(named.opening).toContain('And just to check, is your name John?');
  });

  it('snapshot-supplied simulationGreetings render the same way', () => {
    const r = demoParentOpening({
      businessName: 'Michael Martinez Group', visitorName: '', leadFullName: 'CRM Prospect', at, timeZone: 'America/New_York',
      identity: { simulationGreetings: ['{timeGreeting}, {visitorFirstName}. Custom snapshot greeting for {businessName}.'] },
    });
    expect(r.opening).toBe('Good evening, welcome. Custom snapshot greeting for Michael Martinez Group.');
  });

  it('shapes that already pass through greeting() are a render no-op', () => {
    const cfg = { name: 'Aspen', businessName: 'Michael Martinez Group', greeting: SIMULATION_GREETING_LEGACY_SLIM };
    const viaGreeting = greeting(cfg, 21, 'CRM Prospect');
    expect(viaGreeting).not.toContain('{');
    expect(renderOpeningTemplate(viaGreeting, cfg, 21, '')).toBe(viaGreeting);
    const verificationCfg = { name: 'Aspen', businessName: 'Michael Martinez Group', greeting: DEMO_VERIFICATION_GREETING };
    const verification = greeting(verificationCfg, 21, 'CRM Prospect');
    expect(verification).not.toContain('CRM');
    expect(renderOpeningTemplate(verification, verificationCfg, 21, '')).toBe(verification);
  });
});

describe('scoping — the render lives in the demo-parent gate only', () => {
  it('openingFor itself is unchanged: it still serves variants verbatim', () => {
    // The shared picker is pinned raw by the homepage/realtor suites;
    // this fix must not move the render into it.
    const cfg = businessDemoConfig('Michael Martinez Group', 'website knowledge') as Record<string, unknown>;
    expect(openingFor(cfg, 21, '')).toContain('{timeGreeting}');
  });

  it('gemini-session applies the render only to non-segment demo parents', () => {
    expect(sessionSource).toContain('if(!segmentParentId && (b.leadId || b.prospectId)) {');
    expect(sessionSource).toContain('config.opening=renderOpeningTemplate(config.opening,config,greetingHour,greetingName);');
    // The assembly keeps its pinned shape ahead of the render step.
    expect(sessionSource).toContain('opening:openingFor(config,greetingHour,greetingName)');
  });

  it('gemini-session sanitizes the lead name into the stored visitorContact', () => {
    expect(sessionSource).toContain('visitorContact={name:sanitizeVisitorName(lead.full_name)');
  });
});
