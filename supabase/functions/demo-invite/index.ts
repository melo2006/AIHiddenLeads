import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  generateInviteCode,
  inviteSlugForWebsite,
  isInviteCode,
  isInviteLeadReady,
  normalizeInviteSlug,
  sha256,
} from '../_shared/demo-invite.ts';

/**
 * Cold-email invite links: resolve + create.
 *
 * resolve (browser, no auth — the code in the link is the credential):
 *   { action: 'resolve', slug, code } -> the pre-built lead payload when
 *   the link is genuine AND the pre-build genuinely finished (terminal
 *   scan, real content, real screenshot). A successful resolve stamps
 *   the arrival: open counters on the invite row and, on first arrival,
 *   invite_channel / invite_arrived_at on the lead — the invited
 *   prospect's email proof, deliberately distinct from the public gate's
 *   verified flags. Any failure returns ok:false and the client silently
 *   falls back to the public /demo form with the website prefilled.
 *
 * create (driver only — requires the service-role bearer):
 *   { action: 'create', leadId, campaign?, source? } -> mints a link for
 *   a pre-built lead and returns { slug, code, path }. Only the code's
 *   SHA-256 hash is stored; the raw code exists only in this response
 *   (and then in the email itself).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ResolveSchema = z.object({
  action: z.literal('resolve'),
  slug: z.string().min(3).max(253),
  code: z.string().min(1).max(64),
});

const CreateSchema = z.object({
  action: z.literal('create'),
  leadId: z.string().uuid(),
  campaign: z.string().min(1).max(100).optional(),
  source: z.string().min(1).max(100).optional(),
});

/** The lead field set get_demo_lead returns, so the client maps it identically. */
const LEAD_FIELDS =
  'id, updated_at, full_name, business_name, email, phone, niche, website_url, website_screenshot, screenshot_tablet, screenshot_mobile, website_title, website_description, website_content, brand_colors, brand_logo, scan_status, invite_arrived_at';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof (body as { action?: unknown }).action !== 'string') {
      return jsonResponse({ ok: false, error: 'invalid_request' }, 400);
    }

    const action = (body as { action: string }).action;

    // ------------------------------------------------------------------
    // resolve
    // ------------------------------------------------------------------
    if (action === 'resolve') {
      const parsed = ResolveSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ ok: false, error: 'invalid_request' }, 400);
      }
      const slug = normalizeInviteSlug(parsed.data.slug);
      const code = parsed.data.code.trim().toLowerCase();
      if (!slug || !isInviteCode(code)) {
        return jsonResponse({ ok: false, error: 'invite_not_found' }, 404);
      }

      const tokenHash = await sha256(code);
      const { data: invite, error: inviteError } = await supabase
        .from('demo_invites')
        .select('id, lead_id, campaign, source, first_opened_at, open_count')
        .eq('slug', slug)
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (inviteError || !invite) {
        return jsonResponse({ ok: false, error: 'invite_not_found' }, 404);
      }

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select(LEAD_FIELDS)
        .eq('id', invite.lead_id)
        .maybeSingle();

      if (leadError || !lead) {
        return jsonResponse({ ok: false, error: 'invite_not_found' }, 404);
      }

      // The "already built" promise must be true: a pre-build that failed,
      // never finished, learned too little, or only produced the generated
      // placeholder image never resolves — the visitor falls back to the
      // standard public demo instead of a broken invite.
      if (!isInviteLeadReady(lead)) {
        return jsonResponse({ ok: false, error: 'demo_not_ready' }, 409);
      }

      // Arrival bookkeeping: every open counts on the invite row; the
      // FIRST arrival is also stamped on the lead (channel + timestamp),
      // distinct from the public gate's verified flags.
      const nowIso = new Date().toISOString();
      await supabase
        .from('demo_invites')
        .update({
          open_count: (invite.open_count ?? 0) + 1,
          last_opened_at: nowIso,
          ...(invite.first_opened_at ? {} : { first_opened_at: nowIso }),
        })
        .eq('id', invite.id);

      if (!lead.invite_arrived_at) {
        await supabase
          .from('leads')
          .update({ invite_channel: 'email-link', invite_arrived_at: nowIso })
          .eq('id', lead.id);
      }

      return jsonResponse({
        ok: true,
        campaign: invite.campaign ?? null,
        source: invite.source ?? null,
        lead,
      });
    }

    // ------------------------------------------------------------------
    // create (driver only)
    // ------------------------------------------------------------------
    if (action === 'create') {
      const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!bearer || bearer !== serviceRoleKey) {
        return jsonResponse({ ok: false, error: 'forbidden' }, 403);
      }
      const parsed = CreateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ ok: false, error: 'invalid_request' }, 400);
      }
      const { leadId, campaign, source } = parsed.data;

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, website_url')
        .eq('id', leadId)
        .maybeSingle();

      if (leadError || !lead) {
        return jsonResponse({ ok: false, error: 'lead_not_found' }, 404);
      }

      const slug = inviteSlugForWebsite(lead.website_url || '');
      if (!slug) {
        return jsonResponse({ ok: false, error: 'invalid_website' }, 400);
      }

      const code = generateInviteCode();
      const tokenHash = await sha256(code);
      const { error: insertError } = await supabase
        .from('demo_invites')
        .insert({
          lead_id: leadId,
          slug,
          token_hash: tokenHash,
          campaign: campaign ?? null,
          source: source ?? null,
        });

      if (insertError) {
        console.error('demo-invite: failed to insert invite', insertError);
        return jsonResponse({ ok: false, error: 'internal' }, 500);
      }

      return jsonResponse({ ok: true, slug, code, path: `/demo/${slug}/${code}` });
    }

    return jsonResponse({ ok: false, error: 'unknown_action' }, 400);
  } catch (error: unknown) {
    console.error('demo-invite error:', error);
    return jsonResponse({ ok: false, error: 'internal' }, 500);
  }
});
