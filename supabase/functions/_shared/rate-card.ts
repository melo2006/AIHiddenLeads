// Rate card — the platform's metered price list (design 2026-11-18 §11).
//
// One row per metered cost center. Each row carries OUR cost (platform
// admin only — never serialized into a tenant-facing payload), a charge
// mode chosen per row (percentage markup on our cost, or a flat price),
// and the tenant-facing price computed from them. The card below is the
// built-in default; the admin Rate Card page edits rows persisted in
// the tenant_rate_card table, and per-tenant overrides live in
// voice_organizations.rate_card_overrides (same line keys).
//
// White-label rule: labels are vendor-neutral ("avatar creation",
// never a provider name) because the tenant-facing projection of this
// card is shown inside reseller consoles.

export type RateUnit = 'minute' | 'creation' | 'scan' | 'per_1000' | 'segment' | 'number_month' | 'message' | 'prospect';
export type ChargeMode = 'markup' | 'flat';

export interface RateCardLine {
  key: string;
  /** Tenant-safe label — no vendor names, ever. */
  label: string;
  unit: RateUnit;
  /** Our cost in USD per unit. Admin-only data. */
  costUsd: number;
  mode: ChargeMode;
  /** Markup percent when mode='markup' (108 means cost + 108%). */
  markupPct: number;
  /** Flat tenant price in USD per unit when mode='flat'. */
  flatUsd: number;
  note?: string;
}

/** §11 inventory with Ron's wholesale defaults (2026-11-18). Per-minute
 *  lines default to markup mode (a % survives provider price changes),
 *  calibrated so today's effective price equals Ron's named wholesale
 *  price; per-action lines default to flat fees. */
export const DEFAULT_RATE_CARD: RateCardLine[] = [
  { key: 'voice_minutes', label: 'Voice minutes', unit: 'minute', costUsd: 0.024, mode: 'markup', markupPct: 108, flatUsd: 0.05 },
  { key: 'avatar_minutes', label: 'Avatar/video minutes', unit: 'minute', costUsd: 0.0089, mode: 'markup', markupPct: 462, flatUsd: 0.05, note: 'Voice + avatar together price at 10¢/min at today\'s costs.' },
  { key: 'chat_minutes', label: 'Text chat minutes', unit: 'minute', costUsd: 0.0155, mode: 'markup', markupPct: 94, flatUsd: 0.03 },
  { key: 'premium_voice_minutes', label: 'Premium voice minutes', unit: 'minute', costUsd: 0.10, mode: 'markup', markupPct: 100, flatUsd: 0.20, note: 'Optional upgraded voice engine, per minute of speech.' },
  { key: 'voice_clone_creation', label: 'Voice clone creation', unit: 'creation', costUsd: 1.00, mode: 'flat', markupPct: 30, flatUsd: 5 },
  { key: 'avatar_creation', label: 'Custom avatar creation', unit: 'creation', costUsd: 0, mode: 'flat', markupPct: 30, flatUsd: 25, note: 'Included in our avatar plan; the cost is build time.' },
  { key: 'website_scan', label: 'Website scan for a demo', unit: 'scan', costUsd: 0.05, mode: 'flat', markupPct: 30, flatUsd: 1 },
  { key: 'email_sends', label: 'Email sends', unit: 'per_1000', costUsd: 0.40, mode: 'flat', markupPct: 30, flatUsd: 5 },
  { key: 'sms_segments', label: 'SMS segments', unit: 'segment', costUsd: 0.01, mode: 'flat', markupPct: 30, flatUsd: 0.02 },
  { key: 'phone_number_month', label: 'Phone number rental', unit: 'number_month', costUsd: 1.50, mode: 'flat', markupPct: 30, flatUsd: 3 },
  { key: 'whatsapp_messages', label: 'WhatsApp messages', unit: 'message', costUsd: 0.0625, mode: 'markup', markupPct: 30, flatUsd: 0.09, note: 'Cost shown is the marketing-message rate; utility messages cost less and price off the same markup.' },
  { key: 'prospect_batch', label: 'Prospect (lead generation)', unit: 'prospect', costUsd: 0.10, mode: 'flat', markupPct: 30, flatUsd: 0.50, note: 'Per prospect delivered; batches are hard-capped.' },
];

export const RATE_CARD_KEYS = DEFAULT_RATE_CARD.map((l) => l.key);

