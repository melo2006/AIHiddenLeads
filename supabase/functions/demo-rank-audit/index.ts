import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Live 25-Point Visibility Audit powered by Serper (google.serper.dev).
// - "maps" mode: 5x5 lat/lng grid around the verified business location,
//   one Serper Maps query per cell, rank = position of the business in that
//   cell's results (search ordering, not a guaranteed Google Maps rank).
// - "nationwide" mode: 25 B2B buyer queries via Serper Search, rank = first
//   organic position of the business domain, for businesses without a local
//   storefront.
// Every scan is cached in rank_scan_cache for 7 days so repeat demos cost 0
// credits. A daily cap bounds paid usage. Failed cells stay unknown (null),
// never fabricated. Without SERPER_API_KEY the function returns the labeled
// simulated preview.

const SERPER_KEY = Deno.env.get("SERPER_API_KEY") || "";
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") || "";
const CACHE_DAYS = 7;
const DAILY_LIVE_SCAN_CAP = 30;
const GRID_SIZE = 5;
const STEP_KM = 1.6;
const BATCH = 5;

interface GridCell {
  row: number;
  col: number;
  rank: number | null;
  lat?: number;
  lng?: number;
  query?: string;
  matchedName?: string;
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalize = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function websiteHostOf(websiteUrl?: string): string | undefined {
  try {
    if (!websiteUrl) return undefined;
    return new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

async function findBusinessLocation(businessName: string, city: string, websiteUrl?: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    const query = [businessName, city, websiteHostOf(websiteUrl)].filter(Boolean).join(" ");
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "places.location,places.formattedAddress,places.displayName",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1, languageCode: "en" }),
    });
    const j = await res.json();
    const first = j?.places?.[0];
    if (!first?.location) return null;
    return { lat: first.location.latitude, lng: first.location.longitude, formatted: first.formattedAddress || "" };
  } catch (e) {
    console.error("findBusinessLocation error:", e);
    return null;
  }
}

async function serperMapsCell(keyword: string, lat: number, lng: number): Promise<any[]> {
  const res = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: keyword, ll: `@${lat},${lng},14z`, num: 20 }),
  });
  if (!res.ok) throw new Error(`Serper maps ${res.status}`);
  const j = await res.json();
  return j?.places || [];
}

async function serperSearchCell(query: string): Promise<any[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!res.ok) throw new Error(`Serper search ${res.status}`);
  const j = await res.json();
  return j?.organic || [];
}

function findRankInMaps(places: any[], businessName: string, host?: string): { rank: number | null; matched?: string } {
  const target = normalize(businessName);
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    const name = normalize(p?.title || "");
    const site = (p?.website || "").toLowerCase();
    if (target && name && (name.includes(target) || target.includes(name))) return { rank: i + 1, matched: p?.title };
    if (host && site && site.includes(host)) return { rank: i + 1, matched: p?.title };
  }
  return { rank: null };
}

function findRankInOrganic(organic: any[], businessName: string, host?: string): { rank: number | null; matched?: string } {
  const target = normalize(businessName);
  for (let i = 0; i < organic.length; i++) {
    const o = organic[i];
    const link = (o?.link || "").toLowerCase();
    const title = normalize(o?.title || "");
    if (host && link.includes(host)) return { rank: i + 1, matched: o?.title };
    if (target && title && (title.includes(target) || target.includes(title))) return { rank: i + 1, matched: o?.title };
  }
  return { rank: null };
}

// 25 B2B buyer-intent query templates for the nationwide matrix.
function nationwideQueries(keyword: string, niche: string): string[] {
  const k = keyword.toLowerCase();
  const n = (niche && niche !== "general" ? niche : keyword).toLowerCase();
  return [
    `${k}`, `best ${k}`, `top ${k} companies`, `${k} services`, `${k} near me`,
    `hire ${k}`, `affordable ${k}`, `professional ${k}`, `${k} agency`, `${k} company`,
    `best ${n} for small business`, `${n} providers`, `top rated ${n}`, `${n} solutions`, `${n} experts`,
    `${k} cost`, `${k} reviews`, `compare ${k}`, `${k} for businesses`, `leading ${n}`,
    `${n} services near me`, `trusted ${k}`, `${k} quotes`, `best ${n} agency`, `${n} consultation`,
  ];
}

async function runBatched<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    out.push(...(await Promise.allSettled(items.slice(i, i + BATCH).map(fn))));
  }
  return out;
}

