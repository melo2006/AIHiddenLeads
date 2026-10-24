// Public booking endpoint for free one-on-one implementation calls.
// Validates input, prevents double-booking, stores the request and notifies Ron by email.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const NOTIFY_EMAIL = "melo2006@gmail.com";
const SLOT_MINUTES = 15;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = clean(body.name, 100);
    const email = clean(body.email, 255).toLowerCase();
    const phone = clean(body.phone, 40);
    const businessName = clean(body.businessName, 150);
    const notes = clean(body.notes, 1000);
    const slotStart = clean(body.slotStart, 40);

    if (!name || !isEmail(email)) {
      return new Response(JSON.stringify({ error: "Please provide your name and a valid email." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const slot = new Date(slotStart);
    if (Number.isNaN(slot.getTime()) || slot.getTime() < Date.now() + 60 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Please pick a valid upcoming time slot." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (slot.getUTCMinutes() % SLOT_MINUTES !== 0 || slot.getUTCSeconds() !== 0) {
      return new Response(JSON.stringify({ error: "Invalid time slot." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: conflict } = await db
      .from("implementation_calls")
      .select("id")
      .eq("slot_start", slot.toISOString())
      .neq("status", "cancelled")
      .maybeSingle();
    if (conflict) {
      return new Response(JSON.stringify({ error: "That time was just taken — please pick another slot." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: insErr } = await db.from("implementation_calls").insert({
      name,
      email,
      phone: phone || null,
      business_name: businessName || null,
      notes: notes || null,
      slot_start: slot.toISOString(),
    });
    if (insErr) throw insErr;

    // Notify Ron (best effort — booking is already saved)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const when = slot.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "AI Hidden Leads <onboarding@resend.dev>",
          to: [NOTIFY_EMAIL],
          subject: `New implementation call: ${name} — ${when} ET`,
          text: `New implementation call request\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "-"}\nBusiness: ${businessName || "-"}\nTime: ${when} (ET)\nNotes: ${notes || "-"}\n`,
        }),
      }).catch((e) => console.error("notify email failed:", e));
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("book-implementation-call failed:", e);
    return new Response(JSON.stringify({ error: "Booking failed — please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
