// Avatar free-month reminder sweep (pricing cleanup, 2026-11-12).
//
// Sends ONE reminder ~5 days before a video avatar trial ends, to every
// client who has not already chosen to keep the add-on:
//
//   "Your free avatar month ends in 5 days — keep it for $79/mo or it
//    switches off automatically."
//
// Email always (hostinger-mail); SMS additionally when the client has a
// number on file for alerts — their usage-report settings row
// (usage_report_settings.alert_phone with sms_alerts on), sent through
// the shared Twilio follow-up sender. The keep path is the dashboard
// (/account → Subscription → Keep the video avatar): no unauthenticated
// mutation links, ever.
//
// Modelled on onboarding-reminders / followup-sweep: when the
// AVATAR_TRIAL_SWEEP_SECRET secret is set, the caller must present it as
// the x-avatar-trial-secret header; the reminder stamp
// (video_avatar_trials.reminder_sent_at) is claimed BEFORE sending and
// released on failure, so overlapping sweeps never double-send and a
// transient failure is retried by the next run.
//
// INERT until scheduled: nothing invokes this function yet. Scheduling
// (pg_cron, daily, with the secret header) is a deploy step for Ron's
// first-send enablement, exactly like the usage-reports engine. The
// default-off itself does NOT depend on this sweep: trialing avatar
// subscriptions are armed cancel_at_period_end at sync time, so an
// untouched trial ends with no charge whether or not a reminder ran.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { avatarTrialReminder, trySend } from '../_shared/hostinger-mail.ts';
import { trySendFollowupSms } from '../_shared/twilio-sms.ts';
import { avatarReminderDue } from '../_shared/avatar-trial.ts';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const secret = Deno.env.get('AVATAR_TRIAL_SWEEP_SECRET');
  if (secret && req.headers.get('x-avatar-trial-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const now = new Date();

  const { data: trials, error } = await db.from('video_avatar_trials')
    .select('id, user_id, environment, stripe_subscription_id, trial_end, kept_at, reminder_sent_at')
    .is('reminder_sent_at', null).is('kept_at', null)
    .not('trial_end', 'is', null)
    .order('trial_end', { ascending: true })
    .limit(200);
  if (error) {
    // Includes the pre-migration state (0021 not applied yet): report and stop.
    console.error('avatar-trial-reminders: trials query failed', error.message);
    return json({ ok: false, reason: 'trials_query_failed', processed: 0, sent: 0 });
  }

  let processed = 0;
  let sent = 0;
  for (const t of trials || []) {
    if (!avatarReminderDue({ trialEnd: t.trial_end, keptAt: t.kept_at, reminderSentAt: t.reminder_sent_at, now })) continue;

    // The subscription must still be trialing (not already kept/ended).
    const { data: sub } = await db.from('subscriptions').select('status')
      .eq('stripe_subscription_id', t.stripe_subscription_id).maybeSingle();
    if (sub?.status !== 'trialing') continue;

    const { data: userData } = await db.auth.admin.getUserById(t.user_id);
    const user = userData?.user;
    if (!user?.email) continue;

    // Claim before sending (stamp first), release on failure.
    const stamp = now.toISOString();
    const { data: claimed, error: claimErr } = await db.from('video_avatar_trials')
      .update({ reminder_sent_at: stamp }).eq('id', t.id).is('reminder_sent_at', null)
      .select('id');
    if (claimErr || !claimed?.length) continue;
    processed++;

    const um = (user.user_metadata || {}) as Record<string, unknown>;
    const name = String(um.full_name || um.name || '');
    const endLabel = new Date(t.trial_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const ok = await trySend(avatarTrialReminder({ name, email: user.email, trialEnd: endLabel }));

    // SMS twin, only when the client has an alerts number on file.
    let smsOk = false;
    try {
      const { data: ws } = await db.from('customer_workspaces').select('organization_id')
        .eq('user_id', t.user_id).eq('environment', t.environment).maybeSingle();
      if (ws?.organization_id) {
        const { data: settings } = await db.from('usage_report_settings')
          .select('alert_phone, sms_alerts').eq('organization_id', ws.organization_id).maybeSingle();
        if (settings?.sms_alerts && settings.alert_phone) {
          const sms = await trySendFollowupSms(db, {
            to: settings.alert_phone,
            body: `AI Hidden Leads: your free video avatar month ends in 5 days (${endLabel}). Keep it for $79/mo in your dashboard — otherwise it switches off automatically and you won't be charged. ${'https://aihiddenleads.com/account'}`,
            templateId: 'avatar_trial_reminder',
          });
          smsOk = sms.sent;
        }
      }
    } catch (e) { console.error('avatar-trial-reminders: sms leg failed', e instanceof Error ? e.message : e); }

    if (ok || smsOk) sent++;
    if (!ok && !smsOk) {
      await db.from('video_avatar_trials').update({ reminder_sent_at: null }).eq('id', t.id);
    }
  }

  return json({ ok: true, processed, sent });
});
