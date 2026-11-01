import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch warm/hot prospects with engagement signals
    const { data: prospects } = await supabase
      .from("prospects")
      .select("id, business_name, owner_name, niche, email, phone, pipeline_stage, lead_temperature, lead_score, website_url, email_sent_at, email_opened_at, email_clicked_at, sms_sent_at, sms_clicked_at, demo_viewed_at, demo_link, last_contacted_at, do_not_contact, ai_analysis")
      .or("email_opened_at.not.is.null,email_clicked_at.not.is.null,sms_clicked_at.not.is.null,demo_viewed_at.not.is.null")
      .eq("do_not_contact", false)
      .order("demo_viewed_at", { ascending: false, nullsFirst: true })
      .limit(50);

    if (!prospects || prospects.length === 0) {
      return new Response(JSON.stringify({ actions: [], summary: "No engaged prospects found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch chat interactions for these prospects
    const prospectIds = prospects.map((p) => p.id);
    const { data: chatInteractions } = await supabase
      .from("demo_chat_interactions")
      .select("prospect_id, lead_id, session_id, role, content, created_at, business_name")
      .in("prospect_id", prospectIds)
      .order("created_at", { ascending: false })
      .limit(200);

    // 3. Fetch call history for these prospects
    const { data: callHistory } = await supabase
      .from("call_history")
      .select("prospect_id, business_name, call_status, summary, key_points, next_step, duration_seconds, started_at, transfer_requested, transfer_status")
      .in("prospect_id", prospectIds)
      .order("started_at", { ascending: false })
      .limit(100);

    // 4. Build prospect profiles for AI analysis
    const profiles = prospects.map((p) => {
      const chats = (chatInteractions || []).filter((c) => c.prospect_id === p.id);
      const calls = (callHistory || []).filter((c) => c.prospect_id === p.id);

      const chatSummary = chats.length > 0
        ? `${chats.length} chat messages. User questions: ${chats.filter((c) => c.role === "user").map((c) => c.content).slice(0, 3).join(" | ")}`
        : "No chat interactions";

      const callSummary = calls.length > 0
        ? calls.map((c) => `Call (${c.call_status}, ${c.duration_seconds || 0}s): ${c.summary || "No summary"}. Next: ${c.next_step || "None"}`).slice(0, 2).join(" | ")
        : "No voice calls";

      return {
        id: p.id,
        business_name: p.business_name,
        owner_name: p.owner_name,
        niche: p.niche,
        email: p.email,
        phone: p.phone,
        pipeline_stage: p.pipeline_stage,
        lead_temperature: p.lead_temperature,
        lead_score: p.lead_score,
        engagement: {
          email_opened: !!p.email_opened_at,
          email_clicked: !!p.email_clicked_at,
          sms_clicked: !!p.sms_clicked_at,
          demo_viewed: !!p.demo_viewed_at,
          last_contacted: p.last_contacted_at,
        },
        chat_summary: chatSummary,
        call_summary: callSummary,
      };
    });

    // 5. AI analysis
    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GOOGLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert B2B sales intelligence analyst for a lead generation agency. Analyze prospect engagement data and generate actionable follow-up recommendations.

For each prospect, assess their engagement signals (email opens, clicks, demo views, chat interactions, voice calls) and assign:
- A priority score (1-10, 10 being most urgent)
- A recommended action (specific, actionable step)
- A reason (brief explanation of why this action)
- An urgency level: "immediate" (act within hours), "today" (act within 24h), "this_week", or "low"
- A suggested channel: "call", "email", "sms", or "demo"

Focus on prospects showing buying intent signals: demo viewers who asked questions, email clickers, prospects with call transcripts showing interest. Deprioritize prospects who only opened emails without further action.

Return ONLY valid JSON matching this format:
{
  "actions": [
    {
      "prospect_id": "uuid",
      "business_name": "string",
      "priority": number,
      "urgency": "immediate|today|this_week|low",
      "channel": "call|email|sms|demo",
      "action": "string (specific recommended action)",
      "reason": "string (brief explanation)",
      "engagement_score": number (0-100 based on total engagement depth)
    }
  ],
  "summary": "string (1-2 sentence overall summary of the pipeline health)"
}

Sort by priority descending. Include at most 20 prospects.`,
          },
          {
            role: "user",
            content: `Analyze these ${profiles.length} engaged prospects and generate follow-up recommendations:\n\n${JSON.stringify(profiles, null, 2)}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1].trim() : content.trim());
    } catch {
      parsed = { actions: [], summary: "AI analysis could not be parsed. Raw: " + content.slice(0, 200) };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-follow-up-intelligence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
