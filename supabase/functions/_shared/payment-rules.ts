export const PAYMENT_PLANS = { essentials_monthly: 9900, growth_monthly: 19900, fullservice_monthly: 34900 } as const;
export function validPaymentPlan(value: unknown): value is keyof typeof PAYMENT_PLANS { return typeof value === 'string' && value in PAYMENT_PLANS; }
export function paidAccess(status: string, end: string | null, now = Date.now()) {
  return ['active','past_due','canceled'].includes(status) && (end ? Date.parse(end) > now : status !== 'canceled');
}
export const PLAN_CHANGE_PRORATION = 'always_invoice';
export const CANCEL_AT_PERIOD_END = true;
export function paymentSettled(status: string) { return status === 'paid'; }