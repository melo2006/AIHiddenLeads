// Shared branded email shell (2026-11-20, owner ask): every user-facing
// email wears the same house template — the AI Hidden Leads logo at the
// top, the email's own content in the middle, and a compact footer promo
// for the free website demo. Pure string builders with zero imports, so
// Deno edge functions and vitest can both consume this module (unlike
// hostinger-mail.ts, which pulls the denomailer ESM dependency).
//
// Email-client-safe by construction: table-based layout, inline styles
// only, dark text on white. The promo block always sits BELOW the main
// content (and below the email's own action button) so transactional
// mail stays transactional.

export const EMAIL_SITE_URL = 'https://aihiddenleads.com';
// The logo asset the live site itself serves (public/logo.png).
export const EMAIL_LOGO_URL = `${EMAIL_SITE_URL}/logo.png`;
// Aspen's face beside the footer promo (owner ask, 2026-11-20: 'a little
// Aspen face next to the demo… more personable'). A stable public/ asset
// the live site serves (public/aspen-face.jpg, cropped from the canonical
// portrait), so the URL never changes across deploys.
export const EMAIL_ASPEN_FACE_URL = `${EMAIL_SITE_URL}/aspen-face.jpg`;
export const EMAIL_DEMO_URL = `${EMAIL_SITE_URL}/demo`;
export const EMAIL_CONTACT = 'info@aihiddenleads.com';

export const EMAIL_GREEN = '#10B981';
export const EMAIL_INK = '#0f172a';
export const EMAIL_MUTED = '#475569';

export const PROMO_SLOGAN = 'Never miss a call — or a lead — again.';
export const PROMO_PITCH =
  'See your own AI video avatar — a voice receptionist with video — live on your website, free. ' +
  'Just enter your website address, your name and your email, and we\u2019ll show your own avatar ' +
  'running on your site in under 2 minutes. No credit card required.';
export const PROMO_CTA_LABEL = 'Try it free on your website';

export const escHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Plain-text version of the footer promo block (for text email parts). */
export function emailPromoText(): string {
  return [
    '—',
    PROMO_SLOGAN,
    PROMO_PITCH,
    `${PROMO_CTA_LABEL}: ${EMAIL_DEMO_URL}`,
  ].join('\n');
}

/** HTML footer promo block: Aspen's face + slogan + free-demo pitch + demo button. */
export function emailPromoHtml(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;background:#ecfdf5;border-radius:10px"><tr><td style="padding:16px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:top;width:84px"><img src="${EMAIL_ASPEN_FACE_URL}" alt="Aspen, your AI spokesperson" width="72" height="72" style="width:72px;height:72px;border:0;display:block;border-radius:10px"></td>
<td style="vertical-align:top">
<div style="font-size:15px;font-weight:800;color:${EMAIL_INK};margin:0 0 6px">${escHtml(PROMO_SLOGAN)}</div>
<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${EMAIL_INK}">${escHtml(PROMO_PITCH)}</p>
<a href="${EMAIL_DEMO_URL}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:${EMAIL_GREEN};color:#ffffff;font-weight:700;font-size:14px;text-decoration:none">${escHtml(PROMO_CTA_LABEL)}</a>
</td></tr></table>
</td></tr></table>`;
}

/** HTML brand header row: logo + wordmark, green rule underneath. */
export function emailHeaderHtml(): string {
  return `<tr><td style="background:#ffffff;padding:10px 16px;border-bottom:3px solid ${EMAIL_GREEN}">
<a href="${EMAIL_SITE_URL}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><img src="${EMAIL_LOGO_URL}" alt="AI Hidden Leads" width="36" height="36" style="width:36px;height:36px;border:0;display:block"></td><td style="vertical-align:middle;padding-left:8px;font-size:20px;line-height:24px;font-weight:800;color:${EMAIL_INK};letter-spacing:-.3px">AI Hidden <span style="color:${EMAIL_GREEN}">Leads</span></td></tr></table></a>
</td></tr>`;
}

export interface EmailShellOptions {
  /** Hidden inbox preview line. */
  preheader: string;
  /** Optional bold title rendered at the top of the content area. */
  title?: string;
  /** The email's own content HTML (already built/escaped by the caller). */
  bodyHtml: string;
  /** Show the footer promo block (default true — user-facing mail). */
  promo?: boolean;
  /** Optional extra footer note (e.g. an opt-out line), rendered as text. */
  footerNote?: string;
}

/**
 * Wrap content HTML in the full branded shell document: header logo,
 * content, optional promo block, and the brand footer band.
 */
export function wrapEmailHtml(o: EmailShellOptions): string {
  const promo = o.promo !== false;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<span style="display:none;max-height:0;overflow:hidden">${escHtml(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;width:100%"><tr><td align="center" style="padding:8px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
${emailHeaderHtml()}
<tr><td style="padding:12px 16px 4px">
${o.title ? `<div style="margin:0 0 10px;font-size:20px;line-height:26px;font-weight:800;color:${EMAIL_INK}">${escHtml(o.title)}</div>\n` : ''}${o.bodyHtml}
${promo ? emailPromoHtml() : ''}
</td></tr>
<tr><td style="padding:18px 24px;background:#f8fafc;color:${EMAIL_MUTED};font-size:12px;line-height:1.5">
<strong style="color:${EMAIL_INK}">AI Hidden Leads</strong> · <a href="${EMAIL_SITE_URL}" style="color:#2563eb;text-decoration:underline">aihiddenleads.com</a> · <a href="mailto:${EMAIL_CONTACT}" style="color:#2563eb;text-decoration:underline">${EMAIL_CONTACT}</a>${o.footerNote ? `<br><br>${escHtml(o.footerNote)}` : ''}
</td></tr></table></td></tr></table></body></html>`;
}
