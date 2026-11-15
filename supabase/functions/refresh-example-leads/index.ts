import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  REALTOR_EXAMPLE_PINNED_LEADS,
  applyPinnedServiceArea,
} from '../_shared/realtor-example-pinned-leads.ts';

// Weekly refresh for the PINNED realtor demo-example leads
// (pinned-example-leads build, 2026-11-13).
//
// Each /agents/realtors example enters its demo through ONE pinned
// leads row whose scan is stored and reused, instead of a fresh
// ~2-minute scan per visitor. This function re-runs scan-website
// IN PLACE on a pinned lead (same lead id, same row — the scan
// overwrites website_content / screenshots / brand fields), so the
// stored knowledge tracks the agent's live site.
//
// website_url is the ONE field a refresh must never move: a pinned
// lead's stored URL stays at the pinned map's value (the business's
// canonical domain) forever — the demo loader keys the pinned reveal
// off it and gemini-session's example-pack lookup matches its
// canonical host. scan-website now skips the website_url write for
// pinned leads, and this function additionally re-asserts the pinned
// map value after every scan it triggers, so the stored URL cannot
// drift from the map even if another write path appears.
//
// Two more pinned facts are re-asserted the same way (Martinez pins
// fix, 2026-11-14), and — unlike a scan outcome — they are asserted
// UNCONDITIONALLY: whether the scan succeeded, walled, or failed
// outright. (1) serviceArea: the stored knowledge's SERVICE AREA
// line(s) are rewritten to the pin's recorded area, so a
// confabulated model answer cannot survive a refresh. (2)
// consentBannerVerified (michael-martinez only): the owner has
// personally witnessed the site's cookie banner live, but the site
// sits behind a Cloudflare bot check that walls the capture
// browsers and the consent probe records null on a wall by design —
// no scan can ever witness the banner, so the stale FALSE on the
// row would otherwise be immortal. The refresh re-asserts
// consent_banner_seen=true after every scan of that pin, including
// scans that recorded nothing.
//
// A third pinned fact is re-asserted the same unconditional way
// (Ray Miramontes fix, 2026-11-15): forceCoveredView
// (ray-miramontes only). His site refuses to load in a real browser
// iframe (verified HTTP 403 / ERR_BLOCKED_BY_RESPONSE) even though
// the embed probe's server-side fetch succeeds, so no probe or scan
// can ever record the refusal — the pin is the record of it. The
// refresh re-asserts force_covered_view=true after every scan of
// that pin, so DemoSite presents the covered screenshot view
// instead of the browser error page the refused iframe lands on.
// It is a presentation fact only: this assertion never touches the
// consent columns, and pins without the flag never touch
// force_covered_view here.
//
// Invocation shape: POST { slug } or { leadId } refreshes ONE pinned
// lead (a single scan can take ~1-2 minutes, so the schedule fires
// one call per lead). POST {} refreshes every pinned lead
// sequentially — manual use only; it can outlast one invocation's
// wall clock, in which case the un-refreshed remainder is reported.
//
// Scheduling (pg_cron + pg_net) is a deploy step documented in
// supabase/migrations/20261113170000_example_leads_refresh.sql — the
// SQL lives there, commented, until EXAMPLE_REFRESH_SECRET is set.
// When that secret is set, callers must present it as the
// x-example-refresh-secret header (the followup-sweep pattern); when
// unset, calls are accepted like the project's other sweeps.

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const secret = Deno.env.get('EXAMPLE_REFRESH_SECRET');
  if (secret && req.headers.get('x-example-refresh-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json({ ok: false, reason: 'server_env_missing' }, 500);

  const db = createClient(supabaseUrl, serviceKey);

  let body: { slug?: string; leadId?: string } = {};
  try { body = await req.json(); } catch { /* empty body = refresh all (manual) */ }

  const targets = REALTOR_EXAMPLE_PINNED_LEADS.filter((entry) =>
    body.leadId ? entry.leadId === body.leadId : body.slug ? entry.slug === body.slug : true,
  );
  if (targets.length === 0) return json({ ok: false, reason: 'no_matching_pinned_lead' }, 404);

  const refreshed: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    const { data: lead, error } = await db
      .from('leads')
      .select('id, website_url, scan_status')
      .eq('id', target.leadId)
      .maybeSingle();
    if (error || !lead) {
      refreshed.push({ slug: target.slug, leadId: target.leadId, ok: false, reason: 'lead_not_found' });
      continue;
    }
    // The scan outcome is captured, not thrown: the pinned-fact
    // assertions below run WHATEVER the scan did — success, a walled
    // or failed scan, even an invoke that never completed. A walled
    // scan is precisely the case the consent pin exists for.
    let scanOk = false;
    let scanHttpStatus: number | null = null;
    let scanFailureReason: string | null = null;
    try {
      // Same invoke body the demo client uses for a fresh scan of this
      // site; keyed by the pinned leadId, so the scan lands on the same
      // row and the example link keeps working throughout.
      const res = await fetch(`${supabaseUrl}/functions/v1/scan-website`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          websiteUrl: lead.website_url || target.url,
          leadId: target.leadId,
          initialNiche: 'general',
          businessName: '',
        }),
      });
      await res.text().catch(() => '');
      scanOk = res.ok;
      scanHttpStatus = res.status;
    } catch (e) {
      scanFailureReason = `scan_invoke_failed: ${String(e).slice(0, 200)}`;
    }
    // PINNED URL PRESERVATION (2026-11-14): whatever the scan wrote,
    // the pinned lead's stored website_url ends this refresh at the
    // pinned map's value (target.url) — it never drifts. A failure
    // is reported, not hidden.
    let websiteUrlPreserved: boolean | null = null;
    {
      const { error: restoreError } = await db
        .from('leads')
        .update({ website_url: target.url })
        .eq('id', target.leadId);
      websiteUrlPreserved = !restoreError;
    }
    // PINNED CONSENT (Martinez pins fix, 2026-11-14): only for pins
    // whose banner a human has verified (today: michael-martinez
    // only). The capture browsers are walled by the site's bot check
    // and the probe records null on a wall, so the scan can never
    // witness this banner; the pin is the witness. Idempotent —
    // writing true over true is a no-op in effect. Pins without the
    // flag never touch the consent columns here.
    let consentBannerSeenPinned: boolean | null = null;
    if (target.consentBannerVerified) {
      const { error: consentError } = await db
        .from('leads')
        .update({ consent_banner_seen: true })
        .eq('id', target.leadId);
      consentBannerSeenPinned = !consentError;
    }
    // PINNED FORCED COVERED VIEW (Ray Miramontes fix, 2026-11-15):
    // only for pins whose site is verified to refuse real browser
    // framing (today: ray-miramontes only). The embed probe's
    // server-side fetch succeeds for his site, so no scan or probe
    // can ever record the refusal; the pin is the record. Idempotent
    // — writing true over true is a no-op in effect. Pins without
    // the flag never touch force_covered_view here, and this write
    // never touches the consent columns.
    let forceCoveredViewPinned: boolean | null = null;
    if (target.forceCoveredView) {
      const { error: forceError } = await db
        .from('leads')
        .update({ force_covered_view: true })
        .eq('id', target.leadId);
      forceCoveredViewPinned = !forceError;
    }
    // PINNED SERVICE AREA (Martinez pins fix, 2026-11-14): rewrite
    // the SERVICE AREA line(s) in the knowledge the scan just stored
    // to the pin's recorded area. Read AFTER the scan (the scan
    // overwrites website_content); write only when the text actually
    // changes, so an already-pinned row is untouched.
    let serviceAreaPinned: boolean | null = null;
    if (target.serviceArea) {
      const { data: kbRow, error: kbReadError } = await db
        .from('leads')
        .select('website_content')
        .eq('id', target.leadId)
        .maybeSingle();
      if (kbReadError) {
        serviceAreaPinned = false;
      } else {
        const currentContent = kbRow?.website_content ?? null;
        const assertedContent = applyPinnedServiceArea(currentContent, target.serviceArea);
        if (assertedContent !== (currentContent ?? '')) {
          const { error: kbWriteError } = await db
            .from('leads')
            .update({ website_content: assertedContent })
            .eq('id', target.leadId);
          serviceAreaPinned = !kbWriteError;
        } else {
          serviceAreaPinned = true;
        }
      }
    }
    const refreshEntry: Record<string, unknown> = {
      slug: target.slug,
      leadId: target.leadId,
      ok: scanOk,
      websiteUrlPreserved,
      consentBannerSeenPinned,
      forceCoveredViewPinned,
      serviceAreaPinned,
    };
    if (scanHttpStatus !== null) refreshEntry.httpStatus = scanHttpStatus;
    if (scanFailureReason) refreshEntry.reason = scanFailureReason;
    refreshed.push(refreshEntry);
  }

  return json({ ok: refreshed.every((r) => r.ok), refreshed });
});
