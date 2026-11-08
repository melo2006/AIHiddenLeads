import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { DemoLeadData } from '@/components/landing/demo-results/demoResultsUtils';

/**
 * Client helpers for cold-email invite links (2026-11-08).
 *
 * An invited prospect's link is https://aihiddenleads.com/demo/<slug>/<code>
 * where the slug is their own website host and the code is the secret.
 * The `demo-invite` edge function owns resolution (it validates the code
 * against the stored hash, applies the pre-build quality gate, and stamps
 * the arrival server-side). This module holds the pure pieces — slug
 * normalization, code shape, link building, the readiness predicate and
 * response parsing — so they can be unit tested without a network, plus
 * one never-throwing resolve call. The server mirrors these rules in
 * supabase/functions/_shared/demo-invite.ts; keep the two in step.
 */

// ---------------------------------------------------------------------------
// Slug (the prospect's website host, normalized) — mirrors the server copy
// ---------------------------------------------------------------------------

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

export const INVITE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const INVITE_CODE_LENGTH = 10;
const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

export function isInviteCode(value: unknown): value is string {
  return typeof value === 'string' && INVITE_CODE_PATTERN.test(value);
}

/** The visible link path: short and readable, no query strings, no UTM tails. */
export function buildInvitePath(slug: string, code: string): string {
  return `/demo/${slug}/${code}`;
}

// ---------------------------------------------------------------------------
// Pre-build quality gate (mirrors the server predicate)
// ---------------------------------------------------------------------------

export const INVITE_READY_SCAN_STATUSES: ReadonlySet<string> = new Set(['completed', 'enriched']);
export const INVITE_MIN_CONTENT_CHARS = 200;

export function isGeneratedPlaceholderScreenshot(screenshot: unknown): boolean {
  return typeof screenshot === 'string' && screenshot.startsWith('data:image/svg+xml');
}

export interface InviteLeadShape {
  scan_status?: string | null;
  website_content?: string | null;
  website_screenshot?: string | null;
}

export function isInviteLeadReady(lead: InviteLeadShape): boolean {
  if (!lead || !INVITE_READY_SCAN_STATUSES.has(String(lead.scan_status || ''))) return false;
  if ((lead.website_content || '').length < INVITE_MIN_CONTENT_CHARS) return false;
  if (!lead.website_screenshot || isGeneratedPlaceholderScreenshot(lead.website_screenshot)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Resolve (edge-function plumbing, never throws)
// ---------------------------------------------------------------------------

export interface InviteLeadRecord {
  id: string;
  updated_at?: string | null;
  full_name?: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  niche?: string | null;
  website_url?: string | null;
  website_screenshot?: string | null;
  screenshot_tablet?: string | null;
  screenshot_mobile?: string | null;
  website_title?: string | null;
  website_description?: string | null;
  website_content?: string | null;
  brand_colors?: unknown;
  brand_logo?: string | null;
  scan_status?: string | null;
}

export type ResolveInviteResult =
  | { ok: true; lead: InviteLeadRecord; campaign: string | null; source: string | null }
  | { ok: false; error: string; status?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asBrandColors(value: unknown): Record<string, string | undefined> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string | undefined>)
    : undefined;
}

/** Parse a demo-invite resolve body (success or failure) into a typed result. Pure. */
export function parseResolveInviteData(data: unknown): ResolveInviteResult {
  if (!isRecord(data)) return { ok: false, error: 'invite_failed' };
  if (data.ok !== true) {
    return { ok: false, error: typeof data.error === 'string' && data.error ? data.error : 'invite_failed' };
  }
  const lead = data.lead;
  if (!isRecord(lead) || typeof lead.id !== 'string' || !lead.id) {
    return { ok: false, error: 'invite_failed' };
  }
  return {
    ok: true,
    lead: lead as unknown as InviteLeadRecord,
    campaign: typeof data.campaign === 'string' ? data.campaign : null,
    source: typeof data.source === 'string' ? data.source : null,
  };
}

/** Map the resolved lead record into the DemoLeadData DemoSite consumes. Pure. */
export function inviteLeadToDemoData(lead: InviteLeadRecord): DemoLeadData {
  return {
    leadId: lead.id,
    previewVersion: lead.updated_at || undefined,
    scanStatus: lead.scan_status || undefined,
    fullName: lead.full_name || '',
    businessName: lead.business_name || undefined,
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    niche: lead.niche || 'general',
    websiteUrl: lead.website_url || '',
    screenshot: lead.website_screenshot || undefined,
    screenshotTablet: lead.screenshot_tablet || undefined,
    screenshotMobile: lead.screenshot_mobile || undefined,
    title: lead.website_title || '',
    description: lead.website_description || '',
    websiteContent: lead.website_content || '',
    colors: asBrandColors(lead.brand_colors) || {},
    logo: lead.brand_logo || '',
  };
}

async function readErrorDetail(error: unknown): Promise<Record<string, unknown> | null> {
  if (!isRecord(error)) return null;
  const context: unknown = (error as { context?: unknown }).context;
  if (!context) return null;
  if (typeof context === 'string') {
    try {
      const parsed: unknown = JSON.parse(context);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (isRecord(context)) {
    const jsonFn = (context as { json?: unknown }).json;
    if (typeof jsonFn === 'function') {
      try {
        const cloneFn = (context as { clone?: unknown }).clone;
        const source = typeof cloneFn === 'function' ? (cloneFn.call(context) as typeof context) : context;
        const parsed: unknown = await (jsonFn as () => Promise<unknown>).call(source);
        return isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return context;
  }
  return null;
}

export async function resolveDemoInvite(slug: string, code: string): Promise<ResolveInviteResult> {
  try {
    const { data, error } = await supabase.functions.invoke('demo-invite', {
      body: { action: 'resolve', slug, code },
    });
    if (error) {
      const detail = await readErrorDetail(error);
      let status: number | undefined;
      if (error instanceof FunctionsHttpError) {
        const rawStatus = (error.context as { status?: unknown } | undefined)?.status;
        if (typeof rawStatus === 'number' && Number.isFinite(rawStatus)) status = rawStatus;
      }
      return {
        ok: false,
        error: typeof detail?.error === 'string' && detail.error ? detail.error : 'invite_failed',
        ...(status !== undefined ? { status } : {}),
      };
    }
    return parseResolveInviteData(data);
  } catch {
    return { ok: false, error: 'invite_failed' };
  }
}
