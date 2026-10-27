import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// Owner-mailbox sending through Hostinger SMTP (portable, no DNS delegation needed).
export const OWNER_MAILBOX = 'info@aihiddenleads.com';
const SITE = 'https://aihiddenleads.com';
const LOGO = `${SITE}/logo.png`;
const ASPEN = `${SITE}/email/aspen.jpg`;
const OPT_OUT = 'You received this because you asked AI Hidden Leads to follow up. Reply STOP or "unsubscribe" to this email and we will not contact you again.';

type Mail = { to: string; subject: string; text: string; html?: string };

export async function sendOwnerMail(opts: Mail) {
  const password = Deno.env.get('HOSTINGER_SMTP_PASSWORD');
  if (!password) throw new Error('Mailbox password is not configured');
  const client = new SMTPClient({
    connection: { hostname: 'smtp.hostinger.com', port: 465, tls: true, auth: { username: OWNER_MAILBOX, password } },
  });
  try {
    await client.send({ from: `AI Hidden Leads <${OWNER_MAILBOX}>`, to: opts.to, replyTo: OWNER_MAILBOX, subject: opts.subject, content: opts.text, ...(opts.html ? { html: opts.html } : {}) });
  } finally {
    await client.close();
  }
}

// ---------- HTML building blocks (inline styles only; white body for every client) ----------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const GREEN = '#10B981', INK = '#0f172a', MUTED = '#475569', LINK = '#2563eb';
const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:${LINK};text-decoration:underline">${esc(label)}</a>`;
const button = (href: string, label: string, primary = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;${primary ? `background:${GREEN};color:#ffffff` : `background:#ffffff;color:${GREEN};border:2px solid ${GREEN}`}">${esc(label)}</a>`;
const row = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600">${v}</td></tr>`;

function layout(o: { preheader: string; title: string; body: string; footer?: string }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b1220;padding:18px 24px;border-bottom:4px solid ${GREEN}">
<a href="${SITE}" style="text-decoration:none"><img src="${LOGO}" alt="AI Hidden Leads" height="40" style="height:40px;border:0;vertical-align:middle"></a>
</td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${INK}">${esc(o.title)}</h1>
${o.body}
</td></tr>
<tr><td style="padding:18px 24px;background:#f8fafc;color:${MUTED};font-size:12px;line-height:1.5">
<strong style="color:${INK}">AI Hidden Leads</strong> · ${link(SITE, 'aihiddenleads.com')} · ${link(`mailto:${OWNER_MAILBOX}`, OWNER_MAILBOX)}${o.footer ? `<br><br>${esc(o.footer)}` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${s}</p>`;

const ADVANTAGES = [
  ['Never miss a caller', 'Aspen answers every call and chat, day or night, so leads stop going to voicemail.'],
  ['Sounds natural', 'A friendly 2026-era voice that knows your services, hours and prices.'],
  ['Leads, not just answers', 'Plans include fresh B2B prospects every month, starting with 50 on Essentials.'],
  ['Get found locally', 'See how you show up on Google Maps across your area, not just from one address.'],
  ['Try it free first', 'Hear Aspen talk about your own business with just your website address.'],
];
const advantagesBlock = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;background:#ecfdf5;border-radius:10px"><tr><td style="padding:16px 18px">
<div style="font-size:13px;font-weight:700;color:${GREEN};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Why businesses add Aspen</div>
${ADVANTAGES.map(([h, d]) => `<div style="margin:8px 0;font-size:14px;line-height:1.5;color:${INK}"><span style="color:${GREEN};font-weight:700">&#10003;</span> <strong>${esc(h)}.</strong> ${esc(d)}</div>`).join('')}
</td></tr></table>`;

// Their real website screenshot with Aspen's launcher shown in the lower-right corner.
// Uses a background image with an image fallback, because email clients do not support overlays.
const sitePreview = (shot: string, biz: string) => `<div style="font-size:13px;font-weight:700;color:${MUTED};margin:6px 0 8px">Here's how ${esc(biz || 'your website')} could look with Aspen:</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden">
<tr><td background="${esc(shot)}" height="300" valign="bottom" align="right" style="height:300px;background-image:url('${esc(shot)}');background-size:cover;background-position:top center;padding:14px">
<table role="presentation" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.25)"><tr>
<td style="padding:10px 6px 10px 10px"><img src="${ASPEN}" width="44" height="44" alt="Aspen" style="width:44px;height:44px;border-radius:22px;border:2px solid ${GREEN};display:block"></td>
<td style="padding:10px 14px 10px 4px;font-size:13px;color:${INK}"><strong>Ask Aspen</strong><br><span style="color:${MUTED};font-size:12px">Chat or talk &#127908;</span></td>
</tr></table></td></tr></table>`;

type Contact = { name: string; email: string; phone?: string; businessName?: string };
const et = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' }) + ' Eastern';
const first = (n: string) => n.trim().split(' ')[0] || 'there';
const isHttp = (u?: string | null) => !!u && /^https:\/\//.test(u);

export const bookingAlert = (c: Contact & { slotStart: string; notes?: string }): Mail => ({
  to: OWNER_MAILBOX,
  subject: `New call booked: ${c.name} – ${et(c.slotStart)}`,
  text: `A visitor booked a call with AI Hidden Leads.\n\nWhen: ${et(c.slotStart)}\nName: ${c.name}\nEmail: ${c.email}\nPhone: ${c.phone || 'not given'}\nBusiness: ${c.businessName || 'not given'}\nNotes: ${c.notes || 'none'}\n\nThe event is on your Google Calendar.`,
  html: layout({ preheader: `${c.name} booked ${et(c.slotStart)}`, title: '📅 New call booked', body:
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${row('When', esc(et(c.slotStart)))}${row('Name', esc(c.name))}${row('Email', link(`mailto:${c.email}`, c.email))}${row('Phone', c.phone ? link(`tel:${c.phone}`, c.phone) : 'not given')}${row('Business', esc(c.businessName || 'not given'))}${row('Notes', esc(c.notes || 'none'))}</table>`
    + p('The event is already on your Google Calendar.') + button(`${SITE}/dashboard/calls`, 'Open dashboard') }),
});

