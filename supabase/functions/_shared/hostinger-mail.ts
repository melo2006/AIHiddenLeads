import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// Owner-mailbox sending through Hostinger SMTP (portable, no DNS delegation needed).
export const OWNER_MAILBOX = 'info@aihiddenleads.com';

export async function sendOwnerMail(opts: { to: string; subject: string; text: string; html?: string }) {
  const password = Deno.env.get('HOSTINGER_SMTP_PASSWORD');
  if (!password) throw new Error('Mailbox password is not configured');
  const client = new SMTPClient({
    connection: { hostname: 'smtp.hostinger.com', port: 465, tls: true, auth: { username: OWNER_MAILBOX, password } },
  });
  try {
    await client.send({ from: `AI Hidden Leads <${OWNER_MAILBOX}>`, to: opts.to, subject: opts.subject, content: opts.text, html: opts.html });
  } finally {
    await client.close();
  }
}
