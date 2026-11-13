// Video avatar free-first-month mechanic (pricing cleanup, Ron's
// decisions 2026-11-12).
//
// Ron's offer, exactly: the live video avatar add-on is $79/month flat on
// ANY plan, and the first month is FREE. The mechanic that implements it:
//
// - The add-on is its OWN Stripe subscription (single item:
//   video_avatar_monthly), separate from the plan subscription — the same
//   add-later architecture the codebase already trusts for the custom
//   avatar and minute packs. Plan changes/cancellation never disturb it.
// - The free month is a Stripe TRIAL (trial_period_days = 30) on that
//   subscription. No coupon: a coupon would have to be created per mode
//   in Stripe and referenced by ID; a subscription trial is a primitive
//   of the subscription itself and travels with it.
// - DEFAULT OFF: the moment a trialing avatar subscription is recorded,
//   it is armed with cancel_at_period_end = true. A trialing
//   subscription's current period ends at trial end, so an untouched
//   trial ENDS at day 30 with no charge — "keep it" is the active choice
//   (dashboard one-click keep flips cancel_at_period_end back off).
// - One free trial per business: eligibility = the business has never
//   had an avatar trial (video_avatar_trials row) in this environment.
//   A returning customer re-subscribes at $79/month with no trial.
// - During the free month there are NO overage charges: past the
//   included video allowance the avatar soft-stops to voice-only
//   (enforced at Simli token issuance in simli-avatar). Once the add-on
//   is a kept, paid subscription, video overage is 20 cents/minute
//   (the separate avatar fact in _shared/overage-facts.ts).
// - A reminder goes out ~5 days before the trial ends (day ~25) via
//   the avatar-trial-reminders sweep — claim-before-send, and inert
//   until a schedule invokes it, like the other sweep engines.
//
// Trial bookkeeping lives in public.video_avatar_trials (drizzle
// migration 0021); the billing row itself lives in public.subscriptions
// with price_id = video_avatar_monthly, written by syncAvatarSubscription
// in _shared/customer-payments.ts.

import { PAYMENT_PLANS, VIDEO_AVATAR_PRICE } from './payment-rules.ts';

export const AVATAR_TRIAL_DAYS = 30;
/** How long before trial end the reminder fires ("ends in 5 days"). */
export const AVATAR_REMINDER_LEAD_DAYS = 5;

/** Included video minutes mirror the plan's included browser voice
 *  minutes (Ron's decision: the allowances match). Keyed by the plan's
 *  Stripe lookup key, mirroring HOMEPAGE_PLANS in homepage-knowledge.ts. */
export const PLAN_VIDEO_MINUTES: Record<keyof typeof PAYMENT_PLANS, number> = {
  essentials_monthly: 400,
  growth_monthly: 1200,
  fullservice_monthly: 2500,
};

export function avatarAllowanceMinutes(planPriceId: unknown): number | null {
  return typeof planPriceId === 'string' && planPriceId in PLAN_VIDEO_MINUTES
    ? PLAN_VIDEO_MINUTES[planPriceId as keyof typeof PLAN_VIDEO_MINUTES]
    : null;
}

export type AvatarStartMode = 'already_active' | 'trial' | 'paid';

/** Decide how an avatar subscription start proceeds.
 *  - already_active: a live (trialing/active/past_due) avatar
 *    subscription exists — never create a second one.
 *  - trial: no live subscription and the business has never consumed
 *    its free month in this environment.
 *  - paid: no live subscription, but the free month was already used —
 *    the add-on starts billing $79/month immediately. */
export function avatarStartMode(input: { hasLiveAvatarSubscription: boolean; priorTrialCount: number }): AvatarStartMode {
  if (input.hasLiveAvatarSubscription) return 'already_active';
  return input.priorTrialCount > 0 ? 'paid' : 'trial';
}

/** The day-~25 reminder is due when the trial is still running, the
 *  client has not chosen to keep the avatar, no reminder has been sent,
 *  and trial end is within the lead window (and not already past). */
export function avatarReminderDue(input: { trialEnd: string | null; keptAt: string | null; reminderSentAt: string | null; now?: Date }): boolean {
  if (!input.trialEnd || input.keptAt || input.reminderSentAt) return false;
  const end = Date.parse(input.trialEnd);
  if (!Number.isFinite(end)) return false;
  const now = (input.now ?? new Date()).getTime();
  const leadMs = AVATAR_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000;
  return end > now && end - now <= leadMs;
}

/** Trial soft-stop: during the free month there are no overage charges —
 *  once the month's metered video minutes reach the plan's included
 *  video allowance, the avatar pauses to voice-only for the rest of the
 *  month. Applies ONLY while trialing; a kept (paid) add-on meters
 *  overage at 20 cents/minute instead. */
export function avatarTrialSoftStop(input: { status: string | null | undefined; monthVideoMinutes: number; allowanceMinutes: number | null }): boolean {
  if (input.status !== 'trialing') return false;
  if (input.allowanceMinutes == null) return false;
  return Number.isFinite(input.monthVideoMinutes) && input.monthVideoMinutes >= input.allowanceMinutes;
}

export { VIDEO_AVATAR_PRICE };