/** The tenant-facing unit price for a line. */
export function effectivePrice(line: RateCardLine): number {
  if (line.mode === 'flat') return roundUsd(line.flatUsd);
  return roundUsd(line.costUsd * (1 + line.markupPct / 100));
}

export function roundUsd(v: number): number {
  return Math.round(v * 10000) / 10000;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Normalize one stored/overridden line over its default. Unknown keys
 *  and bad values fall back to the default field by field. */
export function mergeRateCardLine(def: RateCardLine, raw: unknown): RateCardLine {
  if (!raw || typeof raw !== 'object') return { ...def };
  const r = raw as Record<string, unknown>;
  return {
    ...def,
    costUsd: num(r.costUsd) ?? def.costUsd,
    mode: r.mode === 'flat' || r.mode === 'markup' ? r.mode : def.mode,
    markupPct: num(r.markupPct) ?? def.markupPct,
    flatUsd: num(r.flatUsd) ?? def.flatUsd,
  };
}

/** The full effective card: defaults, with stored platform rows and
 *  then per-tenant overrides applied in that order. `stored` may be a
 *  map (from tenant_rate_card rows) or null. */
export function mergeRateCard(
  stored: Record<string, unknown> | null | undefined,
  overrides?: Record<string, unknown> | null,
): RateCardLine[] {
  return DEFAULT_RATE_CARD.map((def) => {
    let line = mergeRateCardLine(def, stored?.[def.key]);
    if (overrides) line = mergeRateCardLine(line, overrides[def.key]);
    return line;
  });
}

/** Validate an admin-submitted card or override set for writing.
 *  Only known line keys; every present field must be a sane number. */
export function validateRateCardInput(raw: unknown): { value: Record<string, Partial<RateCardLine>> } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Rate card data is required' };
  const out: Record<string, Partial<RateCardLine>> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!RATE_CARD_KEYS.includes(key)) return { error: `Unknown rate card line: ${key}` };
    if (!v || typeof v !== 'object') return { error: `Rate card line ${key} must be an object` };
    const r = v as Record<string, unknown>;
    const line: Partial<RateCardLine> = {};
    for (const field of ['costUsd', 'markupPct', 'flatUsd'] as const) {
      if (r[field] !== undefined) {
        const n = num(r[field]);
        if (n === null) return { error: `${key}.${field} must be a non-negative number` };
        line[field] = n;
      }
    }
    if (r.mode !== undefined) {
      if (r.mode !== 'markup' && r.mode !== 'flat') return { error: `${key}.mode must be markup or flat` };
      line.mode = r.mode;
    }
    out[key] = line;
  }
  return { value: out };
}

export interface TenantPriceLine {
  key: string;
  label: string;
  unit: RateUnit;
  priceUsd: number;
}

/**
 * The ONLY projection of the rate card a tenant may ever see: labels
 * and their effective prices. No costs, no markup internals — and the
 * platform's retail plan prices are not part of the card at all.
 */
export function tenantPriceView(card: RateCardLine[]): TenantPriceLine[] {
  return card.map((l) => ({ key: l.key, label: l.label, unit: l.unit, priceUsd: effectivePrice(l) }));
}

/** Map a usage-ledger service (+ provider) to its rate-card line key.
 *  Returns null for services the card doesn't price. */
export function rateCardKeyForUsage(service: string, provider?: string | null): string | null {
  switch (service) {
    case 'web_voice':
    case 'phone_voice':
      return provider === 'elevenlabs' || provider === 'other' ? 'premium_voice_minutes' : 'voice_minutes';
    case 'video_avatar': return 'avatar_minutes';
    case 'chat_brain': return 'chat_minutes';
    case 'sms': return 'sms_segments';
    case 'email': return 'email_sends';
    default: return null;
  }
}

/** Price one ledger event against a card: minutes-priced lines use
 *  quantity_minutes, count lines use quantity_count (email prices per
 *  1,000 sends). Returns USD, 0 for unpriced services. */
export function priceUsageEvent(
  card: RateCardLine[],
  event: { service: string; provider?: string | null; quantity_minutes?: number | null; quantity_count?: number | null },
): number {
  const key = rateCardKeyForUsage(event.service, event.provider);
  if (!key) return 0;
  const line = card.find((l) => l.key === key);
  if (!line) return 0;
  const price = effectivePrice(line);
  if (line.unit === 'minute') return roundUsd(price * (event.quantity_minutes || 0));
  if (line.unit === 'per_1000') return roundUsd((price * (event.quantity_count || 0)) / 1000);
  return roundUsd(price * (event.quantity_count || 0));
}