function statsFor(grid: GridCell[]) {
  const ranked = grid.filter((g) => g.rank !== null).map((g) => g.rank as number);
  return {
    totalCells: grid.length,
    rankedCells: ranked.length,
    avgRank: ranked.length ? ranked.reduce((a, b) => a + b, 0) / ranked.length : null,
    top3VisibilityPct: Math.round((grid.filter((g) => g.rank !== null && (g.rank as number) <= 3).length / grid.length) * 100),
    blindSpots: grid.filter((g) => g.rank === null || g.rank > 10).length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request" }, 400);
  }

  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const niche = typeof body.niche === "string" ? body.niche.trim() : "";
  const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  const scanMode = body.mode === "nationwide" ? "nationwide" : "maps";
  const forceRefresh = body.forceRefresh === true;

  if (!businessName || businessName.length > 200 || !keyword || keyword.length > 150 || city.length > 100) {
    return reply({ error: "Business name and target keyword are required" }, 400);
  }
  if (scanMode === "maps" && !city) {
    return reply({ error: "A business city is required for the local maps audit" }, 400);
  }

  const simulated = (reason: string) =>
    reply({
      mode: "simulated",
      scanMode,
      liveAvailable: false,
      gridSize: GRID_SIZE,
      provider: null,
      reason,
      message: "Live ranking adapter is unavailable. Continue using the labeled simulated preview.",
    });

  if (!SERPER_KEY) return simulated("live_provider_not_configured");

  const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  const cacheKey = await sha256([scanMode, businessName, city, keyword, websiteHostOf(websiteUrl) || ""].join("|").toLowerCase());

  if (!forceRefresh) {
    const { data: cached } = await admin
      .from("rank_scan_cache")
      .select("result, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_DAYS * 86400000) {
      return reply({ ...(cached.result as object), cached: true });
    }
  }

  // Daily credit cap: count fresh live scans stored today.
  const { count } = await admin
    .from("rank_scan_cache")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(new Date().toISOString().slice(0, 10)).toISOString());
  if ((count ?? 0) >= DAILY_LIVE_SCAN_CAP) return simulated("daily_live_scan_cap_reached");

  const host = websiteHostOf(websiteUrl);

  try {
    if (scanMode === "maps") {
      const center = await findBusinessLocation(businessName, city, websiteUrl);
      if (!center) {
        return reply({ error: `Could not locate "${businessName}" on Google Maps. Check the city or add the business address.` }, 400);
      }
      const half = Math.floor(GRID_SIZE / 2);
      const kmPerDegLat = 110.574;
      const kmPerDegLng = 111.320 * Math.cos((center.lat * Math.PI) / 180);
      const points: { lat: number; lng: number; row: number; col: number }[] = [];
      for (let r = -half; r <= half; r++) {
        for (let c = -half; c <= half; c++) {
          points.push({
            lat: center.lat + (r * STEP_KM) / kmPerDegLat,
            lng: center.lng + (c * STEP_KM) / kmPerDegLng,
            row: r + half,
            col: c + half,
          });
        }
      }
      const settled = await runBatched(points, (p) => serperMapsCell(keyword, p.lat, p.lng));
      const grid: GridCell[] = points.map((p, i) => {
        const s = settled[i];
        if (s.status !== "fulfilled") return { ...p, rank: null };
        const { rank, matched } = findRankInMaps(s.value as any[], businessName, host);
        return { ...p, rank, matchedName: matched };
      });
      const result = {
        mode: "live",
        scanMode,
        liveAvailable: true,
        provider: "serper",
        cached: false,
        center,
        grid,
        keyword,
        businessName,
        stats: statsFor(grid),
        note: "Live Serper Google Maps search ordering per grid point — a strong visibility signal, not a guaranteed ranking.",
      };
      await admin.from("rank_scan_cache").upsert({
        cache_key: cacheKey,
        scan_mode: scanMode,
        business_name: businessName,
        city,
        keyword,
        result,
      });
      return reply(result);
    }

    // Nationwide AI & Search Visibility Matrix
    const queries = nationwideQueries(keyword, niche);
    const settled = await runBatched(queries, (q) => serperSearchCell(q));
    const grid: GridCell[] = queries.map((q, i) => {
      const s = settled[i];
      const row = Math.floor(i / GRID_SIZE);
      const col = i % GRID_SIZE;
      if (s.status !== "fulfilled") return { row, col, rank: null, query: q };
      const { rank, matched } = findRankInOrganic(s.value as any[], businessName, host);
      return { row, col, rank, query: q, matchedName: matched };
    });
    const result = {
      mode: "live",
      scanMode,
      liveAvailable: true,
      provider: "serper",
      cached: false,
      center: null,
      grid,
      keyword,
      businessName,
      stats: statsFor(grid),
      note: "Live Google organic positions across 25 B2B buyer searches — visibility signal, not a guaranteed ranking.",
    };
    await admin.from("rank_scan_cache").upsert({
      cache_key: cacheKey,
      scan_mode: scanMode,
      business_name: businessName,
      city,
      keyword,
      result,
    });
    return reply(result);
  } catch (e) {
    console.error("demo-rank-audit live scan error:", e);
    return simulated("live_scan_failed");
  }
});
