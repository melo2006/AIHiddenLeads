// Stripe-side operations for the video avatar add-on (pricing cleanup,
// 2026-11-12). The mechanic lives in _shared/avatar-trial.ts; this module
// is the I/O: creating the add-on subscription and recording the
// customer's keep / let-it-switch-off choice.
//
// Two creation paths converge here:
//  1. Plan checkout with the avatar box ticked — the plan session carries
//     metadata video_avatar='true'; once the plan payment is verified,
//     payments-webhook calls startAvatarSubscription() (failure-isolated,
//     like the welcome email: a failed avatar start never fails a paid
//     plan webhook; the customer can still start it from the dashboard).
//  2. The dashboard/checkout add-later path — create-checkout's
//     video_avatar_monthly branch runs an embedded checkout for the
//     add-on subscription itself; Stripe webhooks then record it via
//     syncAvatarSubscription. No code here is needed for that path.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createStripeClient, type StripeEnv } from './stripe.ts';
import { VIDEO_AVATAR_PRICE, priceMatchesVideoAvatar, validPaymentPlan } from './payment-rules.ts';
import { AVATAR_TRIAL_DAYS, avatarStartMode } from './avatar-trial.ts';
import { syncAvatarSubscription } from './customer-payments.ts';

type Db = ReturnType<typeof createClient>;
type Stripe = ReturnType<typeof createStripeClient>;

const LIVE_AVATAR_STATUSES = ['trialing', 'active', 'past_due'];

async function liveAvatarRow(db: Db, userId: string, env: StripeEnv) {
  const { data } = await db.from('subscriptions').select('*')
    .eq('user_id', userId).eq('environment', env).eq('price_id', VIDEO_AVATAR_PRICE.id)
    .in('status', LIVE_AVATAR_STATUSES)
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

async function priorTrialCount(db: Db, userId: string, env: StripeEnv): Promise<number> {
  try {
    const { count } = await db.from('video_avatar_trials').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('environment', env);
    return count ?? 0;
  } catch { return 0; } // table lands with migration 0021; pre-migration, treat as unused
}

async function resolveAvatarPrice(stripe: Stripe) {
  const found = (await stripe.prices.list({ lookup_keys: [VIDEO_AVATAR_PRICE.id], active: true })).data[0];
  if (!priceMatchesVideoAvatar(found)) throw new Error('Video avatar pricing is unavailable');
  return found;
}

/**
 * Create the avatar add-on subscription for a customer who just paid for
 * a plan (webhook path 1). The customer and their payment method come
 * from the plan subscription — the avatar subscription is created on the
 * same Stripe customer, trialing for AVATAR_TRIAL_DAYS when the business
 * has not used its free month, billing immediately otherwise. Returns
 * the synced subscriptions row, or null when there is nothing to do
 * (no plan, or an avatar subscription already exists).
 */
export async function startAvatarSubscription(db: Db, stripe: Stripe, userId: string, env: StripeEnv) {
  const { data: subs } = await db.from('subscriptions').select('*')
    .eq('user_id', userId).eq('environment', env)
    .order('created_at', { ascending: false });
  const plan = (subs || []).find(s => validPaymentPlan(s.price_id) && LIVE_AVATAR_STATUSES.includes(s.status));
  if (!plan) return null;
  const existing = (subs || []).find(s => s.price_id === VIDEO_AVATAR_PRICE.id && LIVE_AVATAR_STATUSES.includes(s.status));
  const mode = avatarStartMode({ hasLiveAvatarSubscription: Boolean(existing), priorTrialCount: await priorTrialCount(db, userId, env) });
  if (mode === 'already_active') return existing ?? null;
  const price = await resolveAvatarPrice(stripe);
  const created = await stripe.subscriptions.create({
    customer: plan.stripe_customer_id,
    items: [{ price: price.id }],
    ...(mode === 'trial' ? { trial_period_days: AVATAR_TRIAL_DAYS } : {}),
    payment_settings: { save_default_payment_method: 'on_subscription' },
    metadata: { userId, kind: 'video_avatar', plan: plan.price_id, source: 'plan_checkout' },
  });
  return syncAvatarSubscription(db, stripe, created.id, env);
}

/**
 * Record the customer's end-of-trial choice.
 * keep=true  — disarm the default-off (cancel_at_period_end=false) while
 *              trialing and stamp kept_at; the subscription then bills
 *              $79/month from trial end. On an already-paid subscription
 *              it simply clears a scheduled cancellation.
 * keep=false — (re)arm cancellation at period end: an untouched trial
 *              ends at trial end; a paid add-on ends at its paid period
 *              end. kept_at is cleared so the state reads honestly.
 */
export async function setAvatarKept(db: Db, stripe: Stripe, userId: string, env: StripeEnv, keep: boolean) {
  const row = await liveAvatarRow(db, userId, env);
  if (!row) return null;
  const current = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  if (current.metadata.userId !== userId) throw new Error('Subscription ownership could not be verified');
  await stripe.subscriptions.update(current.id, { cancel_at_period_end: !keep });
  try {
    await db.from('video_avatar_trials').upsert(
      { user_id: userId, environment: env, stripe_subscription_id: current.id, kept_at: keep ? new Date().toISOString() : null },
      { onConflict: 'stripe_subscription_id' },
    );
  } catch (e) { console.error('avatar keep stamp failed', e instanceof Error ? e.message : 'unknown'); }
  return syncAvatarSubscription(db, stripe, current.id, env);
}
