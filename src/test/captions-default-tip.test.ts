// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const conv = readFileSync(new URL('../components/GeminiConversation.tsx', import.meta.url), 'utf8');

describe('captions default + tip card (owner-directed 2026-11-15, strengthened 2026-11-16)', () => {
  test('EVERY session starts with captions OFF — no cross-visit preference auto-applies', () => {
    // Ron's 2026-11-16 rule: OFF from the start of a session, always.
    // Only the same-visit sessionStorage mirror can start captions
    // on (reopening the widget mid-visit keeps the live choice).
    expect(conv).toContain('return sessionStorage.getItem("aspen-widget-captions") === "on";');
    expect(conv).not.toContain('localStorage.getItem("aspen-widget-captions")');
    expect(conv).not.toContain('localStorage.setItem("aspen-widget-captions"');
  });

  test('the toggle flips the live state only', () => {
    expect(conv).toContain('const chooseCaptions = useCallback((next: boolean) => {');
    // Chat-fix4 (2026-11-16): ONE unified CC toggle in the merged
    // control row flips the state — the focus dock's separate
    // chooseCaptions(true) button is gone with the dock.
    expect(conv).toContain('onClick={() => chooseCaptions(!captions)}');
    expect(conv).not.toContain('onClick={() => chooseCaptions(true)}');
    // Muting still forces captions on for the session.
    expect(conv).toContain('if (next) setCaptions(true);');
  });

  test('the tip card: once per visitor, ~10 seconds, captions-gated', () => {
    expect(conv).toContain('data-testid="aspen-captions-tip"');
    expect(conv).toContain('localStorage.getItem("aspen-captions-tip-seen") === "1"');
    expect(conv).toContain('localStorage.setItem("aspen-captions-tip-seen", "1")');
    expect(conv).toContain('setTimeout(() => setCaptionsTip(false), 10000)');
    expect(conv).toContain("t('voice.captionsTip')");
    expect(conv).toContain('bg-card/85');
  });

  test('the tip string exists in every site language', () => {
    for (const lang of ['en', 'es', 'pt-BR']) {
      const locale = JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
      expect(typeof locale.voice.captionsTip).toBe('string');
      expect(locale.voice.captionsTip.length).toBeGreaterThan(20);
      expect(typeof locale.voice.captionsTipDismiss).toBe('string');
    }
  });
});
