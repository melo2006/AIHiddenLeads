export const PAYMENT_PLANS = { essentials_monthly: 9900, growth_monthly: 19900, fullservice_monthly: 34900 } as const;
export const CUSTOM_AVATAR_PRICE = { id: 'custom_avatar_once', amount: 5000 } as const;
export function validPaymentPlan(value: unknown): value is keyof typeof PAYMENT_PLANS { return typeof value === 'string' && value in PAYMENT_PLANS; }
// Minute packs (Usage Reporting Suite, 2026-11-12): one-time voice-minute
// add-ons. Mirror of the public.minute_packs seed in
// drizzle/migrations/0020_usage_reporting.sql — keep the two in sync.
// Video packs are deliberately absent: Simli's per-minute cost is
// unverified, so video packs stay unpriced.
export const MINUTE_PACKS = { voice_100:{minutes:100, amount:2000}, voice_300:{minutes:300, amount:5400}, voice_500:{minutes:500, amount:8500}, voice_1000:{minutes:1000, amount:15000} } as const;
export function validMinutePack(value: unknown): value is keyof typeof MINUTE_PACKS { return typeof value === 'string' && value in MINUTE_PACKS; }
export function paidAccess(status: string, end: string | null, now = Date.now()) {
  return ['active','past_due','canceled'].includes(status) && (end ? Date.parse(end) > now : status !== 'canceled');
}
export const PLAN_CHANGE_PRORATION = 'always_invoice';
export const CANCEL_AT_PERIOD_END = true;
export function paymentSettled(status: string) { return status === 'paid'; }