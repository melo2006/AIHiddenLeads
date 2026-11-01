import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prospects } = await req.json();
    if (!prospects || !Array.isArray(prospects)) {
      return new Response(JSON.stringify({ error: "prospects array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not configured");

    const systemPrompt = `You are an expert marketing campaign advisor for an AI services agency that sells Voice AI and Chat AI widgets to small businesses.

Your job is to analyze prospect data and recommend:
1. The best outreach channel (email, sms, both, or skip)
2. The best email template (browser_mockup, phone_mockup, clean_card)
3. Confidence score (0-1) that this prospect will engage
4. Brief reasoning

Rules:
- If prospect has email but no SMS capability → recommend "email"
- If prospect has SMS but no email → recommend "sms"
- If prospect has both → recommend "both" for high-score leads, "email" for others
- If prospect has neither → recommend "skip"
- browser_mockup template works best for prospects WITH websites (shows their site with AI widgets)
- clean_card template works for prospects WITHOUT websites
- phone_mockup is good for mobile-focused businesses
- Higher lead_score = higher opportunity (they lack modern tools)
- Hot temperature = prioritize these
- Already has voice_ai or chat_widget = lower confidence

Also suggest an optimal email subject line for this batch.

Return a JSON object with:
{
  "recommendations": [...],
  "recommended_subject": "subject line",
  "summary": "brief overall strategy"
}`;

    const userPrompt = `Analyze these ${prospects.length} prospects and provide recommendations:\n\n${JSON.stringify(prospects, null, 2)}`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
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
        tools: [{
          type: "function",
          function: {
            name: "campaign_recommendations",
            description: "Return campaign recommendations for prospects",
            parameters: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      prospect_id: { type: "string" },
                      business_name: { type: "string" },
                      recommended_channel: { type: "string", enum: ["email", "sms", "both", "skip"] },
                      recommended_template: { type: "string", enum: ["browser_mockup", "phone_mockup", "clean_card"] },
                      confidence: { type: "number" },
                      reasoning: { type: "string" },
                    },
                    required: ["prospect_id", "business_name", "recommended_channel", "recommended_template", "confidence", "reasoning"],
                  },
                },
                recommended_subject: { type: "string" },
                summary: { type: "string" },
              },
              required: ["recommendations", "recommended_subject", "summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "campaign_recommendations" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call in AI response");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("AI campaign advisor error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
