// Retail pricing — the RESELLER's own price list (design 2026-11-18
// §12.3, Phase 2.5). A reseller buys metered services at his wholesale
// prices (the rate card's tenantPriceView, computed from _shared/
// rate-card.ts) and sells to HIS customers at retail prices he sets
// himself, per line, in one of three modes:
//
//   markup — wholesale + a percentage (the recommended default: 100%)
//   flat   — a fixed retail price, whatever wholesale does
//   addon  — wholesale + a fixed amount (e.g. cost + 10¢/minute)
//
// Settings persist per reseller org in
// voice_organizations.retail_prices, keyed by rate-card line key — the
// sibling of rate_card_overrides (which is the PLATFORM pricing the
// reseller; retail_prices is the reseller pricing his customers).
//
// White-label rule: this module deals in the rate card's neutral
// labels only. The wholesale figures here are the reseller's OWN
// prices — he may see them; his customers may not (see
// customerRetailView, which strips them).

import { RATE_CARD_KEYS, roundUsd, type RateUnit, type TenantPriceLine } from './rate-card.ts';

export type RetailMode = 'markup' | 'flat' | 'addon';

export interface RetailLineSetting {
  mode: RetailMode;
  /** Markup percent when mode='markup' (100 = double the wholesale). */
  markupPct: number;
  /** Fixed retail price in USD per unit when mode='flat'. */
  flatUsd: number;
  /** Fixed amount added to wholesale in USD per unit when mode='addon'. */
  addonUsd: number;
}

/** §12.3's baked-in recommendation: 100% markup — double your cost. */
export const RECOMMENDED_MARKUP_PCT = 100;

export function defaultRetailSetting(): RetailLineSetting {
  return { mode: 'markup', markupPct: RECOMMENDED_MARKUP_PCT, flatUsd: 0, addonUsd: 0 };
}

/** The full recommended setup: every line at the 100% markup. Used as
 *  the pre-fill for a reseller who has never saved retail prices. */
export function defaultRetailPrices(): Record<string, RetailLineSetting> {
  return Object.fromEntries(RATE_CARD_KEYS.map((k) => [k, defaultRetailSetting()]));
}

/** The retail price (USD) for one line, from its wholesale price. */
export function retailPriceUsd(wholesaleUsd: number, setting: RetailLineSetting): number {
  if (setting.mode === 'flat') return roundUsd(setting.flatUsd);
  if (setting.mode === 'addon') return roundUsd(wholesaleUsd + setting.addonUsd);
  return roundUsd(wholesaleUsd * (1 + setting.markupPct / 100));
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Normalize one stored setting over the recommendation, field by
 *  field — a partial or stale row can never break the price list. */
export function normalizeRetailSetting(raw: unknown): RetailLineSetting {
  const def = defaultRetailSetting();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Record<string, unknown>;
  return {
    mode: r.mode === 'flat' || r.mode === 'addon' || r.mode === 'markup' ? r.mode : def.mode,
    markupPct: num(r.markupPct) ?? def.markupPct,
    flatUsd: num(r.flatUsd) ?? def.flatUsd,
    addonUsd: num(r.addonUsd) ?? def.addonUsd,
  };
}

/** Normalize a whole stored retail_prices payload into a complete
 *  per-line settings map (unknown keys dropped, missing lines get the
 *  recommendation). */
export function normalizeRetailPrices(raw: unknown): Record<string, RetailLineSetting> {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(RATE_CARD_KEYS.map((k) => [k, normalizeRetailSetting(src[k])]));
}

/** Validate a reseller-submitted settings payload for writing. Only
 *  known line keys; every present field a sane non-negative number. */
export function validateRetailPricesInput(
  raw: unknown,
): { value: Record<string, RetailLineSetting> } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Retail prices are required' };
  const out: Record<string, RetailLineSetting> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!RATE_CARD_KEYS.includes(key)) return { error: `Unknown price line: ${key}` };
    if (!v || typeof v !== 'object') return { error: `Price line ${key} must be an object` };
    const r = v as Record<string, unknown>;
    if (r.mode !== undefined && r.mode !== 'markup' && r.mode !== 'flat' && r.mode !== 'addon') {
      return { error: `${key}.mode must be markup, flat or addon` };
    }
    const setting = normalizeRetailSetting(v);
    for (const field of ['markupPct', 'flatUsd', 'addonUsd'] as const) {
      if (r[field] !== undefined && num(r[field]) === null) {
        return { error: `${key}.${field} must be a non-negative number` };
      }
    }
    out[key] = setting;
  }
  return { value: out };
}

export interface RetailPriceLine {
  key: string;
  label: string;
  unit: RateUnit;
  /** What the reseller pays the platform per unit (USD). His data —
   *  shown to him, never to his customers. */
  wholesaleUsd: number;
  setting: RetailLineSetting;
  /** What his customers pay him per unit (USD, before any currency
   *  conversion for display). */
  retailUsd: number;
}

/** Join the reseller's wholesale prices with his retail settings. */
export function retailPriceView(
  wholesale: TenantPriceLine[],
  settings: Record<string, RetailLineSetting>,
): RetailPriceLine[] {
  return wholesale.map((w) => {
    const setting = settings[w.key] ?? defaultRetailSetting();
    return {
      key: w.key, label: w.label, unit: w.unit,
      wholesaleUsd: w.priceUsd, setting,
      retailUsd: retailPriceUsd(w.priceUsd, setting),
    };
  });
}

export interface CustomerPriceLine {
  key: string;
  label: string;
  unit: RateUnit;
  retailUsd: number;
}

/**
 * The ONLY retail projection a reseller's CUSTOMER may ever see: his
 * retail prices and the neutral labels. No wholesale, no settings
 * internals, no platform data of any kind.
 */
export function customerRetailView(lines: RetailPriceLine[]): CustomerPriceLine[] {
  return lines.map((l) => ({ key: l.key, label: l.label, unit: l.unit, retailUsd: l.retailUsd }));
}

/** One-line human summary of a setting, for read-only admin views:
 *  "+100%", "$2.50 flat", "+$0.10". */
export function retailSettingSummary(setting: RetailLineSetting): string {
  if (setting.mode === 'flat') return `$${setting.flatUsd.toFixed(2)} flat`;
  if (setting.mode === 'addon') return `+$${setting.addonUsd.toFixed(2)}`;
  return `+${setting.markupPct}%`;
}
