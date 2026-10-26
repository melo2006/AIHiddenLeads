// @vitest-environment node
import { expect, test } from 'vitest';
import { PAYMENT_PLANS, paidAccess, paymentSettled, PLAN_CHANGE_PRORATION, CANCEL_AT_PERIOD_END } from '../../supabase/functions/_shared/payment-rules';
test('monthly plans cost exactly 99, 199 and 349 USD',()=>expect(PAYMENT_PLANS).toEqual({essentials_monthly:9900,growth_monthly:19900,fullservice_monthly:34900}));
test('only successful payment unlocks initial setup',()=>{expect(paymentSettled('paid')).toBe(true);expect(paymentSettled('unpaid')).toBe(false);expect(paymentSettled('no_payment_required')).toBe(false);});
test('cancellation retains access until paid period end',()=>{expect(CANCEL_AT_PERIOD_END).toBe(true);expect(paidAccess('canceled','2026-12-01T00:00:00Z',Date.parse('2026-11-01'))).toBe(true);expect(paidAccess('canceled','2026-12-01T00:00:00Z',Date.parse('2026-12-02'))).toBe(false);});
test('both plan changes are immediately invoiced with prorations',()=>expect(PLAN_CHANGE_PRORATION).toBe('always_invoice'));