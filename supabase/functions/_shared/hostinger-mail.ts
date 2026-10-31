import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// Owner-mailbox sending through Hostinger SMTP (portable, no DNS delegation needed).
export const OWNER_MAILBOX = 'info@aihiddenleads.com';
const SITE = 'https://aihiddenleads.com';
const LOGO = `${SITE}/logo.png`;
const ASPEN = 'https://gvlmpywrrovbncdhklfq.supabase.co/storage/v1/object/public/website-screenshots/email%2Faspen.jpg';
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;width:100%"><tr><td align="center" style="padding:8px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<tr><td style="background:#ffffff;padding:10px 16px;border-bottom:3px solid ${GREEN}">
<a href="${SITE}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><img src="${LOGO}" alt="" width="36" height="36" style="width:36px;height:36px;border:0;display:block"></td><td style="vertical-align:middle;padding-left:8px;font-size:20px;line-height:24px;font-weight:800;color:${INK};letter-spacing:-.3px">AI Hidden <span style="color:${GREEN}">Leads</span></td></tr></table></a>
</td></tr>
<tr><td style="padding:12px 16px 4px">
<div style="margin:0 0 10px;font-size:20px;line-height:26px;font-weight:800;color:${INK}">${esc(o.title)}</div>
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
  ['Leads, not just answers', 'Plans include fresh B2B prospects every month, starting with 50 on Premium.'],
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

export type Outcome = 'hung_up' | 'dropped' | 'no_speech' | 'completed';
export const OUTCOME_LABEL: Record<Outcome, string> = { hung_up: 'Visitor hung up', dropped: 'Connection dropped', no_speech: 'Left without speaking', completed: 'Conversation ended' };
// Classifies how a conversation ended from the recorded end reason and how much the visitor spoke.
export const endOutcome = (reason: string | undefined, seconds: number, callerTurns: number): Outcome => {
  if (!callerTurns) return 'no_speech';
  if (reason === 'connection_closed' || reason === 'error' || reason === 'provider_error') return 'dropped';
  if (reason === 'user_ended') return 'hung_up';
  return seconds > 0 ? 'completed' : 'dropped';
};
export type SummaryConversation = { name: string; business: string; contact: string; minutes: number; seconds?: number; score: number | null; interests: string[]; summary: string | null; outcome: Outcome; followup: boolean };
export const leadTier = (score: number | null) => score == null ? { label: 'No speech', color: '#64748b', bg: '#f1f5f9' } : score >= 60 ? { label: 'Hot', color: '#b91c1c', bg: '#fee2e2' } : score >= 30 ? { label: 'Warm', color: '#b45309', bg: '#fef3c7' } : { label: 'Cool', color: '#1d4ed8', bg: '#dbeafe' };
const dur = (c: SummaryConversation) => c.seconds != null ? (c.seconds < 60 ? `${c.seconds}s` : `${Math.round(c.seconds / 60)} min`) : `${c.minutes} min`;

