// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const conv = readFileSync(new URL('../components/GeminiConversation.tsx', import.meta.url), 'utf8');

describe('captions default + tip card (owner-directed 2026-11-15)', () => {
  test('a brand-new visitor starts with captions OFF (avatar is the showpiece)', () => {
    // Preference order: stored localStorage choice, then the legacy
    // session memory, then the new default — OFF.
    expect(conv).toContain('const saved = localStorage.getItem("aspen-widget-captions");');
    expect(conv).toContain('if (saved === "on") return true;');
    expect(conv).toContain('if (saved === "off") return false;');
    expect(conv).toContain('return sessionStorage.getItem("aspen-widget-captions") === "on";');
  });

  test('only the explicit toggle writes the cross-visit preference', () => {
    expect(conv).toContain('const chooseCaptions = useCallback((next: boolean) => {');
    expect(conv).toContain('localStorage.setItem("aspen-widget-captions", next ? "on" : "off");');
    expect(conv).toContain('onClick={() => chooseCaptions(true)}');
    expect(conv).toContain('onClick={() => chooseCaptions(!captions)}');
    // Muting still forces captions on for the session WITHOUT
    // overwriting the stored preference.
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
