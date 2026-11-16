import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Start over as a new visitor (Ron, 2026-11-16): the panel's small
// restart control. A browser that has visited before is recognised —
// visitMemory makes the next start resume ("continue where we left
// off") — which is wrong when Ron demos the site to a friend on his
// own browser. The reset must wipe every client-side thread of the
// old visit (conversation memory + its sessionStorage mirror, the
// stored visitor key, the demo-gate resume record) while leaving
// device PREFERENCES (captions choice, voice, voice-proxy override)
// untouched: preferences are not identity.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: { token: 'test-token', maxSeconds: 900, idleChecks: false, homepageSales: false, status: 'awaiting_owner' }, error: null })) } },
}));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({
  Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('@twilio/voice-sdk', () => ({
  Device: class { on() {} audio = { setInputDevice: async () => {} }; async connect() { return { on: () => {}, removeAllListeners: () => {}, disconnect: () => {} }; } destroy() {} },
  Call: class {},
}));

import { resetVisitForNewVisitor } from '@/components/GeminiConversation';

const src = readFileSync(resolve(process.cwd(), 'src/components/GeminiConversation.tsx'), 'utf8');

describe('resetVisitForNewVisitor', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('wipes the visit identity: memory mirror, visitor key, demo resume', () => {
    sessionStorage.setItem('aspen-visit-memory-v1', JSON.stringify({ homepage: [{ role: 'assistant', text: 'Welcome back!' }] }));
    localStorage.setItem('gemini-visitor-key', 'old-visitor-key');
    localStorage.setItem('demoGateResume', JSON.stringify({ leadId: 'lead-1', websiteUrl: 'https://example.com', savedAt: 1 }));
    resetVisitForNewVisitor();
    expect(sessionStorage.getItem('aspen-visit-memory-v1')).toBe(null);
    expect(localStorage.getItem('gemini-visitor-key')).toBe(null);
    expect(localStorage.getItem('demoGateResume')).toBe(null);
  });

  it('keeps device preferences: captions, voice, proxy override survive', () => {
    localStorage.setItem('aspen-widget-captions', 'off');
    localStorage.setItem('gemini-aspen-voice', 'Kore');
    localStorage.setItem('voice-proxy-host', 'vps');
    resetVisitForNewVisitor();
    expect(localStorage.getItem('aspen-widget-captions')).toBe('off');
    expect(localStorage.getItem('gemini-aspen-voice')).toBe('Kore');
    expect(localStorage.getItem('voice-proxy-host')).toBe('vps');
  });

  it('never throws when storage is empty', () => {
    expect(() => resetVisitForNewVisitor()).not.toThrow();
  });
});

describe('start-over wiring (source pins)', () => {
  it('the helper clears the in-memory stores too, not just storage', () => {
    expect(src).toContain('export function resetVisitForNewVisitor(): void {');
    // The visit store moved to @/lib/visitMemory (2026-11-16, shared
    // with the typed chat): the reset routes through its full wipe,
    // which clears the in-memory Map itself.
    expect(src).toContain('clearAllVisitMemory();');
    const lib = readFileSync(resolve(process.cwd(), 'src/lib/visitMemory.ts'), 'utf8');
    expect(lib).toContain('visitMemory.clear();');
    expect(src).toContain('visitChainStash.clear();');
    expect(src).toContain('clearDemoResume();');
  });

  it('the panel button is small, labelled, and wired to the restart handler', () => {
    expect(src).toContain('data-testid="aspen-start-over"');
    expect(src).toContain('onClick={restartAsNewVisitor}');
    expect(src).toContain('<RefreshCw className="h-3.5 w-3.5" />');
    expect(src).toContain('title={t("voice.startOver")}');
  });

  it('the handler ends the live session and resets the panel state', () => {
    expect(src).toContain('const restartAsNewVisitor = useCallback(() => {');
    expect(src).toContain('stopEverything();\n    clearRetainedHandoffMic();\n    resetVisitForNewVisitor();');
    expect(src).toContain('setEndedByVisitor(false);');
  });

  it('the label exists in all three locales', () => {
    for (const loc of ['en', 'es', 'pt-BR']) {
      const json = JSON.parse(readFileSync(resolve(process.cwd(), `src/i18n/locales/${loc}.json`), 'utf8')) as { voice: { startOver?: string } };
      expect(typeof json.voice.startOver).toBe('string');
      expect((json.voice.startOver as string).length).toBeGreaterThan(3);
    }
  });
});
