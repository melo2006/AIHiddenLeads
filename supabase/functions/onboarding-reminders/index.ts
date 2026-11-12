// Day-1 onboarding reminder sweep (onboarding batch, 2026-11-12).
//
// Sends ONE "finish your phone number setup" email to each paying client
// whose welcome email is at least ~20h old and whose wizard phone step is
// still incomplete. Modelled on followup-sweep: when the
// ONBOARDING_SWEEP_SECRET secret is set, the caller must present it as the
// x-onboarding-secret header; sends are stamp-gated on the auth user's
// app_metadata (`onboarding_day1_sent_at`) — the stamp is claimed BEFORE
// sending and released on failure, so overlapping sweeps never double-send
// and a transient failure is retried by the next run.
//
// Scheduling (a deploy step, like the followup pack's pg_cron wiring):
// invoke this function on an hourly/daily schedule with the secret header.
// The day-3 "first calls" summary is NOT here — it belongs to the usage
// suite's report engine.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { onboardingDay1Nudge, trySend } from '../_shared/hostinger-mail.ts';
import { day1NudgeDue, type PhoneSetupState } from '../_shared/onboarding.ts';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const secret = Deno.env.get('ONBOARDING_SWEEP_SECRET');
  if (secret && req.headers.get('x-onboarding-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const now = new Date();

  const { data: workspaces, error } = await db.from('customer_workspaces')
    .select('user_id, agent_id, environment, created_at')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.error('onboarding-reminders: workspace query failed', error.message);
    return json({ ok: false, reason: 'workspace_query_failed', processed: 0, sent: 0 });
  }

  let processed = 0;
  let sent = 0;
  for (const ws of workspaces || []) {
    const { data: userData } = await db.auth.admin.getUserById(ws.user_id);
    const user = userData?.user;
    if (!user?.email) continue;
    const meta = (user.app_metadata || {}) as Record<string, unknown>;
    const { data: agent } = await db.from('voice_agents').select('draft').eq('id', ws.agent_id).maybeSingle();
    const phone = ((agent?.draft || {}) as Record<string, unknown>).phoneSetup as PhoneSetupState | undefined;
    if (!day1NudgeDue({ welcomeSentAt: (meta.welcome_sent_at as string) || null, day1SentAt: (meta.onboarding_day1_sent_at as string) || null, phone, now })) continue;

    // Claim before sending (stamp first), release on failure — the
    // followup-sweep pattern.
    const stamp = now.toISOString();
    const { error: claimErr } = await db.auth.admin.updateUserById(ws.user_id, {
      app_metadata: { ...meta, onboarding_day1_sent_at: stamp },
    });
    if (claimErr) continue;
    processed++;
    const um = (user.user_metadata || {}) as Record<string, unknown>;
    const ok = await trySend(onboardingDay1Nudge({ name: String(um.full_name || um.name || ''), email: user.email }));
    if (ok) sent++;
    else {
      const { data: fresh } = await db.auth.admin.getUserById(ws.user_id);
      const freshMeta = { ...((fresh?.user?.app_metadata || {}) as Record<string, unknown>) };
      delete freshMeta.onboarding_day1_sent_at;
      await db.auth.admin.updateUserById(ws.user_id, { app_metadata: freshMeta });
    }
  }

  return json({ ok: true, processed, sent });
});
