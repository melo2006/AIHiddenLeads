import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Reserved live-provider boundary. No paid requests until an authorized,
// bounded, cached ranking adapter is implemented; keys alone never activate it.
// Google Places search order is not a measured Google Maps ranking.
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Sign in to request live audits" }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_ANON_KEY") || "");
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return reply({ error: "Sign in to request live audits" }, 401);
  try {
    const body = await req.json();
    if (typeof body.businessName !== "string" || !body.businessName.trim() || body.businessName.length > 200 || typeof body.city !== "string" || !body.city.trim() || body.city.length > 100 || typeof body.keyword !== "string" || !body.keyword.trim() || body.keyword.length > 150) {
      return reply({ error: "Business name, city and target keyword are required" }, 400);
    }
    return reply({ mode: "simulated", liveAvailable: false, gridSize: 5, provider: null, reason: "live_provider_not_configured", message: "Live ranking adapter is not configured. Continue using the labeled simulated preview." });
  } catch {
    return reply({ error: "Invalid request" }, 400);
  }
});