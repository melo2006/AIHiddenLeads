// Welcome-email orchestration (onboarding batch, 2026-11-12).
//
// Called by payments-webhook after the FIRST paid checkout provisions a
// customer workspace. The codebase's established flow creates the auth
// account at sign-up (create-checkout requires a verified signed-in user),
// so "auto-create on checkout" lands here as: auto-PROVISION the workspace
// (provisionCustomer, already idempotent) + auto-SEND the welcome email
// carrying a secure Supabase Auth recovery link the client uses to set (or
// reset) their password. No password is ever invented or emailed.
//
// Idempotency: the send is stamp-gated on the auth user's app_metadata
// (`welcome_sent_at`), mirroring the followup sweep's claim pattern — a
// Stripe webhook retry can re-enter safely and will not double-send.
// Any failure is logged and swallowed by the caller: a mail problem must
// never fail the payment webhook.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { customerWelcome, trySend } from './hostinger-mail.ts';

const SITE = 'https://aihiddenleads.com';

type Db = ReturnType<typeof createClient>;

export async function maybeSendWelcomeEmail(db: Db, userId: string): Promise<{ sent: boolean; reason?: string }> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) return { sent: false, reason: 'user_lookup_failed' };
  const user = data.user;
  const meta = (user.app_metadata || {}) as Record<string, unknown>;
  if (meta.welcome_sent_at) return { sent: false, reason: 'already_sent' };
  if (!user.email) return { sent: false, reason: 'no_email' };

  // Secure set-password link: a Supabase Auth recovery action link. It
  // lands on /setup?reset=1, whose page establishes the recovery session
  // and lets the client choose their own password (the same destination
  // the sign-in page's reset flow already uses).
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
    options: { redirectTo: `${SITE}/setup?reset=1` },
  });
  const actionLink = link?.properties?.action_link;
  if (linkErr || !actionLink) return { sent: false, reason: 'link_generation_failed' };

  const um = (user.user_metadata || {}) as Record<string, unknown>;
  const name = String(um.full_name || um.name || '').trim();
  const ok = await trySend(customerWelcome({ name, email: user.email, setPasswordUrl: actionLink }));
  if (!ok) return { sent: false, reason: 'send_failed' };

  const { error: stampErr } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { ...meta, welcome_sent_at: new Date().toISOString() },
  });
  if (stampErr) console.error('welcome: sent but stamp failed', stampErr.message);
  return { sent: true };
}