export const bookingConfirmation = (c: Contact & { slotStart: string }): Mail => ({
  to: c.email,
  subject: `You're booked: AI Hidden Leads call – ${et(c.slotStart)}`,
  text: `Hi ${first(c.name)},\n\nYour 15–20 minute call with AI Hidden Leads is booked for ${et(c.slotStart)}.\nWe'll call you${c.phone ? ` at ${c.phone}` : ''}. Need to change it? Just reply to this email.\n\nTry Aspen on your website before the call: ${SITE}/demo\n\n${OPT_OUT}`,
  html: layout({ preheader: `Your call is booked for ${et(c.slotStart)}`, title: `You're booked, ${first(c.name)}!`, footer: OPT_OUT, body:
    p(`Your 15–20 minute call with an AI Hidden Leads specialist is set for:`)
    + `<div style="margin:0 0 16px;padding:14px 16px;border-left:4px solid ${GREEN};background:#f8fafc;font-size:16px;font-weight:700;color:${INK}">${esc(et(c.slotStart))}</div>`
    + p(`We'll reach you${c.phone ? ` at ${esc(c.phone)}` : ''}. Need a different time? Just reply to this email.`)
    + advantagesBlock() + button(`${SITE}/demo`, 'Try Aspen on your website') }),
});

export const followupAlert = (c: Contact): Mail => ({
  to: OWNER_MAILBOX,
  subject: `Follow-up requested: ${c.name}`,
  text: `A visitor confirmed their details on screen and asked AI Hidden Leads to follow up.\n\nName: ${c.name}\nEmail: ${c.email}\nPhone: ${c.phone || 'not given'}\nBusiness/demo: ${c.businessName || 'not given'}`,
  html: layout({ preheader: `${c.name} wants a follow-up`, title: '🔔 Follow-up requested', body:
    p('A visitor confirmed their details on screen and asked you to follow up.')
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${row('Name', esc(c.name))}${row('Email', link(`mailto:${c.email}`, c.email))}${row('Phone', c.phone ? link(`tel:${c.phone}`, c.phone) : 'not given')}${row('Business / demo', esc(c.businessName || 'not given'))}</table>`
    + button(`mailto:${c.email}`, 'Reply to visitor') + button(`${SITE}/dashboard/calls`, 'Open dashboard', false) }),
});

export const visitorFollowup = (c: Contact & { screenshot?: string | null; didDemo?: boolean }): Mail => {
  const demo = c.didDemo && isHttp(c.screenshot);
  return {
    to: c.email,
    subject: demo ? `Your website with Aspen – ${c.businessName || 'AI Hidden Leads'}` : 'Thanks for talking with Aspen – AI Hidden Leads',
    text: `Hi ${first(c.name)},\n\nThanks for trying Aspen. As you asked, someone from AI Hidden Leads will follow up with you shortly.\n\nWant to pick a time now? ${SITE}/book\nTry Aspen on your own website: ${SITE}/demo\nStart now from $99/month: ${SITE}/#pricing\n\nJust reply to this email with any questions.\n\n— AI Hidden Leads\n\n${OPT_OUT}`,
    html: layout({ preheader: demo ? 'See your website with a 24/7 AI receptionist' : 'Thanks for talking with Aspen', title: `Thanks, ${first(c.name)}!`, footer: OPT_OUT, body:
      p(demo
        ? `You just heard Aspen talk about ${esc(c.businessName || 'your business')}. As you asked, someone from our team will follow up with you shortly.`
        : 'Thanks for talking with Aspen. As you asked, someone from our team will follow up with you shortly.')
      + (demo ? sitePreview(c.screenshot!, c.businessName || '') : '')
      + p("While your competitors send callers to voicemail, Aspen picks up every time. Here's what you get:")
      + advantagesBlock()
      + `<div style="margin:0 0 16px">${button(`${SITE}/book`, 'Book a quick call')}${demo ? '' : button(`${SITE}/demo`, 'Try your website free', false)}${button(`${SITE}/#pricing`, 'Start from $99/mo', false)}</div>`
      + p(`Questions? Just reply to this email or write to ${link(`mailto:${OWNER_MAILBOX}`, OWNER_MAILBOX)}.`) }),
  };
};

export const dailySummary = (s: { day: string; visits: number; scans: number; voiceCalls: number; followups: string[]; bookings: string[] }): Mail => {
  const stat = (n: number, l: string) => `<td align="center" style="padding:14px 6px;background:#f8fafc;border-radius:8px"><div style="font-size:26px;font-weight:800;color:${GREEN}">${n}</div><div style="font-size:12px;color:${MUTED}">${esc(l)}</div></td>`;
  const list = (items: string[]) => items.length ? `<ul style="margin:0 0 16px;padding-left:20px">${items.map(i => `<li style="margin:4px 0;font-size:14px;color:${INK}">${esc(i)}</li>`).join('')}</ul>` : p(`<span style="color:${MUTED}">None</span>`);
  return {
    to: OWNER_MAILBOX,
    subject: `AI Hidden Leads daily summary – ${s.day}`,
    text: `Summary for the last 24 hours (${s.day}):\n\nSite visits: ${s.visits}\nWebsite demos started: ${s.scans}\nVoice conversations: ${s.voiceCalls}\n\nFollow-up requests (${s.followups.length}):\n${s.followups.map(f => '- ' + f).join('\n') || '- none'}\n\nBooked calls (${s.bookings.length}):\n${s.bookings.map(b => '- ' + b).join('\n') || '- none'}\n\nFull details: ${SITE}/dashboard`,
    html: layout({ preheader: `${s.voiceCalls} conversations, ${s.followups.length} follow-ups, ${s.bookings.length} bookings`, title: `Daily summary · ${s.day}`, body:
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 0 18px"><tr>${stat(s.visits, 'Site visits')}${stat(s.scans, 'Demos started')}${stat(s.voiceCalls, 'Voice chats')}</tr></table>`
      + `<h2 style="font-size:16px;margin:0 0 6px;color:${INK}">Follow-up requests (${s.followups.length})</h2>${list(s.followups)}`
      + `<h2 style="font-size:16px;margin:0 0 6px;color:${INK}">Booked calls (${s.bookings.length})</h2>${list(s.bookings)}`
      + button(`${SITE}/dashboard/campaign-results`, 'Open Campaign Results') }),
  };
};

// Never let an email failure break the user-facing action.
export async function trySend(mail: Mail) {
  try { await sendOwnerMail(mail); return true; } catch (e) { console.error('mail send failed', (e as Error).message); return false; }
}
