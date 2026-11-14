import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { REALTOR_EXAMPLE_PINNED_LEADS } from '../_shared/realtor-example-pinned-leads.ts';

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
      refreshed.push({ slug: target.slug, leadId: target.leadId, ok: res.ok, httpStatus: res.status, websiteUrlPreserved });
    } catch (e) {
      refreshed.push({ slug: target.slug, leadId: target.leadId, ok: false, reason: `scan_invoke_failed: ${String(e).slice(0, 200)}` });
    }
  }

  return json({ ok: refreshed.every((r) => r.ok), refreshed });
});
