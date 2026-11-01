import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHORT_DOMAIN = "https://aihiddenleads.com";

const makeSlug = () => {
  // 7-char base36 — collision-resistant for short_links
  return Math.random().toString(36).slice(2, 9);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json();
    const scrapedAdId: string = String(body?.scraped_ad_id ?? "").trim();
    const demoBaseUrl: string = String(body?.demo_base_url ?? `${SHORT_DOMAIN}/demo-site`);
    if (!scrapedAdId) {
      return new Response(JSON.stringify({ error: "scraped_ad_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ad, error: adErr } = await supabase
      .from("scraped_ads")
      .select("*")
      .eq("id", scrapedAdId)
      .single();
    if (adErr || !ad) throw new Error("Ad not found");

    const targetParams = new URLSearchParams({
      url: ad.landing_url,
      name: ad.advertiser_name,
      niche: ad.metadata?.search_niche || ad.platform || "general",
      source: "ad_hijack",
      scrapedAdId,
    });
    if (ad.prospect_id) targetParams.set("prospectId", ad.prospect_id);
    const targetUrl = `${demoBaseUrl}?${targetParams.toString()}`;

    // Reuse an existing short link for this ad, otherwise create one
    let shortUrl: string;
    const { data: existing } = await supabase
      .from("short_links")
      .select("slug")
      .eq("scraped_ad_id", scrapedAdId)
      .maybeSingle();

    if (existing?.slug) {
      shortUrl = `${SHORT_DOMAIN}/d/${existing.slug}`;
      await supabase
        .from("short_links")
        .update({ target_url: targetUrl, prospect_id: ad.prospect_id ?? null })
        .eq("scraped_ad_id", scrapedAdId);
    } else {
      // Try a few times in case of slug collision
      let slug = makeSlug();
      for (let i = 0; i < 4; i++) {
        const { error } = await supabase.from("short_links").insert({
          slug,
          target_url: targetUrl,
          prospect_id: ad.prospect_id ?? null,
          scraped_ad_id: scrapedAdId,
        });
        if (!error) break;
        slug = makeSlug();
      }
      shortUrl = `${SHORT_DOMAIN}/d/${slug}`;
    }

    const systemPrompt = `You write friendly, genuine, non-spammy social media comments that look like they were left by a real person who actually saw the ad.

Structure (exactly 3 short sentences, max 320 characters total including the link):
1. A REAL compliment on something specific in their ad (their offer, brand, tone, or visual). No generic praise.
2. A soft punch: mention that "around 60% of ad clicks never convert because nobody follows up in the first 5 minutes". Frame it as a friendly heads-up, not a sales pitch.
3. Offer the demo: "I built a voice agent that answers calls, qualifies leads, books appointments, and follows up by SMS + email automatically — made a quick one tailored to your business here: <LINK>"

Hard rules:
- ONE emoji maximum (optional). No hashtags.
- Never use the words "AI agency", "automation tool", "agency", "DM me".
- Do not pretend to be a customer.
- The link must be the SHORT link exactly as provided — do not modify it.
- Output ONLY the comment text, no quotes, no preamble.`;

    const userPrompt = `Advertiser: ${ad.advertiser_name}
Platform: ${ad.platform}
CTA: ${ad.cta_text ?? "(none)"}
Ad copy: ${(ad.ad_creative_text ?? "").slice(0, 400)}
Their landing page: ${ad.landing_url}
Short demo link to insert verbatim: ${shortUrl}

Write ONE comment.`;

    const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GOOGLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI gateway: ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    let comment: string = aiJson?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!comment.includes(shortUrl)) {
      comment = `${comment}\n\n${shortUrl}`.trim();
    }

    await supabase
      .from("scraped_ads")
      .update({ comment_template: comment })
      .eq("id", scrapedAdId);

    return new Response(
      JSON.stringify({ success: true, comment, demo_link: shortUrl, target_url: targetUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[generate-ad-comment] error:", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
