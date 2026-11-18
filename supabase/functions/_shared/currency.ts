// Currency conversion (design 2026-11-18 §12.4, Phase 2.5).
//
// The platform ALWAYS settles with resellers in USD — that never
// changes. A reseller may still CHARGE HIS CUSTOMERS in his own
// currency: his retail prices are set in USD and converted for display
// through this table (USD base; 1 USD = rate × target currency).
//
// Rates live in the tenant_currency_rates table, one row per currency
// the admin has changed; absent rows use the built-in defaults below.
// The defaults are sensible hand-set values, NOT a live FX feed — the
// UI says so wherever they are shown ("editable defaults, as of …"),
// and the admin can correct them on the Rate Card page at any time.

export interface CurrencyDef {
  code: string;
  /** Display name — vendor-neutral, customer-safe. */
  name: string;
  symbol: string;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'CA$' },
  { code: 'BRL', name: 'Brazilian real', symbol: 'R$' },
];

export const SUPPORTED_CURRENCY_CODES = CURRENCIES.map((c) => c.code);

export function isSupportedCurrency(v: unknown): v is string {
  return typeof v === 'string' && SUPPORTED_CURRENCY_CODES.includes(v);
}

export function currencyDef(code: string | null | undefined): CurrencyDef {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Built-in default rates (units of target currency per 1 USD). */
export const DEFAULT_CURRENCY_RATES: Record<string, number> = {
  USD: 1,
  CAD: 1.39,
  BRL: 5.35,
};

/** The date the built-in defaults were set — displayed next to them so
 *  nobody mistakes them for a live feed. */
export const DEFAULT_RATES_AS_OF = '2026-11-18';

export interface EffectiveRate {
  code: string;
  /** Units of this currency per 1 USD. */
  rate: number;
  /** True when an admin-stored row overrides the built-in default. */
  edited: boolean;
  /** When the rate was set (stored row's date, or the defaults' date). */
  asOf: string;
}

const posNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Merge stored tenant_currency_rates rows over the built-in defaults.
 * `stored` may be a map (code → { rate, updated_at }) or null. USD is
 * always exactly 1 — it is the base, never an editable rate.
 */
export function effectiveCurrencyRates(
  stored: Record<string, { rate?: unknown; updated_at?: unknown }> | null | undefined,
): EffectiveRate[] {
  return CURRENCIES.map((c) => {
    if (c.code === 'USD') return { code: 'USD', rate: 1, edited: false, asOf: DEFAULT_RATES_AS_OF };
    const row = stored?.[c.code];
    const rate = posNum(row?.rate);
    if (rate === null) {
      return { code: c.code, rate: DEFAULT_CURRENCY_RATES[c.code], edited: false, asOf: DEFAULT_RATES_AS_OF };
    }
    const asOf = typeof row?.updated_at === 'string' && row.updated_at ? row.updated_at.slice(0, 10) : DEFAULT_RATES_AS_OF;
    return { code: c.code, rate, edited: true, asOf };
  });
}

export function rateFor(rates: EffectiveRate[], code: string | null | undefined): number {
  return rates.find((r) => r.code === code)?.rate ?? 1;
}

/** Convert a USD amount into `code` units (4dp precision, matching the
 *  rate card's money rounding). USD converts 1:1. */
export function convertFromUsd(amountUsd: number, code: string | null | undefined, rates: EffectiveRate[]): number {
  if (!code || code === 'USD') return Math.round(amountUsd * 10000) / 10000;
  return Math.round(amountUsd * rateFor(rates, code) * 10000) / 10000;
}

/**
 * Format an amount in a currency for display. Small per-unit prices
 * (per minute / per segment) keep up to 4 fraction digits so a
 * converted 10¢ doesn't collapse to 0.14 vs 0.13 ambiguity; anything
 * at or above 1 unit gets the standard 2.
 */
export function formatMoney(amount: number, code: string | null | undefined): string {
  const currency = isSupportedCurrency(code) ? code : 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: Math.abs(amount) < 1 ? 4 : 2,
    }).format(amount);
  } catch {
    return `${currencyDef(currency).symbol}${amount.toFixed(2)}`;
  }
}

/** Validate an admin-submitted rates payload ({ CAD: 1.41, … }) for
 *  writing. USD is rejected — it is the base and always 1. */
export function validateCurrencyRatesInput(
  raw: unknown,
): { value: Record<string, number> } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Currency rates are required' };
  const out: Record<string, number> = {};
  for (const [code, v] of Object.entries(raw as Record<string, unknown>)) {
    if (code === 'USD') return { error: 'USD is the base currency — its rate is always 1' };
    if (!isSupportedCurrency(code)) return { error: `Unsupported currency: ${code}` };
    const n = posNum(v);
    if (n === null || n > 1000) return { error: `Rate for ${code} must be a positive number` };
    out[code] = n;
  }
  if (!Object.keys(out).length) return { error: 'Nothing to save' };
  return { value: out };
}
