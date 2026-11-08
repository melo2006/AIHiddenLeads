import { sha256 } from './demo-share.ts';

export { sha256 };

/**
 * Cold-email invite links (2026-11-08).
 *
 * A prospect whose website demo was pre-built ahead of time gets a short
 * personal link: https://aihiddenleads.com/demo/<website-slug>/<code>.
 * The slug is the prospect's own website host (readable, nothing to hide);
 * the code is the secret — only its SHA-256 hash is ever stored (same
 * pattern as demo_verification_codes and voice_demo_shares). Campaign and
 * source live on the invite row, never in URL parameters, so attribution
 * is recovered server-side from the link itself.
 */

// ---------------------------------------------------------------------------
// Slug (the prospect's website host, normalized)
// ---------------------------------------------------------------------------

/**
 * Normalize a website URL or bare host into the invite slug: the lowercase
 * host with scheme, credentials, port, path and a leading "www." removed.
 * Returns null for anything that is not a plausible public host.
 */
export function inviteSlugForWebsite(raw: string): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (!host) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(host)) host = `https://${host}`;
  let parsed: URL;
  try {
    parsed = new URL(host);
  } catch {
    return null;
  }
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('www.')) hostname = hostname.slice(4);
  if (!hostname || !hostname.includes('.')) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(hostname)) return null;
  if (/(^|\.)(localhost|local|internal|test|invalid)$/.test(hostname)) return null;
  if (/^\d+(\.\d+){3}$/.test(hostname)) return null;
  return hostname;
}

/** A slug arriving from the URL path must already be in normalized form. */
export function normalizeInviteSlug(raw: string): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const slug = inviteSlugForWebsite(decoded);
  return slug === decoded.trim().toLowerCase() ? slug : null;
}

// ---------------------------------------------------------------------------
// Invite code (the secret segment)
// ---------------------------------------------------------------------------

/** Unambiguous lowercase alphabet: no l/1/i, no 0/o — safe to read aloud or retype. */
export const INVITE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const INVITE_CODE_LENGTH = 10;
const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
  return code;
}

export function isInviteCode(value: unknown): value is string {
  return typeof value === 'string' && INVITE_CODE_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Pre-build quality gate (mirrors src/lib/demoInvite.ts)
// ---------------------------------------------------------------------------

/** Scan statuses that mean the pre-build finished. 'failed' is terminal too, but a failed build is never invite-ready. */
export const INVITE_READY_SCAN_STATUSES: ReadonlySet<string> = new Set(['completed', 'enriched']);

/** Minimum learned-content size for the "already built" claim to be honest (the pre-build pipeline's own bar). */
export const INVITE_MIN_CONTENT_CHARS = 200;

/**
 * The generated placeholder screenshot is a data: SVG (the scan pipeline's
 * fallback when neither Browserless nor Firecrawl produced a real capture).
 * This is the same signal DemoSite itself uses for isGeneratedScreenshot.
 */
export function isGeneratedPlaceholderScreenshot(screenshot: unknown): boolean {
  return typeof screenshot === 'string' && screenshot.startsWith('data:image/svg+xml');
}

export interface InviteLeadShape {
  scan_status?: string | null;
  website_content?: string | null;
  website_screenshot?: string | null;
}

/** True only when the pre-build genuinely finished with real content and a real screenshot. */
export function isInviteLeadReady(lead: InviteLeadShape): boolean {
  if (!lead || !INVITE_READY_SCAN_STATUSES.has(String(lead.scan_status || ''))) return false;
  if ((lead.website_content || '').length < INVITE_MIN_CONTENT_CHARS) return false;
  if (!lead.website_screenshot || isGeneratedPlaceholderScreenshot(lead.website_screenshot)) return false;
  return true;
}
