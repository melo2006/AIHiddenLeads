import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1';
const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const EXA_BASE = 'https://api.exa.ai';
const HUNTER_BASE = 'https://api.hunter.io/v2';

/** Lookup phone type + SMS capability via Twilio Lookup v2 API (direct, ~$0.005/lookup)
 *  Uses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN for Basic Auth directly to Twilio API
 *  (the connector gateway doesn't support Lookup paths)
 */
async function lookupPhoneType(phone: string): Promise<{ type: string | null; sms_capable: boolean | null }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken || !phone) return { type: null, sms_capable: null };

  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 7) return { type: null, sms_capable: null };
  const e164 = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;

  try {
    console.log('[Twilio v2] Looking up phone:', e164);
    const encodedPhone = encodeURIComponent(e164);
    const basicAuth = btoa(`${accountSid}:${authToken}`);

    // Twilio Lookup v2 with line_type_intelligence and sms_pumping_risk
    const response = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodedPhone}?Fields=line_type_intelligence`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
        },
      }
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn('[Twilio v2] Lookup failed:', response.status, errBody);
      return { type: null, sms_capable: null };
    }

    const data = await response.json();
    const lineType = data?.line_type_intelligence?.type; // "mobile", "landline", "fixedVoip", "nonFixedVoip", "personal", "tollFree", "premium", "sharedCost", "uan", "voicemail", "pager", null
    console.log('[Twilio v2] Line type result:', lineType, 'Full:', JSON.stringify(data?.line_type_intelligence));

    // Classify for our purposes
    let normalizedType: string | null = null;
    let smsCap: boolean | null = null;

    if (lineType === 'mobile') {
      normalizedType = 'mobile';
      smsCap = true;
    } else if (lineType === 'landline') {
      normalizedType = 'landline';
      smsCap = false;
    } else if (lineType === 'fixedVoip' || lineType === 'nonFixedVoip') {
      normalizedType = 'voip';
      // VoIP numbers CAN sometimes receive SMS — mark as potentially capable
      smsCap = true;
    } else if (lineType === 'personal') {
      normalizedType = 'mobile';
      smsCap = true;
    } else if (lineType === 'tollFree') {
      normalizedType = 'tollfree';
      smsCap = true; // Toll-free can typically receive SMS
    } else if (lineType) {
      normalizedType = lineType;
      smsCap = false;
    }

    return { type: normalizedType, sms_capable: smsCap };
  } catch (err) {
    console.warn('[Twilio v2] Lookup error:', err);
    return { type: null, sms_capable: null };
  }
}

/** Hunter.io Domain Search — find emails for a domain (~$0.01/request, 25 free/month) */
async function hunterEmailSearch(
  apiKey: string,
  domain: string,
  businessName: string,
): Promise<{ emails: Array<{ email: string; firstName: string | null; lastName: string | null; position: string | null; type: string }>; ownerEmail: string | null }> {
  const result: { emails: Array<{ email: string; firstName: string | null; lastName: string | null; position: string | null; type: string }>; ownerEmail: string | null } = {
    emails: [],
    ownerEmail: null,
  };

  try {
    console.log('[Hunter] Searching emails for domain:', domain);
    const response = await fetch(
      `${HUNTER_BASE}/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}&limit=5`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn('[Hunter] Search failed:', response.status, errBody);
      return result;
    }

    const data = await response.json();
    const emails = data?.data?.emails || [];

    for (const e of emails) {
      result.emails.push({
        email: e.value,
        firstName: e.first_name || null,
        lastName: e.last_name || null,
        position: e.position || null,
        type: e.type || 'generic', // "personal" or "generic"
      });
    }

    // Try to find owner/CEO/manager email
    const ownerKeywords = ['owner', 'ceo', 'founder', 'president', 'director', 'manager', 'principal', 'partner'];
    const ownerMatch = result.emails.find(e =>
      e.position && ownerKeywords.some(k => e.position!.toLowerCase().includes(k))
    );

    if (ownerMatch) {
      result.ownerEmail = ownerMatch.email;
    } else if (result.emails.length > 0) {
      // Prefer personal emails over generic
      const personal = result.emails.find(e => e.type === 'personal');
      result.ownerEmail = personal?.email || result.emails[0].email;
    }

    console.log('[Hunter] Found', result.emails.length, 'emails. Owner email:', result.ownerEmail);
    return result;
  } catch (err) {
    console.warn('[Hunter] Search error:', err);
    return result;
  }
}

// Structured schema for Firecrawl AI JSON extraction
const BUSINESS_SCHEMA = {
  type: 'object',
  properties: {
    business_name: { type: 'string', description: 'Official business name' },
    tagline: { type: 'string', description: 'Business tagline or slogan' },
    about: { type: 'string', description: 'About the business, mission statement, or company description (2-4 sentences)' },
    services: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'string' },
        },
        required: ['name'],
      },
      description: 'List of services or products offered with optional pricing',
    },
    pricing: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          price: { type: 'string' },
          details: { type: 'string' },
        },
        required: ['item'],
      },
      description: 'Pricing tiers or packages if available',
    },
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
      },
      description: 'Frequently asked questions and answers',
    },
    service_areas: {
      type: 'array',
      items: { type: 'string' },
      description: 'Geographic areas or cities served',
    },
    team_members: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
        },
        required: ['name'],
      },
      description: 'Key team members or staff',
    },
    unique_selling_points: {
      type: 'array',
      items: { type: 'string' },
      description: 'What makes this business stand out (certifications, awards, guarantees, years in business)',
    },
    contact_info: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
      },
      description: 'Contact information found on the website',
    },
    business_hours: { type: 'string', description: 'Operating hours if listed' },
    social_links: {
      type: 'object',
      properties: {
        facebook: { type: 'string' },
        instagram: { type: 'string' },
        linkedin: { type: 'string' },
        twitter: { type: 'string' },
        youtube: { type: 'string' },
        yelp: { type: 'string' },
      },
      description: 'Social media profile URLs',
    },
  },
  required: ['business_name'],
};

/** Search Exa for company/owner intelligence (FREE — 1,000 requests/month) */
async function exaResearch(
  apiKey: string,
  businessName: string,
  websiteUrl: string,
): Promise<{
  linkedinUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  snippets: string[];
}> {
  const result = {
    linkedinUrl: null as string | null,
    facebookUrl: null as string | null,
    instagramUrl: null as string | null,
    snippets: [] as string[],
  };

  const domain = (() => {
    try { return new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname.replace(/^www\./, ''); } catch { return ''; }
  })();

  // Search 1: Find owner/manager info + company details
  try {
    console.log('[Exa] Searching for owner info:', businessName, domain);
    const ownerRes = await fetch(`${EXA_BASE}/search`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `"${businessName}" owner OR founder OR manager OR CEO ${domain}`,
        num_results: 5,
        type: 'auto',
        contents: { text: { max_characters: 500 }, highlights: { num_sentences: 3 } },
      }),
    });

    if (ownerRes.ok) {
      const ownerData = await ownerRes.json();
      for (const r of ownerData.results || []) {
        const text = (r.text || '') + ' ' + ((r.highlights || []).join(' '));
        result.snippets.push(text.slice(0, 400));
        if (!result.linkedinUrl && r.url?.includes('linkedin.com/in/')) {
          result.linkedinUrl = r.url;
        }
      }
    } else {
      console.warn('[Exa] Owner search failed:', ownerRes.status);
    }
  } catch (err) {
    console.warn('[Exa] Owner search error:', err);
  }

  // Search 2: Find social media profiles
  try {
    console.log('[Exa] Searching for social profiles:', businessName);
    const socialRes = await fetch(`${EXA_BASE}/search`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `"${businessName}" ${domain}`,
        num_results: 5,
        type: 'auto',
        include_domains: ['linkedin.com', 'facebook.com', 'instagram.com', 'yelp.com'],
        contents: { text: { max_characters: 200 } },
      }),
    });

    if (socialRes.ok) {
      const socialData = await socialRes.json();
      for (const r of socialData.results || []) {
        const url = r.url || '';
        if (!result.linkedinUrl && url.includes('linkedin.com')) result.linkedinUrl = url;
        if (!result.facebookUrl && url.includes('facebook.com')) result.facebookUrl = url;
        if (!result.instagramUrl && url.includes('instagram.com')) result.instagramUrl = url;
      }
    } else {
      console.warn('[Exa] Social search failed:', socialRes.status);
    }
  } catch (err) {
    console.warn('[Exa] Social search error:', err);
  }

  console.log('[Exa] Research complete:', {
    linkedinFound: !!result.linkedinUrl,
    facebookFound: !!result.facebookUrl,
    instagramFound: !!result.instagramUrl,
    snippets: result.snippets.length,
  });

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prospect_id, website_url, business_name, niche } = await req.json();

    if (!prospect_id || !website_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_id and website_url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const exaApiKey = Deno.env.get('EXA_API_KEY');
    const hunterApiKey = Deno.env.get('HUNTER_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let markdown = '';
    let websiteScreenshot = '';
    let hasChatWidget = false;
    let hasVoiceAi = false;
    let hasOnlineBooking = false;
    let websiteQualityScore = 0;
    let businessData: Record<string, any> = {};
    let brandingData: Record<string, any> = {};

    // Cost tracking
    const apiUsage: Record<string, { calls: number; cost: number }> = {
      firecrawl: { calls: 0, cost: 0 },
      exa: { calls: 0, cost: 0 },
      hunter: { calls: 0, cost: 0 },
      twilio: { calls: 0, cost: 0 },
      ai: { calls: 0, cost: 0 },
    };

    // Step 1: Scrape with Firecrawl — structured JSON + branding + screenshot + markdown
    if (firecrawlKey) {
      try {
        const url = website_url.startsWith('http') ? website_url : `https://${website_url}`;
        console.log('Scraping website with structured extraction:', url);

        const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown', 'screenshot', 'branding', 'extract'],
            extract: {
              schema: BUSINESS_SCHEMA,
            },
            onlyMainContent: false,
            waitFor: 3000,
            timeout: 30000,
          }),
        });

        const data = await response.json().catch(() => null);
        if (response.ok) {
          apiUsage.firecrawl.calls = 1;
          apiUsage.firecrawl.cost = 0.01; // ~$0.01 per scrape credit
          const payload = data?.data ?? data ?? {};
          markdown = payload.markdown || '';
          websiteScreenshot = payload.screenshot || '';
          businessData = payload.extract || payload.json || {};
          brandingData = payload.branding || {};

          const htmlLower = (markdown || '').toLowerCase();

          const chatPatterns = [
            'tawk.to', 'tidio', 'intercom', 'drift', 'crisp', 'zendesk',
            'livechat', 'hubspot', 'freshchat', 'olark', 'chatwoot',
            'chatbot', 'chat-widget', 'chat_widget', 'messenger-widget',
            'botpress', 'landbot', 'manychat', 'dialogflow',
            'smartsupp', 'pure-chat', 'jivochat', 'userlike',
          ];
          hasChatWidget = chatPatterns.some(p => htmlLower.includes(p));

          const voicePatterns = [
            'retell', 'vapi', 'bland.ai', 'voiceflow', 'play.ai',
            'voice-agent', 'voice_agent', 'ai-phone',
            'callrail', 'aircall', 'dialpad',
          ];
          hasVoiceAi = voicePatterns.some(p => htmlLower.includes(p));

          const bookingPatterns = [
            'calendly', 'acuity', 'booksy', 'square appointments',
            'book-now', 'book_now', 'booknow', 'schedule-appointment',
            'appointlet', 'setmore', 'vagaro', 'mindbody',
            'simplybook', 'cal.com', 'housecallpro', 'jobber',
            'book online', 'book an appointment', 'schedule now',
          ];
          hasOnlineBooking = bookingPatterns.some(p => htmlLower.includes(p));

          let quality = 50;
          if (url.startsWith('https')) quality += 10;
          if (htmlLower.includes('viewport')) quality += 10;
          if (htmlLower.includes('schema.org') || htmlLower.includes('jsonld')) quality += 10;
          if (htmlLower.length > 10000) quality += 5;
          if (htmlLower.includes('google-analytics') || htmlLower.includes('gtag') || htmlLower.includes('gtm')) quality += 10;
          if ((businessData.services?.length || 0) > 0) quality += 5;
          websiteQualityScore = Math.min(100, quality);

          console.log('Structured extraction result:', {
            servicesFound: businessData.services?.length || 0,
            faqsFound: businessData.faqs?.length || 0,
            pricingFound: businessData.pricing?.length || 0,
            hasBranding: !!brandingData.colors,
          });
        } else {
          console.error('Firecrawl scrape failed:', data);
        }
      } catch (err) {
        console.error('Scrape error:', err);
      }
    }

    // Step 1.5: Run Exa + Hunter.io in parallel
    const domain = (() => {
      try {
        return new URL(website_url.startsWith('http') ? website_url : `https://${website_url}`).hostname.replace(/^www\./, '');
      } catch { return ''; }
    })();

    const [exaData, hunterData] = await Promise.all([
      exaApiKey ? exaResearch(exaApiKey, business_name, website_url).catch(err => {
        console.warn('Exa research failed (non-fatal):', err);
        return null;
      }) : Promise.resolve(null),
      (hunterApiKey && domain) ? hunterEmailSearch(hunterApiKey, domain, business_name).catch(err => {
        console.warn('Hunter search failed (non-fatal):', err);
        return null;
      }) : Promise.resolve(null),
    ]);

    if (exaData) {
      apiUsage.exa.calls = 2; // owner search + social search
      apiUsage.exa.cost = 0; // free tier (1000/month)
    }
    if (hunterData) {
      apiUsage.hunter.calls = 1;
      apiUsage.hunter.cost = 0.01; // ~$0.01 per search
    }

    // Step 2: AI Sales Analysis
    let aiAnalysis = '';
    let enrichmentData: Record<string, any> = {};
    if (googleApiKey) {
      try {
        const structuredSummary = [
          `Business: ${businessData.business_name || business_name}`,
          `Website: ${website_url}`,
          `Niche: ${niche || 'unknown'}`,
          businessData.about ? `About: ${businessData.about}` : '',
          businessData.services?.length ? `Services (${businessData.services.length}): ${businessData.services.map((s: any) => s.name).join(', ')}` : '',
          businessData.pricing?.length ? `Pricing tiers: ${businessData.pricing.length}` : 'No pricing found on website',
          businessData.faqs?.length ? `FAQs: ${businessData.faqs.length} found` : 'No FAQs found',
          businessData.unique_selling_points?.length ? `USPs: ${businessData.unique_selling_points.join('; ')}` : '',
          `Has Chat Widget: ${hasChatWidget}`,
          `Has Voice AI: ${hasVoiceAi}`,
          `Has Online Booking: ${hasOnlineBooking}`,
          `Website Quality Score: ${websiteQualityScore}/100`,
          markdown ? `Additional context (first 2000 chars):\n${markdown.slice(0, 2000)}` : '',
          exaData?.snippets?.length ? `\nExternal research (from Exa):\n${exaData.snippets.join('\n---\n')}` : '',
          exaData?.linkedinUrl ? `LinkedIn found: ${exaData.linkedinUrl}` : '',
          exaData?.facebookUrl ? `Facebook found: ${exaData.facebookUrl}` : '',
          exaData?.instagramUrl ? `Instagram found: ${exaData.instagramUrl}` : '',
          hunterData?.emails?.length ? `\nEmails found (Hunter.io):\n${hunterData.emails.map(e => `${e.email} (${e.firstName || ''} ${e.lastName || ''}, ${e.position || 'unknown role'}, ${e.type})`).join('\n')}` : '',
        ].filter(Boolean).join('\n');

        const response = await fetch(GOOGLE_AI_BASE, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gemini-2.5-flash',
            temperature: 0.3,
            messages: [
              {
                role: 'system',
                content: `You are a sales intelligence analyst for an AI agency that sells voice AI agents, AI chatbots, and automation solutions to local businesses.

Analyze the prospect and return a JSON object with these fields:
- "sales_assessment": A concise 2-3 sentence sales assessment (is this a good lead, what AI services are they missing, recommended approach)
- "owner_name": The business owner or manager name if found (null if not found)
- "owner_email": Owner/manager email if found (null if not found)
- "owner_phone": Owner/manager personal phone if found (null if not found)
- "linkedin_url": LinkedIn profile URL if found (null if not found)
- "facebook_url": Facebook page URL if found (null if not found)
- "instagram_url": Instagram profile URL if found (null if not found)
- "whatsapp_number": WhatsApp number if found (null if not found)
- "contact_method": Best way to reach the decision-maker: "mobile", "email", "linkedin", "facebook", "instagram", "whatsapp", "business_phone", or "unknown"

Be direct and specific. Return ONLY valid JSON, no markdown formatting or code blocks.`,
              },
              { role: 'user', content: structuredSummary },
            ],
          }),
        });

        if (response.ok) {
          apiUsage.ai.calls = 1;
          apiUsage.ai.cost = 0.005; // ~$0.005 per flash call
          const completion = await response.json();
          const raw = completion?.choices?.[0]?.message?.content?.trim() || '';
          try {
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            aiAnalysis = parsed.sales_assessment || raw;
            enrichmentData = {
              owner_name: parsed.owner_name || null,
              owner_email: parsed.owner_email || null,
              owner_phone: parsed.owner_phone || null,
              linkedin_url: parsed.linkedin_url || null,
              facebook_url: parsed.facebook_url || null,
              instagram_url: parsed.instagram_url || null,
              whatsapp_number: parsed.whatsapp_number || null,
              contact_method: parsed.contact_method || 'unknown',
            };

            // Merge social links from structured scrape if AI didn't find them
            const socialLinks = businessData.social_links || {};
            if (!enrichmentData.facebook_url && socialLinks.facebook) enrichmentData.facebook_url = socialLinks.facebook;
            if (!enrichmentData.instagram_url && socialLinks.instagram) enrichmentData.instagram_url = socialLinks.instagram;
            if (!enrichmentData.linkedin_url && socialLinks.linkedin) enrichmentData.linkedin_url = socialLinks.linkedin;

            // Merge Exa research findings
            if (exaData) {
              if (!enrichmentData.linkedin_url && exaData.linkedinUrl) enrichmentData.linkedin_url = exaData.linkedinUrl;
              if (!enrichmentData.facebook_url && exaData.facebookUrl) enrichmentData.facebook_url = exaData.facebookUrl;
              if (!enrichmentData.instagram_url && exaData.instagramUrl) enrichmentData.instagram_url = exaData.instagramUrl;
            }

            // Merge Hunter.io email — prioritize Hunter over AI-guessed emails
            if (hunterData?.ownerEmail) {
              enrichmentData.owner_email = hunterData.ownerEmail;
              // Also store the general business email if different
              if (!enrichmentData.email) {
                const genericEmail = hunterData.emails.find(e => e.type === 'generic');
                if (genericEmail) enrichmentData.email = genericEmail.email;
              }
              // If Hunter found a name with the email, use it as fallback
              const ownerEntry = hunterData.emails.find(e => e.email === hunterData.ownerEmail);
              if (ownerEntry && !enrichmentData.owner_name && (ownerEntry.firstName || ownerEntry.lastName)) {
                enrichmentData.owner_name = [ownerEntry.firstName, ownerEntry.lastName].filter(Boolean).join(' ');
              }
            }
          } catch {
            aiAnalysis = raw;
          }
        } else if (response.status === 429) {
          aiAnalysis = 'Analysis temporarily unavailable (rate limited). Try again shortly.';
        } else if (response.status === 402) {
          aiAnalysis = 'AI analysis requires credits. Please add funds to continue.';
        }
      } catch (err) {
        console.error('AI analysis error:', err);
        aiAnalysis = 'AI analysis unavailable.';
      }
    }

    // If AI didn't run but Exa/Hunter found data, still use them
    if (!enrichmentData.linkedin_url && exaData?.linkedinUrl) enrichmentData.linkedin_url = exaData.linkedinUrl;
    if (!enrichmentData.facebook_url && exaData?.facebookUrl) enrichmentData.facebook_url = exaData.facebookUrl;
    if (!enrichmentData.instagram_url && exaData?.instagramUrl) enrichmentData.instagram_url = exaData.instagramUrl;
    if (!enrichmentData.owner_email && hunterData?.ownerEmail) enrichmentData.owner_email = hunterData.ownerEmail;

    // Step 3: Build voice agent context from structured data
    const voiceAgentContext = buildVoiceAgentContext(businessData, business_name, niche);

    // Step 3.5: Twilio Phone Type + SMS Capability Lookup
    let phoneType: string | null = null;
    let smsCapable: boolean | null = null;
    const { data: currentProspect } = await supabase
      .from('prospects')
      .select('phone, phone_type, sms_capable')
      .eq('id', prospect_id)
      .single();

    const phoneToCheck = currentProspect?.phone;
    if (phoneToCheck && !currentProspect?.phone_type) {
      const lookupResult = await lookupPhoneType(phoneToCheck);
      phoneType = lookupResult.type;
      smsCapable = lookupResult.sms_capable;
      if (lookupResult.type !== null) {
        apiUsage.twilio.calls = 1;
        apiUsage.twilio.cost = 0.005; // ~$0.005 per lookup
      }
    } else if (currentProspect?.phone_type) {
      phoneType = currentProspect.phone_type;
      smsCapable = currentProspect.sms_capable;
    }

    // Step 4: Update the prospect in the database
    const updateData: Record<string, any> = {
      has_chat_widget: hasChatWidget,
      has_voice_ai: hasVoiceAi,
      has_online_booking: hasOnlineBooking,
      website_quality_score: websiteQualityScore,
      website_screenshot: websiteScreenshot || null,
      ai_analysis: aiAnalysis,
      ai_analyzed: true,
      phone_type: phoneType,
      sms_capable: smsCapable,
      business_data: {
        ...businessData,
        branding: brandingData,
        voice_agent_context: voiceAgentContext,
        exa_research: exaData?.snippets || [],
        hunter_emails: hunterData?.emails || [],
      },
      ...enrichmentData,
    };

    const { error: updateError } = await supabase
      .from('prospects')
      .update(updateData)
      .eq('id', prospect_id);

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error(`Failed to update prospect: ${updateError.message}`);
    }

    const totalCost = Object.values(apiUsage).reduce((sum, v) => sum + v.cost, 0);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          has_chat_widget: hasChatWidget,
          has_voice_ai: hasVoiceAi,
          has_online_booking: hasOnlineBooking,
          website_quality_score: websiteQualityScore,
          ai_analysis: aiAnalysis,
          business_data: businessData,
          branding: brandingData,
          phone_type: phoneType,
          sms_capable: smsCapable,
          hunter_emails_found: hunterData?.emails?.length || 0,
          cost: {
            total_usd: Math.round(totalCost * 1000) / 1000,
            breakdown: apiUsage,
          },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Analyze prospect error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildVoiceAgentContext(
  data: Record<string, any>,
  fallbackName: string,
  niche?: string,
): string {
  const parts: string[] = [];

  const name = data.business_name || fallbackName;
  parts.push(`Business: ${name}`);
  if (niche) parts.push(`Industry: ${niche}`);
  if (data.tagline) parts.push(`Tagline: ${data.tagline}`);
  if (data.about) parts.push(`About: ${data.about}`);

  if (data.services?.length) {
    const serviceLines = data.services.map((s: any) => {
      let line = `- ${s.name}`;
      if (s.price) line += ` ($${s.price})`;
      if (s.description) line += `: ${s.description}`;
      return line;
    });
    parts.push(`Services:\n${serviceLines.join('\n')}`);
  }

  if (data.pricing?.length) {
    const pricingLines = data.pricing.map((p: any) => {
      let line = `- ${p.item}`;
      if (p.price) line += `: ${p.price}`;
      if (p.details) line += ` (${p.details})`;
      return line;
    });
    parts.push(`Pricing:\n${pricingLines.join('\n')}`);
  }

  if (data.faqs?.length) {
    const faqLines = data.faqs.slice(0, 8).map((f: any) =>
      `Q: ${f.question}\nA: ${f.answer}`
    );
    parts.push(`FAQs:\n${faqLines.join('\n\n')}`);
  }

  if (data.service_areas?.length) {
    parts.push(`Service areas: ${data.service_areas.join(', ')}`);
  }

  if (data.unique_selling_points?.length) {
    parts.push(`Why choose us: ${data.unique_selling_points.join('; ')}`);
  }

  if (data.business_hours) {
    parts.push(`Hours: ${data.business_hours}`);
  }

  return parts.join('\n\n');
}
