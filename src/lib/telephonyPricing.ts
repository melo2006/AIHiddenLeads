// Customer phone/SMS pricing: a fixed rate wins over percentage markup; client overrides win over defaults.
export type PricingRule = { markupPct: number; fixedVoicePerMin?: number | null; fixedSmsPerSegment?: number | null };
export type ProviderCosts = { inboundPerMin: number; outboundPerMin: number; smsPerSegment: number };
export type UsageRow = { kind: "call" | "sms"; direction: "inbound" | "outbound"; seconds: number; segments: number; provider_cost_usd?: number | null };

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function customerRate(cost: number, markupPct: number, fixed?: number | null): number {
  if (fixed != null && fixed >= 0) return fixed;
  return round4(cost * (1 + Math.max(0, markupPct) / 100));
}

export function resolveRule(defaults: PricingRule, client?: Partial<PricingRule> | null): PricingRule {
  return {
    markupPct: client?.markupPct ?? defaults.markupPct,
    fixedVoicePerMin: client?.fixedVoicePerMin ?? defaults.fixedVoicePerMin ?? null,
    fixedSmsPerSegment: client?.fixedSmsPerSegment ?? defaults.fixedSmsPerSegment ?? null,
  };
}

/** Per-second billing: charges seconds/60 × per-minute rate, rounded to the cent only on the monthly total. */
export function summarizeUsage(rows: UsageRow[], costs: ProviderCosts, rule: PricingRule) {
  let seconds = 0, segments = 0, cost = 0, charge = 0, calls = 0, texts = 0;
  for (const r of rows) {
    if (r.kind === "call") {
      calls++; seconds += r.seconds;
      const perMin = r.direction === "outbound" ? costs.outboundPerMin : costs.inboundPerMin;
      const c = r.provider_cost_usd ?? (r.seconds / 60) * perMin;
      cost += c;
      charge += (r.seconds / 60) * customerRate(perMin, rule.markupPct, rule.fixedVoicePerMin);
    } else {
      texts++; segments += r.segments;
      cost += r.provider_cost_usd ?? r.segments * costs.smsPerSegment;
      charge += r.segments * customerRate(costs.smsPerSegment, rule.markupPct, rule.fixedSmsPerSegment);
    }
  }
  const toCents = (n: number) => Math.round(n * 100) / 100;
  return { calls, texts, seconds, segments, costUsd: toCents(cost), chargeUsd: toCents(charge), profitUsd: toCents(charge - cost) };
}
