import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// Owner-mailbox sending through Hostinger SMTP (portable, no DNS delegation needed).
export const OWNER_MAILBOX = 'info@aihiddenleads.com';
const OPT_OUT = 'You received this because you asked AI Hidden Leads to follow up. Reply STOP or "unsubscribe" to this email and we will not contact you again.';

export async function sendOwnerMail(opts: { to: string; subject: string; text: string }) {
  const password = Deno.env.get('HOSTINGER_SMTP_PASSWORD');
  if (!password) throw new Error('Mailbox password is not configured');
  const client = new SMTPClient({
    connection: { hostname: 'smtp.hostinger.com', port: 465, tls: true, auth: { username: OWNER_MAILBOX, password } },
  });
  try {
    await client.send({ from: `AI Hidden Leads <${OWNER_MAILBOX}>`, to: opts.to, replyTo: OWNER_MAILBOX, subject: opts.subject, content: opts.text });
  } finally {
    await client.close();
  }
}

type Contact = { name: string; email: string; phone?: string; businessName?: string };
const et = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' }) + ' Eastern';

export const bookingAlert = (c: Contact & { slotStart: string; notes?: string }) => ({
  to: OWNER_MAILBOX,
  subject: `New call booked: ${c.name} – ${et(c.slotStart)}`,
  text: `A visitor booked a call with AI Hidden Leads.\n\nWhen: ${et(c.slotStart)}\nName: ${c.name}\nEmail: ${c.email}\nPhone: ${c.phone || 'not given'}\nBusiness: ${c.businessName || 'not given'}\nNotes: ${c.notes || 'none'}\n\nThe event is on your Google Calendar.`,
});

export const followupAlert = (c: Contact) => ({
  to: OWNER_MAILBOX,
  subject: `Follow-up requested: ${c.name}`,
  text: `A visitor confirmed their details on screen and asked AI Hidden Leads to follow up.\n\nName: ${c.name}\nEmail: ${c.email}\nPhone: ${c.phone || 'not given'}\nBusiness/demo: ${c.businessName || 'not given'}`,
});

export const visitorFollowup = (c: Contact) => ({
  to: c.email,
  subject: 'Thanks for talking with Aspen – AI Hidden Leads',
  text: `Hi ${c.name.split(' ')[0] || 'there'},\n\nThanks for trying Aspen. As you asked, someone from AI Hidden Leads will follow up with you shortly.\n\nWant to pick a time now? https://aihiddenleads.com/book\nTry Aspen on your own website: https://aihiddenleads.com/demo\n\nJust reply to this email with any questions.\n\n— AI Hidden Leads\n\n${OPT_OUT}`,
});

export const dailySummary = (s: { day: string; visits: number; scans: number; voiceCalls: number; followups: string[]; bookings: string[] }) => ({
  to: OWNER_MAILBOX,
  subject: `AI Hidden Leads daily summary – ${s.day}`,
  text: `Summary for the last 24 hours (${s.day}):\n\nSite visits: ${s.visits}\nWebsite demos started: ${s.scans}\nVoice conversations: ${s.voiceCalls}\n\nFollow-up requests (${s.followups.length}):\n${s.followups.map(f => '- ' + f).join('\n') || '- none'}\n\nBooked calls (${s.bookings.length}):\n${s.bookings.map(b => '- ' + b).join('\n') || '- none'}\n\nFull details: https://aihiddenleads.com/dashboard`,
});

// Never let an email failure break the user-facing action.
export async function trySend(mail: { to: string; subject: string; text: string }) {
  try { await sendOwnerMail(mail); return true; } catch (e) { console.error('mail send failed', (e as Error).message); return false; }
}
