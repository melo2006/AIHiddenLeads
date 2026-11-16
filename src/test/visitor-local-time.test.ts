import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { visitorLocalTimeLine } from '../../supabase/functions/_shared/voice-config';

// Visitor local time line (2026-11-16): model-composed greetings only
// ever saw the zone NAME and guessed the time of day — "Good
// afternoon" at 9:02 AM Eastern on two runs, "Good morning" on a
// third. The proxy now states the visitor's current local time as a
// fact in the system instruction. 2026-11-16T14:22:00Z is Monday
// 9:22 AM in America/New_York and 2:22 PM in UTC.
const AT = new Date('2026-11-16T14:22:00.000Z');

describe('visitorLocalTimeLine', () => {
  it('states the New York morning for a 14:22 UTC instant', () => {
    const line = visitorLocalTimeLine(AT, 'America/New_York');
    expect(line).toContain('Visitor local time:');
    expect(line).toContain('9:22 AM');
    expect(line).toContain('Monday, November 16, 2026');
    expect(line).toContain('(America/New_York)');
    expect(line).toContain('morning before 12:00');
  });

  it('states the UTC afternoon for the same instant with no zone', () => {
    const line = visitorLocalTimeLine(AT, undefined);
    expect(line).toContain('2:22 PM');
    expect(line).toContain('(UTC)');
  });

  it('returns an empty line for an unusable zone', () => {
    expect(visitorLocalTimeLine(AT, 'Not/AZone')).toBe('');
  });

  it('the proxy system instruction carries the line', () => {
    const src = readFileSync(resolve(process.cwd(), 'supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
    expect(src).toContain('visitorLocalTimeLine(new Date(), config.timeZone)');
  });
});

describe('opening render backstop (2026-11-16) — proxy wiring pins', () => {
  it('the proxy renders a surviving template opening at serve time', () => {
    const proxy = readFileSync(resolve(process.cwd(), 'supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
    expect(proxy).toContain('renderOpeningTemplate(openingRendered');
    expect(proxy).toContain('hourInTimeZone(new Date()');
    expect(proxy).toContain('opening: openingRendered');
  });

  it('renderOpeningTemplate substitutes the timezone hour into the homepage rotation shape', async () => {
    const { renderOpeningTemplate } = await import('../../supabase/functions/_shared/voice-config');
    const rendered = renderOpeningTemplate('{timeGreeting}, and thanks for calling {businessName}! I\'m {agentName}.', { businessName: 'AI Hidden Leads', name: 'Aspen' }, 10, '');
    expect(rendered).toBe('Good morning, and thanks for calling AI Hidden Leads! I\'m Aspen.');
  });
});