export const dailySummary = (s: { day: string; visits: number; scans: number; voiceCalls: number; followups: string[]; bookings: string[]; conversations?: SummaryConversation[] }): Mail => {
  const all = [...(s.conversations || [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const convs = all.filter(c => c.outcome !== 'no_speech');
  const tally = (o: Outcome) => all.filter(c => c.outcome === o).length;
  const hot = convs.filter(c => (c.score ?? 0) >= 60 || c.followup);
  const stat = (n: number, l: string) => `<td align="center" width="25%" style="padding:8px 2px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:22px;line-height:26px;font-weight:800;color:${GREEN}">${n}</div><div style="font-size:12px;color:${MUTED}">${esc(l)}</div></td>`;
  const list = (items: string[]) => items.length ? `<ul style="margin:0 0 16px;padding-left:20px">${items.map(i => `<li style="margin:4px 0;font-size:15px;color:${INK}">${esc(i)}</li>`).join('')}</ul>` : p(`<span style="color:${MUTED}">None</span>`);
  const card = (c: SummaryConversation) => { const t = leadTier(c.score); return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e2e8f0;border-left:4px solid ${t.color};border-radius:8px"><tr><td style="padding:10px 12px">
<div style="font-size:15px;font-weight:700;color:${INK}">${esc(c.name)}${c.business ? ` <span style="color:${MUTED};font-weight:400">· ${esc(c.business)}</span>` : ''}
<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;background:${t.bg};color:${t.color}">${t.label}${c.score != null ? ` ${c.score}` : ''}</span>${c.followup ? ` <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;background:#d1fae5;color:#047857">Asked for follow-up</span>` : ''}</div>
<div style="font-size:13px;color:${MUTED};margin:3px 0">${dur(c)} · ${OUTCOME_LABEL[c.outcome]}${c.contact ? ` · ${esc(c.contact)}` : ''}${c.interests.length ? ` · Interested in: <strong style="color:${INK}">${esc(c.interests.join(', '))}</strong>` : ''}</div>
<div style="font-size:14px;color:${INK};line-height:1.5">${esc(c.summary || 'No AI summary available (transcript not saved).')}</div>
</td></tr></table>`; };
  const outcomes = `<div style="margin:0 0 14px;padding:10px 12px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.6;color:${INK}"><strong>How ${all.length} conversation${all.length === 1 ? '' : 's'} ended:</strong> ${tally('hung_up')} hung up · ${tally('dropped')} connection dropped (technical) · ${tally('no_speech')} left without speaking${tally('completed') ? ` · ${tally('completed')} ended normally` : ''}</div>`;
  const action = hot.length
    ? `<div style="margin:0 0 18px;padding:14px 16px;background:#ecfdf5;border-left:4px solid ${GREEN};border-radius:8px;font-size:15px;color:${INK};line-height:1.5"><strong>Action today:</strong> follow up with ${hot.length} ${hot.length === 1 ? 'person' : 'people'} — ${esc(hot.slice(0, 3).map(c => c.name).join(', '))}${hot.length > 3 ? ' and more' : ''}.</div>`
    : `<div style="margin:0 0 18px;padding:14px 16px;background:#f8fafc;border-left:4px solid #94a3b8;border-radius:8px;font-size:15px;color:${INK}">No hot leads today. Nothing urgent to do.</div>`;
  return {
    to: OWNER_MAILBOX,
    subject: `${hot.length ? `🔥 ${hot.length} to follow up · ` : ''}AI Hidden Leads daily summary – ${s.day}`,
    text: `Summary for the last 24 hours (${s.day}):\n\nSite visits: ${s.visits}\nWebsite demos started: ${s.scans}\nVoice conversations: ${s.voiceCalls}\n\nConversations:\n${convs.map(c => `- ${c.name} (${c.business || '—'}) ${leadTier(c.score).label}${c.score != null ? ' ' + c.score : ''}, ${c.minutes} min${c.interests.length ? ', interested in ' + c.interests.join(', ') : ''}`).join('\n') || '- none'}\n\nFollow-up requests (${s.followups.length}):\n${s.followups.map(f => '- ' + f).join('\n') || '- none'}\n\nBooked calls (${s.bookings.length}):\n${s.bookings.map(b => '- ' + b).join('\n') || '- none'}\n\nScores are a rule-based engagement indicator, not buying intent.\nFull details: ${SITE}/dashboard`,
    html: layout({ preheader: `${hot.length} to follow up · ${s.voiceCalls} conversations · ${s.bookings.length} bookings`, title: `Daily summary · ${s.day}`, body:
      action
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="4" style="margin:0 0 18px"><tr>${stat(s.visits, 'Site visits')}${stat(s.scans, 'Demos')}${stat(s.voiceCalls, 'Voice chats')}${stat(s.bookings.length, 'Booked')}</tr></table>`
      + `<h2 style="font-size:17px;margin:0 0 8px;color:${INK}">Conversations (${convs.length})</h2>${convs.length ? convs.slice(0, 15).map(card).join('') + (convs.length > 15 ? p(`<span style="color:${MUTED}">+${convs.length - 15} more in the dashboard</span>`) : '') : p(`<span style="color:${MUTED}">None</span>`)}`
      + `<h2 style="font-size:17px;margin:14px 0 6px;color:${INK}">Follow-up requests (${s.followups.length})</h2>${list(s.followups)}`
      + `<h2 style="font-size:17px;margin:0 0 6px;color:${INK}">Booked calls (${s.bookings.length})</h2>${list(s.bookings)}`
      + `<div style="margin:0 0 16px">${button(`${SITE}/dashboard/sessions?tab=calls`, 'Review conversations')}${button(`${SITE}/dashboard/campaign-results`, 'Campaign Results', false)}</div>`
      + `<p style="margin:0 0 10px;font-size:12px;color:${MUTED}">Hot 60+, Warm 30–59, Cool under 30. Scores measure how engaged the caller was and which services they mentioned. They are not a prediction of buying.</p>` }),
  };
};

// Never let an email failure break the user-facing action.
export async function trySend(mail: Mail) {
  try { await sendOwnerMail(mail); return true; } catch (e) { console.error('mail send failed', (e as Error).message); return false; }
}
export const conversationCopy = (c: {name:string;email:string;url:string}): Mail => ({
  to:c.email, subject:'Your Aspen conversation · private transcript and summary',
  text:`Hi ${first(c.name)},\n\nHere is the private conversation copy you requested: ${c.url}\nThe link expires in seven days. Keep it private; anyone with it can read your transcript and AI summary. AI summaries may contain errors.\n\nThis request does not subscribe you to marketing.\n\nAI Hidden Leads`,
  html:layout({preheader:'Your requested conversation copy',title:'Your conversation with Aspen',body:p(`Hi ${esc(first(c.name))}, here is the conversation copy you requested.`)+button(c.url,'View transcript & AI summary')+p('This private link expires in seven days. Anyone with the link can read it, so please do not forward it. AI summaries may contain errors.')+p('This request does not subscribe you to marketing.')})
});
