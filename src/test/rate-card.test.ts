import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATE_CARD, effectivePrice, mergeRateCard, mergeRateCardLine, validateRateCardInput,
  tenantPriceView, rateCardKeyForUsage, priceUsageEvent,
} from '../../supabase/functions/_shared/rate-card';

// Rate card (design 2026-11-18 §11): the full metered inventory with
// Ron's wholesale defaults, per-row charge modes, per-tenant overrides,
// and the tenant-safe projection. The defaults below are pinned to the
// §11 table — changing them is a pricing decision, not a refactor.

const byKey = Object.fromEntries(DEFAULT_RATE_CARD.map((l) => [l.key, l]));

describe('§11 inventory + Ron\'s wholesale defaults', () => {
  it('covers every metered cost center in the §11 table', () => {
    expect(Object.keys(byKey).sort()).toEqual([
      'avatar_creation', 'avatar_minutes', 'chat_minutes', 'email_sends', 'phone_number_month',
      'premium_voice_minutes', 'prospect_batch', 'sms_segments', 'voice_clone_creation',
      'voice_minutes', 'website_scan', 'whatsapp_messages',
    ].sort());
  });

  it('voice is 5¢ and avatar is 5¢ (10¢ together) at today\'s costs', () => {
    expect(effectivePrice(byKey.voice_minutes)).toBeCloseTo(0.05, 3);
    expect(effectivePrice(byKey.avatar_minutes)).toBeCloseTo(0.05, 3);
    expect(effectivePrice(byKey.voice_minutes) + effectivePrice(byKey.avatar_minutes)).toBeCloseTo(0.10, 3);
  });

  it('per-minute lines default to markup; per-action lines to flat', () => {
    expect(byKey.voice_minutes.mode).toBe('markup');
    expect(byKey.avatar_minutes.mode).toBe('markup');
    expect(byKey.chat_minutes.mode).toBe('markup');
    expect(byKey.whatsapp_messages.mode).toBe('markup');
    expect(byKey.whatsapp_messages.markupPct).toBe(30); // cost + 30% per §11
    expect(byKey.voice_clone_creation.mode).toBe('flat');
    expect(effectivePrice(byKey.voice_clone_creation)).toBe(5);
    expect(effectivePrice(byKey.avatar_creation)).toBe(25);
    expect(effectivePrice(byKey.website_scan)).toBe(1);
    expect(effectivePrice(byKey.email_sends)).toBe(5);
    expect(effectivePrice(byKey.sms_segments)).toBe(0.02);
    expect(effectivePrice(byKey.phone_number_month)).toBe(3);
    expect(effectivePrice(byKey.prospect_batch)).toBe(0.5);
    expect(effectivePrice(byKey.chat_minutes)).toBeCloseTo(0.03, 3);
  });

  it('no tenant-visible label names a vendor', () => {
    const banned = /simli|gemini|elevenlabs|firecrawl|telnyx|twilio|resend|meta\b/i;
    for (const line of DEFAULT_RATE_CARD) {
      expect(line.label).not.toMatch(banned);
      expect(line.note ?? '').not.toMatch(banned);
    }
  });
});

describe('merge + overrides', () => {
  it('stored rows override defaults field by field', () => {
    const merged = mergeRateCard({ voice_minutes: { costUsd: 0.03, mode: 'markup', markupPct: 100 } });
    const voice = merged.find((l) => l.key === 'voice_minutes')!;
    expect(voice.costUsd).toBe(0.03);
    expect(effectivePrice(voice)).toBeCloseTo(0.06, 4);
    // Untouched lines keep defaults.
    expect(effectivePrice(merged.find((l) => l.key === 'website_scan')!)).toBe(1);
  });

  it('per-tenant overrides win over the stored platform card', () => {
    const merged = mergeRateCard(
      { sms_segments: { mode: 'flat', flatUsd: 0.03 } },
      { sms_segments: { mode: 'flat', flatUsd: 0.015 } },
    );
    expect(effectivePrice(merged.find((l) => l.key === 'sms_segments')!)).toBe(0.015);
  });

  it('junk in a stored row falls back to the default field', () => {
    const line = mergeRateCardLine(byKey.voice_minutes, { costUsd: -2, markupPct: 'high', mode: 'weird' });
    expect(line.costUsd).toBe(byKey.voice_minutes.costUsd);
    expect(line.markupPct).toBe(byKey.voice_minutes.markupPct);
    expect(line.mode).toBe(byKey.voice_minutes.mode);
  });

  it('validateRateCardInput rejects unknown lines and bad numbers', () => {
    expect('error' in validateRateCardInput({ nope: { flatUsd: 1 } })).toBe(true);
    expect('error' in validateRateCardInput({ voice_minutes: { flatUsd: -1 } })).toBe(true);
    expect('error' in validateRateCardInput({ voice_minutes: { mode: 'weird' } })).toBe(true);
    const ok = validateRateCardInput({ voice_minutes: { mode: 'flat', flatUsd: 0.07 } });
    expect('value' in ok && ok.value.voice_minutes).toEqual({ mode: 'flat', flatUsd: 0.07 });
  });
});

describe('tenant projection — the white-label boundary', () => {
  it('tenantPriceView carries labels + prices and NO cost or markup data', () => {
    const view = tenantPriceView(mergeRateCard(null));
    for (const row of view) {
      expect(Object.keys(row).sort()).toEqual(['key', 'label', 'priceUsd', 'unit']);
    }
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('costUsd');
    expect(serialized).not.toContain('markupPct');
    expect(serialized).not.toContain('0.024'); // our voice cost must never leak
  });
});

describe('pricing ledger events', () => {
  const card = mergeRateCard(null);
  it('maps ledger services to lines', () => {
    expect(rateCardKeyForUsage('web_voice', 'gemini')).toBe('voice_minutes');
    expect(rateCardKeyForUsage('video_avatar', 'simli')).toBe('avatar_minutes');
    expect(rateCardKeyForUsage('chat_brain')).toBe('chat_minutes');
    expect(rateCardKeyForUsage('sms', 'telnyx')).toBe('sms_segments');
    expect(rateCardKeyForUsage('email')).toBe('email_sends');
    expect(rateCardKeyForUsage('mystery')).toBe(null);
  });

  it('prices minutes by quantity_minutes and email per 1,000', () => {
    expect(priceUsageEvent(card, { service: 'web_voice', provider: 'gemini', quantity_minutes: 10 })).toBeCloseTo(0.4992, 3);
    expect(priceUsageEvent(card, { service: 'email', quantity_count: 2000 })).toBe(10);
    expect(priceUsageEvent(card, { service: 'sms', quantity_count: 3 })).toBe(0.06);
    expect(priceUsageEvent(card, { service: 'mystery', quantity_count: 5 })).toBe(0);
  });
});
