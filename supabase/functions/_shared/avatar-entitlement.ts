// Tenant entitlement gate for live video avatar sessions (pricing
// cleanup, 2026-11-12). The video avatar is a paid add-on ($79/month,
// first month free); this gate is what makes that true at the one point
// where avatar minutes are actually issued — Simli token creation in
// simli-avatar, public agent path only.
//
// Shape of the decision:
// - Agent belongs to NO customer workspace (platform/showroom agents —
//   Aspen's own homepage and demo faces): never gated. Today's behavior.
// - Tenant agent, owner has NO live avatar subscription: refused
//   (avatar_not_entitled) — the widget falls back to the still photo,
//   i.e. voice-only, which is exactly the off state Ron's offer implies.
// - Tenant, avatar subscription PAID (active/past_due): allowed;
//   overage meters at 20 cents/minute via the usage ledger.
// - Tenant, avatar subscription TRIALING: allowed until the month's
//   metered video minutes reach the plan's included video allowance,
//   then refused (avatar_trial_allowance_exhausted) — the free month's
//   soft-stop: no overage charges during the trial, voice continues.
//
// FAIL-OPEN by design: any lookup problem (including usage_events not
// existing until migration 0020 lands) allows the session. A metering
// gap must never take a paying customer's live avatar down; entitlement
// absence is the only hard refusal, and it is read from the
// subscriptions table that has existed since the first checkout.
import { VIDEO_AVATAR_PRICE, validPaymentPlan } from './payment-rules.ts';
import { avatarAllowanceMinutes, avatarTrialSoftStop } from './avatar-trial.ts';

export type AvatarGateResult =
  | { allowed: true }
  | { allowed: false; code: 'avatar_not_entitled' | 'avatar_trial_allowance_exhausted' };

const LIVE = ['trialing', 'active', 'past_due'];

export async function tenantAvatarGate(db: any, organizationId: string): Promise<AvatarGateResult> {
  try {
    const { data: ws, error } = await db.from('customer_workspaces')
      .select('user_id, environment').eq('organization_id', organizationId).maybeSingle();
    if (error || !ws) return { allowed: true }; // not a customer tenant → platform agent
    const { data: subs } = await db.from('subscriptions')
      .select('price_id, status').eq('user_id', ws.user_id).eq('environment', ws.environment)
      .order('created_at', { ascending: false });
    const rows = (subs || []) as { price_id: string; status: string }[];
    const avatar = rows.find(s => s.price_id === VIDEO_AVATAR_PRICE.id && LIVE.includes(s.status));
    if (!avatar) return { allowed: false, code: 'avatar_not_entitled' };
    if (avatar.status !== 'trialing') return { allowed: true };
    const plan = rows.find(s => validPaymentPlan(s.price_id) && LIVE.includes(s.status));
    const allowance = avatarAllowanceMinutes(plan?.price_id);
    if (allowance == null) return { allowed: true };
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { data: events, error: evErr } = await db.from('usage_events')
      .select('quantity_minutes').eq('organization_id', organizationId)
      .eq('service', 'video_avatar').gte('occurred_at', monthStart.toISOString());
    if (evErr) return { allowed: true }; // metering table not live yet → fail open
    const minutes = ((events || []) as { quantity_minutes?: number | null }[])
      .reduce((sum, e) => sum + (typeof e.quantity_minutes === 'number' ? e.quantity_minutes : 0), 0);
    if (avatarTrialSoftStop({ status: avatar.status, monthVideoMinutes: minutes, allowanceMinutes: allowance })) {
      return { allowed: false, code: 'avatar_trial_allowance_exhausted' };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
