import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64url } from "https://deno.land/std@0.203.0/encoding/base64url.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RETELL_BASE = 'https://api.retellai.com';
const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const RESEND_BASE = 'https://api.resend.com/emails';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_OWNER_NAME = 'your dedicated specialist';
const TESTING_INBOX_EMAIL = 'melo2006@gmail.com';
const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_TRANSFER_NUMBER = '+19547706622';
const TWILIO_CALLER_ID = '+15612755757';
const TRANSFER_TITLE = 'AI Solutions Specialist';
const SHARED_WEB_AGENT_ID = 'agent_0dd08673d770e8adf08f920490';
// Language-specific Retell agents (must match the homepage spokesperson voices)
const LANGUAGE_AGENT_IDS: Record<'en' | 'pt-BR' | 'es', string> = {
  'en': 'agent_0dd08673d770e8adf08f920490',
  'pt-BR': Deno.env.get('RETELL_AGENT_ID_PT') || 'agent_f07d11526d03342668c043e4d1',
  'es': Deno.env.get('RETELL_AGENT_ID_ES') || 'agent_f4bcf291c7a19b15cc020edce5',
};
const UPDATED_PROMPT_AGENT_IDS = new Set<string>();

const SHARED_RETELL_PROMPT = `You are Aspen, the AI voice assistant.

ABSOLUTE LANGUAGE CONTROL:
- If {{demo_language_lock}} is present, it overrides every other prompt, example, tool description, business brief, and user language cue.
- Never copy sample phrases or business-brief wording in a different language than {{demo_language_lock}} allows.
- Translate any business facts internally before speaking; only keep proper nouns, brand names, URLs, and exact product names as written.

You always operate in exactly ONE mode per call.

MODE SELECTION:
- If {{spokesperson_mode}} is exactly "true", use LANDING PAGE SALES MODE only.
- Otherwise, use WEBSITE DEMO MODE only.

LANDING PAGE SALES MODE:
- Your full authoritative instructions are in {{spokesperson_prompt}}.
- Follow {{spokesperson_prompt}} exactly.
- Speak in the language of {{spokesperson_prompt}}. Portuguese instructions mean Brazilian Portuguese. Spanish instructions mean neutral Latin American Spanish.
- Your first utterance must be exactly {{begin_message}}. Do not add anything before it or after it in the first turn.
- You are Aspen from A-I Hidden Leads on the AI Hidden Leads homepage.
- The business you represent is A-I Hidden Leads, not the visitor's business.
- This is a homepage sales pitch, not a customer website simulation.
- Do NOT act like Alex, a receptionist, or an agent for any other company.
- Do NOT say "business name", "company name", "spoken business name", variable names, braces, field labels, or placeholder text.
- Do NOT use website-demo openings, receptionist scripts, {{exact_demo_opening}}, {{spoken_business_name}}, or {{business_name}} in this mode.
- Do NOT mention the current day, date, month, year, clock time, timezone, or exact time. Only use the general greeting already inside {{begin_message}}.
- Start by selling A-I Hidden Leads, then ask for the visitor's name after the intro, exactly as {{begin_message}} does.

WEBSITE DEMO MODE:
- Your full authoritative instructions are in {{voice_persona}}.
- Follow {{voice_persona}} exactly.
- Your first utterance must follow {{exact_demo_opening}} exactly.
- In this mode, you are simulating the receptionist for {{spoken_business_name}} or {{business_name}}.
- Use {{business_info}} as your source of truth about the business.
- Never use the AI Hidden Leads landing-page sales script in this mode.
- Never tell the caller to scroll down, fill out a form, or try the page demo in this mode.
- The caller is {{caller_name}} when provided.
- The owner is {{owner_name}}.
- These are different people.

GLOBAL RULES:
- Never read variable names, braces, placeholder syntax, or field labels aloud.
- Never mix the landing-page sales mode with the website demo mode.
- Never mix languages within a call unless the caller explicitly asks to switch and then confirms the switch.
- Never mention the current day, date, clock time, or exact time in the greeting.
- If both instruction blocks are present, obey only the instructions for the active mode.`;

// Service account credentials for aspen-calendar-bot
const SERVICE_ACCOUNT = {
  client_email: "aspen-calendar-bot@stunning-saga-490517-f1.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCfTMsLXQk/1PpV\ngw1tOG6JOkO8pFL0K+L2/K1Md92JqUHX6lNaYoOp4Ms4vlNR7K3qg4QY1doHo4j8\nm3NxoEsMzBlruM/iqOCcl6XMBWQmQn9uCg/jqVFj3CBVLiZJJ0pq7LXxQOy0Tv+l\naEpP2fJceJRjQ9r726qn+MoD8VbucFmDowNfxde4byPzM9V4aM0BOxIZbip0yPvE\nfmVUo5b5DOIjRge3FQ+bCTNeRyCKbp1J9vIn1f5N3SZXpqwB4mmm4h2vA5RrvaKK\nmhSBeQ/PqzVv+pdQ2jXKBp0vQAzj0GPqs4CTZNd6QUmllwrLoRUoH1+SlOlIXoEl\nZ/65eBJRAgMBAAECggEACv/dNE1qBlWRLIbmTjCbl0+l3jh1fuUp4JaNa86KBkeg\n44ULWN4dC8WZGrOvoqRGVP9cR2+6xJTC8HhWZhXkoL9WEQVbm2HAUqe4+8eyhN7K\nGEHLG5P1KgFI3UDYxWvYXF44aO5r+b5LsjLrkKxyqvZrfpgwnnvqQntwDYokT8Xn\nyifsxXqVePMgEL5Bhz0TWWf7W8hwVNT8Bvg80Q7U0P/9c8DnnmVcAIam0nj7UXL3\nypCjrDlz/PGkM3vslbpiyivT98i93eAgK0T8fibhFLRSnNSoTwfLFJA3dtxAhOrM\nK2s0kdcFNtfs5PfgYYzY5H6Xe35vSZy7lw6Qi2ZObQKBgQDTAVR5bUMeoDuoy9hx\n2aIQjvgnG8Ti3/7pSOKnp/+kCZeMH71dC/8FSewT6f9HUJr+obeSHQr/2lxK5y6E\nEPIzdKyxsKYHFF4wkaQo+Jll18wgky18/29zt2SBj5mY8Sb2K8jTS1vxks1hEv42\nl10mlDGkkauoWyLk5J8bVqznrQKBgQDBROaFrn3cUpAsLFwJ2xNbcQMh/dtIReWP\nS9U6x5L/sAnd+DMJ8ie9Ia8dNm5M+ZoSrvSIJRdwMaWXlsLaz78mK0WixtfEJwTQ\nsXWr/0G3p2AsfI7PSyybqztqPU15Cz0EyyEK7tEEO+8xSYFnGJpnl9jbXyn0mFFk\noH6wY4X5tQKBgG7Er/fep/GX5DnEaSe7PBy9MQA2z7DaLhOBM5sX0lfmwSvKLbp+\n5a19FPWPTXe+lN8/PgLyRCf0FacsnXqu+raQdWgCd+YXhyqwCiGH/9863enr2WFZ\nJsT0bUqme9eSIQXyDkb9tJKoojBnrBQ0ea4a9cSSxC5pSXQnoG7VnYcxAoGAJZmP\n94YA+nIdllpy9X/nfiy4XU6T8LWYeY5ZR3w4PwIyiTqWQ2MXFBaPiPFj+Bm/Pc9H\nx4zfyHYAL0OnWQZ9u6FDhO2GYKTurOM5b2LTmDU54q3A4tdPMGHZx0tx3RCwqFQU\nc5oOk/JNEJuqTzJcJ7dE+zjCYtGXVCpdO1fBYtkCgYAnHDiVSJGem+4hDHDn6wDm\njis8bxwN7I4ouVE2PpG75bbHJNGlmsAZcnZG2JptFRK513O1Lo/ENt3UUIwWZPIz\nR/0CRgTyzHXP6zk93K441egoM6sr6Wz1vfQ6NxQTmzlrNy/dN5y/bYAlimAZbp9e\nJYi8wKsWYjK8G5cBL+RPoA==\n-----END PRIVATE KEY-----\n",
  token_uri: "https://oauth2.googleapis.com/token",
};

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function createSignedJwt(scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    scope,
    aud: SERVICE_ACCOUNT.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const keyData = pemToArrayBuffer(SERVICE_ACCOUNT.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(unsigned));
  const sigB64 = base64url(new Uint8Array(signature));

  return `${unsigned}.${sigB64}`;
}

async function getGoogleAccessToken(): Promise<string> {
  const jwt = await createSignedJwt('https://www.googleapis.com/auth/calendar');

  const res = await fetch(SERVICE_ACCOUNT.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function getFreeBusy(calendarId: string, timeMin: string, timeMax: string): Promise<{ start: string; end: string }[]> {
  const accessToken = await getGoogleAccessToken();

  const res = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: DEFAULT_TIME_ZONE,
      items: [{ id: calendarId }],
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`FreeBusy API error [${res.status}] for ${calendarId}: ${JSON.stringify(data)}`);
  }

  return data?.calendars?.[calendarId]?.busy ?? [];
}

async function findAvailableSlot(calendarId: string, preferredStart: Date, durationMinutes = 15): Promise<Date> {
  // Check a 3-day window from the preferred start
  const windowStart = new Date(preferredStart);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + 3);

  const busySlots = await getFreeBusy(
    calendarId,
    windowStart.toISOString(),
    windowEnd.toISOString(),
  );

  const isSlotFree = (start: Date, end: Date): boolean => {
    return !busySlots.some((busy) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return start < busyEnd && end > busyStart;
    });
  };

  // First try the preferred time
  const preferredEnd = new Date(preferredStart);
  preferredEnd.setMinutes(preferredEnd.getMinutes() + durationMinutes);
  if (isSlotFree(preferredStart, preferredEnd)) {
    return preferredStart;
  }

  console.log('Preferred slot is busy, searching for next available...');

  // Search forward in 30-min increments, business hours only (9am-5pm)
  const candidate = new Date(preferredStart);
  for (let i = 0; i < 48; i++) {
    candidate.setMinutes(candidate.getMinutes() + 30);

    // Skip weekends
    if (candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + (candidate.getDay() === 0 ? 1 : 2));
      candidate.setHours(9, 0, 0, 0);
      continue;
    }

    // Skip outside business hours
    if (candidate.getHours() < 9) {
      candidate.setHours(9, 0, 0, 0);
    }
    if (candidate.getHours() >= 17) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(9, 0, 0, 0);
      continue;
    }

    const candEnd = new Date(candidate);
    candEnd.setMinutes(candEnd.getMinutes() + durationMinutes);
    if (isSlotFree(candidate, candEnd)) {
      return new Date(candidate);
    }
  }

  // Fallback: return the preferred time anyway
  return preferredStart;
}

async function findAvailableSlotAcrossCalendars(calendarIds: string[], preferredStart: Date, durationMinutes = 15) {
  const uniqueCalendarIds = Array.from(new Set(calendarIds.map((value) => value.trim()).filter(Boolean)));
  let lastError: Error | null = null;

  for (let index = 0; index < uniqueCalendarIds.length; index += 1) {
    const calendarId = uniqueCalendarIds[index];

    try {
      const slot = await findAvailableSlot(calendarId, preferredStart, durationMinutes);
      return {
        calendarId,
        slot,
        warning:
          index > 0
            ? `The owner's calendar is not shared yet, so Aspen used the connected demo calendar to check availability.`
            : null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown calendar lookup error');
      console.warn(`Calendar lookup failed for ${calendarId}:`, lastError.message);
    }
  }

  throw lastError ?? new Error('No accessible calendar was available for booking.');
}

async function createCalendarEvent({
  calendarId,
  summary,
  description,
  startTime,
  endTime,
  attendeeEmail,
  timeZone = DEFAULT_TIME_ZONE,
}: {
  calendarId: string;
  summary: string;
  description: string;
  startTime: string;
  endTime: string;
  attendeeEmail?: string;
  timeZone?: string;
}) {
  const accessToken = await getGoogleAccessToken();

  const event: Record<string, any> = {
    summary,
    description,
    start: { dateTime: startTime, timeZone },
    end: { dateTime: endTime, timeZone },
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${attendeeEmail ? 'all' : 'none'}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Calendar API error [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePhoneNumber = (value?: string) => {
  if (!value) return '';

  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (value.trim().startsWith('+')) return value.trim();
  return value.trim();
};

const extractHostnameForSpeech = (value?: string) => {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  return trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim();
};

const getSpokenBusinessName = (businessName?: string, websiteUrl?: string) => {
  const rawBusinessName = typeof businessName === 'string' ? businessName.trim() : '';
  const hostname = extractHostnameForSpeech(websiteUrl || rawBusinessName);
  const source = rawBusinessName || hostname;
  const normalizedSource = source.toLowerCase();
  const normalizedHostname = hostname.toLowerCase();

  if (!source) return 'your business';

  // --- Specific overrides ---
  if (normalizedHostname === 'si2.com') return 'S I 2 dot com';
  if (normalizedHostname === 'si.com' || normalizedHostname === 's-i.com') return 'S I dot com';
  if (/^site\s*2(?:\s+technologies)?$/i.test(rawBusinessName)) return 'S I 2 Technologies';
  if (/^si2\s+technologies$/i.test(rawBusinessName)) return 'S I 2 Technologies';
  if (/^s-?i\s+technologies$/i.test(rawBusinessName)) return 'S I Technologies';
  if (/^si2(?:\.com)?$/i.test(normalizedSource)) return 'S I 2 dot com';
  if (/^s-i(?:\.com)?$/i.test(normalizedSource) || /^si(?:\.com)?$/i.test(normalizedSource)) return 'S I dot com';
  if (/^si2\b/i.test(rawBusinessName)) return rawBusinessName.replace(/^si2\b/i, 'S I 2');
  if (/^si\b/i.test(rawBusinessName)) return rawBusinessName.replace(/^si\b/i, 'S I');

  // --- Generic acronym/initials rule ---
  // If the name is 2-5 uppercase letters (optionally followed by digits), spell each character.
  // e.g. "IBM" → "I B M", "ABB" → "A B B", "HP2" → "H P 2"
  const acronymMatch = source.match(/^([A-Z]{2,5})(\d{0,3})$/);
  if (acronymMatch) {
    const letters = acronymMatch[1].split('').join(' ');
    const digits = acronymMatch[2] || '';
    return digits ? `${letters} ${digits}` : letters;
  }

  // If the hostname looks like 2-5 letters + optional digits + .tld, spell it
  const hostAcronymMatch = hostname.match(/^([a-z]{2,5})(\d{0,3})\.[a-z]{2,6}$/i);
  if (hostAcronymMatch && hostAcronymMatch[1].length <= 4) {
    const letters = hostAcronymMatch[1].toUpperCase().split('').join(' ');
    const digits = hostAcronymMatch[2] || '';
    const tld = hostname.split('.').pop();
    return digits ? `${letters} ${digits} dot ${tld}` : `${letters} dot ${tld}`;
  }

  return source;
};

const buildOpeningCompanyWelcome = ({
  businessInfo,
  spokenBusinessName,
  businessNiche,
}: {
  businessInfo?: string;
  spokenBusinessName: string;
  businessNiche?: string;
}) => {
  const candidateLines = (businessInfo || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, ''))
    .map((line) => line.replace(/^SUMMARY:\s*/i, ''))
    .map((line) => line.replace(/^HOMEPAGE SUMMARY:\s*/i, ''))
    .map((line) => line.replace(/^SERVICE AREA:\s*/i, 'They serve '))
    .map((line) => line.replace(/^TARGET AUDIENCE:\s*/i, 'They work with '))
    .filter((line) => !/^(BUSINESS NAME|DETECTED NICHE|WEBSITE):/i.test(line))
    .filter((line) => !/^===/.test(line))
    .filter((line) => !/^(there is no actual business content|the content primarily features|page title)/i.test(line));

  const sentences = candidateLines
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.replace(/[|•*_#>`]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((sentence) => /[.!?]$/.test(sentence) ? sentence : `${sentence}.`)
    .filter((sentence) => sentence.length >= 28 && sentence.length <= 220)
    .filter((sentence) => !/^(home|about|contact|services|reviews|faq)$/i.test(sentence))
    .filter((sentence) => !/\b(HOMEPAGE SUMMARY|PAGE TITLE|BUSINESS NAME|DETECTED NICHE|TARGET AUDIENCE|WEBSITE)\b/i.test(sentence));

  const selected = Array.from(new Set(sentences)).slice(0, 2).join(' ');
  if (selected) return selected;

  if (businessNiche && businessNiche !== 'general') {
    return `${spokenBusinessName} specializes in ${businessNiche} services tailored to each customer. The team focuses on clear communication, quality work, and a smooth customer experience.`;
  }

  return `${spokenBusinessName} welcomes customers with friendly, professional service. The team focuses on clear communication, quality work, and a smooth customer experience.`;
};

const sanitizeVoicePromptText = (value: string) =>
  value
    .replace(/reais\s+brasileir[oa]s?/gi, 'reais')
    .replace(/real\s+brasileir[oa]/gi, 'real')
    .replace(/moeda\s+brasileira/gi, 'reais')
    .replace(/Brazilian\s+reais?/gi, 'reais')
    .replace(/Brazilian\s+real/gi, 'real');

const buildPhaseTwoNameLine = (callerName?: string, language: string = 'en') => {
  const cleanedName = typeof callerName === 'string' ? callerName.trim() : '';
  if (language === 'pt-BR') {
    return cleanedName
      ? `Que bom falar com você, ${cleanedName}.`
      : `Aliás, como você gostaria que eu te chamasse hoje?`;
  }
  if (language === 'es') {
    return cleanedName
      ? `Qué gusto hablar contigo, ${cleanedName}.`
      : `Por cierto, ¿cómo te gustaría que te llame hoy?`;
  }
  return cleanedName
    ? `It's great to connect with you, ${cleanedName}.`
    : `By the way, what name should I use for you today?`;
};

const getTimeOfDayGreeting = (timeZone = DEFAULT_TIME_ZONE, language: string = 'en') => {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone,
  }).format(new Date()));

  if (language === 'pt-BR') {
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }
  if (language === 'es') {
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const buildPhaseTwoOpening = ({
  spokenBusinessName,
  openingCompanyWelcome,
  phaseTwoNameLine,
  timeOfDayGreeting,
  askHelpQuestion,
  language = 'en',
}: {
  spokenBusinessName: string;
  openingCompanyWelcome: string;
  phaseTwoNameLine: string;
  timeOfDayGreeting: string;
  askHelpQuestion: boolean;
  language?: string;
}) => {
  if (language === 'pt-BR') {
    return askHelpQuestion
      ? `${timeOfDayGreeting}, ${phaseTwoNameLine.replace(/^Que bom falar com você,\s*/i, '').replace(/\.$/, '')}. Que bom ter você aqui com a ${spokenBusinessName}. Eu sou a Aspen. Antes de você me dizer o que precisa, deixa eu te mostrar rapidinho por que vale a pena falar com a gente: ${openingCompanyWelcome} A equipe foca em atendimento claro, soluções bem explicadas e uma experiência mais tranquila do começo ao fim. Me conta: você está procurando uma orientação, um orçamento, ou quer entender qual solução combina melhor com você?`
      : `${timeOfDayGreeting}. Que bom ter você aqui com a ${spokenBusinessName}. Eu sou a Aspen. Antes de eu te ajudar, deixa eu te mostrar rapidinho por que vale a pena falar com a gente: ${openingCompanyWelcome} A equipe foca em atendimento claro, soluções bem explicadas e uma experiência mais tranquila do começo ao fim. Pra eu te atender melhor, como posso te chamar?`;
  }
  if (language === 'es') {
    return `Hola, ${timeOfDayGreeting.toLowerCase()}. Habla Aspen de ${spokenBusinessName}. ${openingCompanyWelcome} ${phaseTwoNameLine}${askHelpQuestion ? ' ¿En qué puedo ayudarte hoy?' : ''}`;
  }
  return `Hi, ${timeOfDayGreeting.toLowerCase()}. This is Aspen from ${spokenBusinessName}. ${openingCompanyWelcome} ${phaseTwoNameLine}${askHelpQuestion ? ' How can I help you today?' : ''}`;
};

const buildExactDemoOpening = ({
  spokenBusinessName,
  openingCompanyWelcome,
  phaseTwoNameLine,
  timeOfDayGreeting,
  askHelpQuestion,
  language = 'en',
}: {
  spokenBusinessName: string;
  openingCompanyWelcome: string;
  phaseTwoNameLine: string;
  timeOfDayGreeting: string;
  askHelpQuestion: boolean;
  language?: string;
}) => {
  if (language === 'pt-BR') {
    return `Só lembrando: esta é uma demonstração rápida, mas eu vou te atender como se já estivesse trabalhando no site da ${spokenBusinessName}. ${buildPhaseTwoOpening({ spokenBusinessName, openingCompanyWelcome, phaseTwoNameLine, timeOfDayGreeting, askHelpQuestion, language })}`;
  }
  if (language === 'es') {
    return `Solo como recordatorio: esta es una demostración rápida, pero te voy a atender como si ya estuviera trabajando en el sitio web de ${spokenBusinessName}. ${buildPhaseTwoOpening({ spokenBusinessName, openingCompanyWelcome, phaseTwoNameLine, timeOfDayGreeting, askHelpQuestion, language })}`;
  }
  return `Just as a reminder: this is a quick demo, but I'm going to help you as if I already worked on the ${spokenBusinessName} website. ${buildPhaseTwoOpening({ spokenBusinessName, openingCompanyWelcome, phaseTwoNameLine, timeOfDayGreeting, askHelpQuestion, language })}`;
};


const isLikelyCallablePhoneNumber = (value?: string | null) => {
  const normalized = normalizePhoneNumber(value ?? '');
  if (!/^\+\d{11,15}$/.test(normalized)) return false;

  if (!normalized.startsWith('+1')) return true;

  const digits = normalized.slice(2);
  if (digits.length !== 10) return false;

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  return /^[2-9]\d{2}$/.test(areaCode) && /^[2-9]\d{2}$/.test(exchange);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pad2 = (value: number) => value.toString().padStart(2, '0');

const formatNaiveCalendarDateTime = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;

const formatAppointmentLabel = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

  return `${parts} ET`;
};

const getDefaultAppointmentStart = () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);

  while (start.getDay() === 0 || start.getDay() === 6) {
    start.setDate(start.getDate() + 1);
  }

  start.setHours(10, 0, 0, 0);
  return start;
};

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const extractAppointmentTimeHint = (transcript: string) => {
  if (!transcript) return '';

  const compactTranscript = transcript.replace(/\s+/g, ' ').trim();
  const patterns = [
    /((?:today|tomorrow|next business day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[^.!?]{0,80})/i,
    /((?:at|for|around|by)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|in the morning|in the afternoon|in the evening)?)/i,
  ];

  for (const pattern of patterns) {
    const match = compactTranscript.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
};

const parseRequestedAppointmentStart = (appointmentTimeText?: string, transcript = '') => {
  const source = `${appointmentTimeText ?? ''} ${transcript}`.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!source) return null;

  const hasDayHint = /today|tomorrow|next business day|monday|tuesday|wednesday|thursday|friday|saturday|sunday/.test(source);

  const timePatterns = [
    { pattern: /\b(?:at|for|around|by)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/, hourIndex: 1, minuteIndex: 2, meridiemIndex: 3 },
    { pattern: /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/, hourIndex: 1, minuteIndex: 2, meridiemIndex: 3 },
    { pattern: /\b(\d{1,2})\s*o'?clock\b/, hourIndex: 1, minuteIndex: -1, meridiemIndex: -1 },
  ];

  let parsedTime: { hour: number; minute: number; meridiem?: string } | null = null;

  for (const config of timePatterns) {
    const match = source.match(config.pattern);
    if (!match) continue;

    parsedTime = {
      hour: parseInt(match[config.hourIndex], 10),
      minute: config.minuteIndex > -1 && match[config.minuteIndex] ? parseInt(match[config.minuteIndex], 10) : 0,
      meridiem: config.meridiemIndex > -1 ? match[config.meridiemIndex]?.replace(/\./g, '').toLowerCase() : undefined,
    };
    break;
  }

  if (!hasDayHint && !parsedTime) {
    return null;
  }

  const now = new Date();
  const target = getDefaultAppointmentStart();

  if (/\btoday\b/.test(source)) {
    target.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (/\btomorrow\b/.test(source)) {
    target.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    target.setDate(target.getDate() + 1);
  } else if (!/next business day/.test(source)) {
    for (const [weekdayName, weekdayIndex] of Object.entries(WEEKDAY_MAP)) {
      if (!new RegExp(`\\b${weekdayName}\\b`).test(source)) continue;
      target.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = (weekdayIndex - now.getDay() + 7) % 7 || 7;
      target.setDate(target.getDate() + diff);
      break;
    }
  }

  if (!/\btoday\b/.test(source)) {
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
  }

  if (parsedTime) {
    let { hour, minute } = parsedTime;
    let meridiem = parsedTime.meridiem;

    if (!meridiem) {
      if (/morning/.test(source)) meridiem = 'am';
      if (/afternoon|evening|tonight/.test(source)) meridiem = 'pm';
    }

    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (!meridiem && /evening|tonight/.test(source) && hour < 12) hour += 12;

    target.setHours(hour, minute, 0, 0);
  }

  return target;
};

async function retellFetch(path: string, apiKey: string, options: RequestInit = {}) {
  const res = await fetch(`${RETELL_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Retell API error [${res.status}]: ${JSON.stringify(data)}`);
  }

  return data;
}

async function ensureSharedRetellPrompt(apiKey: string, agentId: string) {
  // Always restore the shared mode-switching prompt before a demo call. The homepage
  // spokesperson flow uses the same Retell agents and can overwrite the LLM prompt
  // with landing-page-only instructions, so caching this caused website demos to
  // sometimes start with the generic AI Hidden Leads greeting.
  const agents = await retellFetch('/list-agents', apiKey);
  const agent = Array.isArray(agents)
    ? agents.find((entry: any) => entry?.agent_id === agentId)
    : null;

  const llmId = agent?.response_engine?.llm_id;
  if (!llmId) {
    throw new Error('Unable to resolve Retell LLM for shared web agent');
  }

  await retellFetch(`/update-retell-llm/${llmId}`, apiKey, {
    method: 'PATCH',
    body: JSON.stringify({
      general_prompt: SHARED_RETELL_PROMPT,
      begin_message: '{{exact_demo_opening}}',
    }),
  });

  UPDATED_PROMPT_AGENT_IDS.add(agentId);
}

async function invokeLiveTransferBridge({
  supabaseUrl,
  supabaseServiceRoleKey,
  transferTo,
  callerName,
  callerEmail,
  callerPhone,
  businessName,
  ownerName,
  callId,
}: {
  supabaseUrl: string;
  supabaseServiceRoleKey?: string | null;
  transferTo: string;
  callerName: string;
  callerEmail: string;
  callerPhone: string;
  businessName: string;
  ownerName: string;
  callId: string;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (supabaseServiceRoleKey) {
    headers.Authorization = `Bearer ${supabaseServiceRoleKey}`;
    headers.apikey = supabaseServiceRoleKey;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/live-transfer-bridge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      transferTo,
      callerPhone,
      callerName,
      callerEmail,
      businessName,
      ownerName,
      callId,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(`Live transfer bridge failed [${response.status}]: ${JSON.stringify(data)}`);
  }

  return data;
}

const getTranscriptText = (callData: any) => {
  if (!callData) return '';

  if (typeof callData.transcript === 'string') {
    return callData.transcript.trim();
  }

  const transcriptCandidates = [
    callData.transcript,
    callData.transcript_object,
    callData.transcript_with_tool_calls,
    callData.transcript_with_tool_calls_without_pii,
  ].filter(Array.isArray);

  for (const transcript of transcriptCandidates) {
    const flattened = transcript
      .map((entry: any) => {
        const speaker = entry?.role || entry?.speaker || entry?.name || 'Speaker';
        const text = entry?.content || entry?.text || entry?.transcript || entry?.message || entry?.result;
        if (!text || typeof text !== 'string') return '';
        return `${speaker}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');

    if (flattened.trim()) return flattened.trim();
  }

  return '';
};

// Strict-validate an email address. Returns '' when the candidate is
// implausible (too long, missing TLD, junk concatenated transcript, etc.)
const ALLOWED_TLDS = new Set([
  'com','net','org','io','co','ai','app','dev','me','us','uk','ca','au',
  'biz','info','tv','xyz','online','site','store','tech','shop','pro',
  'edu','gov','mil','br','mx','de','fr','es','it','nl','jp','cn','in',
]);

const isValidEmail = (value: string): boolean => {
  if (!value) return false;
  if (value.length < 6 || value.length > 80) return false;
  const m = value.match(/^([a-z0-9._%+-]{1,40})@([a-z0-9-]{1,40}(?:\.[a-z0-9-]{1,40})*)\.([a-z]{2,12})$/i);
  if (!m) return false;
  const [, local, , tld] = m;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!ALLOWED_TLDS.has(tld.toLowerCase())) return false;
  return true;
};

const normalizeEmailCandidate = (value?: string | null) => {
  if (!value) return '';

  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\(at\)|\[at\]/g, '@')
    .replace(/\(dot\)|\[dot\]/g, '.')
    .replace(/@+/g, '@');

  const match = normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,12}/);
  if (!match) return '';
  return isValidEmail(match[0]) ? match[0] : '';
};

const sanitizeCallerPhone = (value?: string | null) => {
  const normalized = normalizePhoneNumber(value ?? undefined);
  return isLikelyCallablePhoneNumber(normalized) ? normalized : '';
};

const extractCallerPhoneFromTranscript = (transcript: string) => {
  if (!transcript) return '';

  const matches = Array.from(transcript.matchAll(/(?:\+?\d[\d\s().-]{8,}\d)/g))
    .map((match) => normalizePhoneNumber(match[0]))
    .filter((value) => isLikelyCallablePhoneNumber(value));

  return matches.length > 0 ? matches[matches.length - 1] : '';
};

const formatPhoneForSpeech = (value?: string) => {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return '';

  const digits = normalized.replace(/^\+1/, '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3).split('').join(' ')}. ${digits.slice(3, 6).split('').join(' ')}. ${digits.slice(6).split('').join(' ')}`;
  }

  return normalized.split('').join(' ');
};

const formatEmailForSpeech = (value?: string | null) => {
  const normalized = normalizeEmailCandidate(value);
  if (!normalized) return '';

  return normalized
    .replace(/@/g, ' at ')
    .replace(/\./g, ' dot ')
    .replace(/-/g, ' dash ')
    .replace(/_/g, ' underscore ');
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Strict transcript email extraction. Only accepts:
//   1. A literal "name@domain.tld" match in the raw transcript, OR
//   2. A spoken-form match found in a TIGHT window (≤80 chars) around the
//      word "email" — e.g. "my email is john at gmail dot com".
// The previous version flattened the ENTIRE transcript and ran " at " → "@"
// globally, which dumped random transcript text into the email field.
const extractCallerEmailFromTranscript = (transcript: string) => {
  if (!transcript) return '';

  // 1. Direct literal matches (strongest signal)
  const directMatches = Array.from(
    transcript.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,12}/gi),
  )
    .map((m) => normalizeEmailCandidate(m[0]))
    .filter(Boolean);
  if (directMatches.length > 0) return directMatches[directMatches.length - 1];

  // 2. Spoken-form: scan windows that follow the word "email"
  const lower = transcript.toLowerCase();
  const windowMatches: string[] = [];
  const re = /\bemail\b[^.\n]{0,80}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    const window = m[0]
      .replace(/\bg\s*mail\b/g, 'gmail')
      .replace(/\bhot\s*mail\b/g, 'hotmail')
      .replace(/\byahoo\b/g, 'yahoo')
      .replace(/\bout\s*look\b/g, 'outlook')
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+dot\s+/g, '.')
      .replace(/[^a-z0-9@._%+-]/g, '')
      .replace(/@+/g, '@');

    const candidate = window.match(/[a-z0-9._%+-]{2,40}@[a-z0-9.-]{2,40}\.[a-z]{2,12}/);
    if (candidate && isValidEmail(candidate[0])) windowMatches.push(candidate[0]);
  }
  return windowMatches.length > 0 ? windowMatches[windowMatches.length - 1] : '';
};

const extractCallerNameFromTranscript = (transcript: string) => {
  if (!transcript) return '';

  const matches = Array.from(
    transcript.matchAll(/User:\s.*?\b(?:my name is|this is|i am|i'm)\s+([A-Za-z][A-Za-z'-]*)/gi),
  );

  return matches.length > 0 ? matches[matches.length - 1][1] : '';
};

async function persistCapturedCallerDetails({
  supabase,
  callId,
  leadId,
  prospectId,
  businessName,
  callerName,
  callerEmail,
  callerPhone,
}: {
  supabase: any;
  callId: string;
  leadId?: string;
  prospectId?: string;
  businessName: string;
  callerName: string;
  callerEmail: string;
  callerPhone: string;
}) {
  const safeName = callerName.trim();
  const safeEmail = normalizeEmailCandidate(callerEmail);
  const safePhone = sanitizeCallerPhone(callerPhone);

  let leadUpdated = false;
  let prospectUpdated = false;

  if (leadId) {
    const leadUpdates: Record<string, string> = {};
    if (safeName && !/crm prospect/i.test(safeName)) leadUpdates.full_name = safeName;
    if (safeEmail) leadUpdates.email = safeEmail;
    if (safePhone) leadUpdates.phone = safePhone;

    if (Object.keys(leadUpdates).length > 0) {
      const { error } = await supabase.from('leads').update(leadUpdates).eq('id', leadId);
      if (error) throw error;
      leadUpdated = true;
    }
  }

  if (prospectId) {
    const { data: existingProspect, error: prospectFetchError } = await supabase
      .from('prospects')
      .select('owner_name, owner_email, owner_phone, notes, contact_method')
      .eq('id', prospectId)
      .maybeSingle();

    if (prospectFetchError) throw prospectFetchError;

    if (existingProspect) {
      const prospectUpdates: Record<string, string> = {};

      if (safeName && !existingProspect.owner_name) prospectUpdates.owner_name = safeName;
      if (safeEmail && !existingProspect.owner_email) prospectUpdates.owner_email = safeEmail;
      if (safePhone && !existingProspect.owner_phone) prospectUpdates.owner_phone = safePhone;

      if ((!existingProspect.contact_method || existingProspect.contact_method === 'unknown') && (safePhone || safeEmail)) {
        prospectUpdates.contact_method = safePhone ? 'phone' : 'email';
      }

      const noteParts = [
        `Demo callback request captured (${callId})`,
        businessName ? `business: ${businessName}` : '',
        safeName ? `name: ${safeName}` : '',
        safeEmail ? `email: ${safeEmail}` : '',
        safePhone ? `phone: ${safePhone}` : '',
      ].filter(Boolean);

      const noteEntry = noteParts.join(' · ');
      if (noteEntry && !existingProspect.notes?.includes(callId)) {
        prospectUpdates.notes = existingProspect.notes?.trim()
          ? `${existingProspect.notes.trim()}\n\n${noteEntry}`
          : noteEntry;
      }

      if (Object.keys(prospectUpdates).length > 0) {
        const { error } = await supabase.from('prospects').update(prospectUpdates).eq('id', prospectId);
        if (error) throw error;
        prospectUpdated = true;
      }
    }
  }

  return { leadUpdated, prospectUpdated };
}

const parseJsonContent = (value: string) => {
  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(cleaned);
};

async function summarizeTranscript({
  transcript,
  businessName,
  ownerName,
  ownerPhone,
  ownerEmail,
  googleApiKey,
  existingSummary,
}: {
  transcript: string;
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  googleApiKey?: string;
  existingSummary?: string;
}) {
  const ownerNamePattern = ownerName.trim()
    ? new RegExp(`(?:speak|talk|connect|transfer|call)(?:\\s+me)?(?:\\s+over)?(?:\\s+to|\\s+with)?\\s+${escapeRegExp(ownerName.trim())}`, 'i')
    : null;
  const genericTransferPattern = /transfer|connect me|put me through|live handoff|live transfer|speak (?:to|with) (?:someone|somebody|a person|a human|the owner|the team)|talk (?:to|with) (?:someone|somebody|a person|a human|the owner|the team)|someone live|someone right now/i;

  const fallbackFlags = {
    callbackRequested: /callback|call me|call back|speak with|human|owner/i.test(transcript),
    appointmentRequested: /appointment|book|schedule|consultation|meeting/i.test(transcript),
    transferRequested: genericTransferPattern.test(transcript) || Boolean(ownerNamePattern?.test(transcript)),
  };

  const fallbackAppointmentTimeText = extractAppointmentTimeHint(transcript);
  const fallbackCallerName = extractCallerNameFromTranscript(transcript);
  const fallbackCallerEmail = extractCallerEmailFromTranscript(transcript);
  const fallbackCallerPhone = extractCallerPhoneFromTranscript(transcript);

  if (!googleApiKey) {
    return {
      summary: existingSummary || 'Call completed. AI summary is unavailable because GOOGLE_API_KEY is not configured.',
      nextStep: fallbackFlags.appointmentRequested
        ? 'Confirm the requested appointment time and send the owner the details.'
        : fallbackFlags.transferRequested
          ? `Send an immediate callback alert to ${ownerName}.`
          : fallbackFlags.callbackRequested
            ? 'Call the lead back directly.'
            : 'Review the transcript and follow up if needed.',
      ...fallbackFlags,
      appointmentTimeText: fallbackAppointmentTimeText,
      callerName: fallbackCallerName,
      callerEmail: fallbackCallerEmail,
      callerPhone: fallbackCallerPhone,
      keyPoints: [],
    };
  }

  const response = await fetch(GOOGLE_AI_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You summarize demo call transcripts for business owners. Return strict JSON with these keys only: summary (string), nextStep (string), callbackRequested (boolean), appointmentRequested (boolean), transferRequested (boolean), appointmentTimeText (string), callerName (string), callerEmail (string), callerPhone (string), keyPoints (array of up to 4 short strings). callerName must be the final confirmed caller name, not the business owner. callerEmail must be the final corrected caller email address if one was provided. callerPhone must be the final confirmed callback phone number in digits if one was provided. appointmentTimeText must capture the exact requested appointment slot or time window if one was mentioned, otherwise return an empty string. Keep the summary practical and concise.',
        },
        {
          role: 'user',
          content: `Business: ${businessName}\nOwner: ${ownerName}\nEmail on file: ${ownerEmail}\nPhone on file: ${ownerPhone || 'not provided'}\n\nTranscript:\n${transcript}`,
        },
      ],
    }),
  });

  const completion = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`AI summary failed [${response.status}]: ${JSON.stringify(completion)}`);
  }

  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('AI summary response was empty');
  }

  const parsed = parseJsonContent(content);

  return {
    summary: parsed.summary || existingSummary || 'Call completed.',
    nextStep:
      parsed.nextStep ||
      (fallbackFlags.appointmentRequested
        ? 'Confirm the requested appointment time and send the owner the details.'
        : fallbackFlags.transferRequested
          ? `Send an immediate callback alert to ${ownerName}.`
          : fallbackFlags.callbackRequested
            ? 'Call the lead back directly.'
            : 'Review the transcript and follow up if needed.'),
    callbackRequested: Boolean(parsed.callbackRequested ?? fallbackFlags.callbackRequested),
    appointmentRequested: Boolean(parsed.appointmentRequested ?? fallbackFlags.appointmentRequested),
    transferRequested: Boolean(parsed.transferRequested ?? fallbackFlags.transferRequested),
    appointmentTimeText:
      typeof parsed.appointmentTimeText === 'string' && parsed.appointmentTimeText.trim()
        ? parsed.appointmentTimeText.trim()
        : fallbackAppointmentTimeText,
    callerName: typeof parsed.callerName === 'string' && parsed.callerName.trim() ? parsed.callerName.trim() : fallbackCallerName,
    callerEmail:
      typeof parsed.callerEmail === 'string' && parsed.callerEmail.trim()
        ? normalizeEmailCandidate(parsed.callerEmail)
        : fallbackCallerEmail,
    callerPhone:
      typeof parsed.callerPhone === 'string' && parsed.callerPhone.trim()
        ? normalizePhoneNumber(parsed.callerPhone)
        : fallbackCallerPhone,
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 4) : [],
  };
}

async function sendSummaryEmail({
  resendApiKey,
  callerName,
  callerEmail,
  callerPhone,
  ownerName,
  ownerEmail,
  ownerPhone,
  businessName,
  websiteUrl,
  transcript,
  summary,
  nextStep,
  callbackRequested,
  appointmentRequested,
  transferRequested,
  appointmentScheduledFor,
  keyPoints,
  callDurationSeconds,
}: {
  resendApiKey: string;
  callerName: string;
  callerEmail: string;
  callerPhone: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  businessName: string;
  websiteUrl: string;
  transcript: string;
  summary: string;
  nextStep: string;
  callbackRequested: boolean;
  appointmentRequested: boolean;
  transferRequested: boolean;
  appointmentScheduledFor?: string | null;
  keyPoints: string[];
  callDurationSeconds?: number;
}) {
  const pointsHtml = keyPoints.length
    ? `<ul>${keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
    : '<p>No additional highlights were extracted.</p>';

  const appointmentHtml = appointmentScheduledFor
    ? `<p style="margin: 0 0 8px;"><strong>Confirmed time:</strong> ${escapeHtml(appointmentScheduledFor)}</p>`
    : '';

  // Format transcript as chat-style conversation
  const formatTranscriptChat = (raw: string) => {
    if (!raw) return '<p style="color:#94a3b8;font-style:italic;">Transcript was not available yet.</p>';
    const lines = raw.split('\n').filter(l => l.trim());
    return lines.map(line => {
      const match = line.match(/^(Agent|User|AI|Caller|Aspen|Customer):\s*(.*)/i);
      if (match) {
        const isAgent = /^(agent|ai|aspen)/i.test(match[1]);
        const align = isAgent ? 'left' : 'right';
        const bgColor = isAgent ? '#f0fdf4' : '#eff6ff';
        const borderColor = isAgent ? '#22c55e' : '#3b82f6';
        const label = isAgent ? '🤖 Aspen' : '👤 Caller';
        return `<div style="text-align:${align};margin:6px 0;">
          <span style="font-size:10px;color:#64748b;display:block;margin-bottom:2px;">${label}</span>
          <div style="display:inline-block;max-width:85%;padding:10px 14px;border-radius:12px;background:${bgColor};border-left:3px solid ${borderColor};font-size:13px;line-height:1.5;color:#1e293b;text-align:left;">${escapeHtml(match[2])}</div>
        </div>`;
      }
      return `<div style="text-align:center;margin:4px 0;"><span style="font-size:12px;color:#94a3b8;">${escapeHtml(line)}</span></div>`;
    }).join('');
  };

  const demoLink = websiteUrl ? `${websiteUrl.startsWith('http') ? '' : 'https://'}${websiteUrl}` : '';
  const salesPageUrl = 'https://aihiddenleads.lovable.app';

  const html = `
    <div style="font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #0a0f1a 0%, #111827 100%); padding: 32px 28px; text-align: center;">
        <div style="margin-bottom: 16px;">
          <span style="font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">AI </span>
          <span style="font-size: 32px; font-weight: 800; color: #22c55e; letter-spacing: -0.5px;">Hidden</span>
          <span style="font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;"> Leads</span>
        </div>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Voice AI Demo Recap</p>
      </div>

      <!-- Business info bar -->
      <div style="background: #f8fafc; padding: 16px 28px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center;">
        <div>
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">📞 ${escapeHtml(businessName)}</p>
          ${websiteUrl ? `<p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">🌐 <a href="${escapeHtml(demoLink)}" style="color:#3b82f6;text-decoration:none;">${escapeHtml(websiteUrl)}</a></p>` : ''}
        </div>
      </div>

      <div style="padding: 28px;">
        <!-- Caller Details Card -->
        <div style="background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #166534;">👤 Caller Details</p>
          <table style="width: 100%; font-size: 13px; color: #1e293b;">
            <tr><td style="padding: 4px 0; font-weight: 600; width: 130px;">Name:</td><td style="padding: 4px 0;">${escapeHtml(callerName || 'Not captured')}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Email:</td><td style="padding: 4px 0;">${escapeHtml(callerEmail || 'Not captured')}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Phone:</td><td style="padding: 4px 0;">${escapeHtml(callerPhone || 'Not captured')}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Call Duration:</td><td style="padding: 4px 0;">${callDurationSeconds ? `${Math.floor(callDurationSeconds / 60)}m ${callDurationSeconds % 60}s` : 'Unavailable'}</td></tr>
          </table>
        </div>

        <!-- AI Summary Card -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #0f172a;">🧠 AI Summary</p>
          <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #334155;">${escapeHtml(summary)}</p>
          <p style="margin: 0 0 10px; font-size: 13px; color: #475569;"><strong>Next step:</strong> ${escapeHtml(nextStep)}</p>
          
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
            <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: ${callbackRequested ? '#dcfce7' : '#f1f5f9'}; color: ${callbackRequested ? '#166534' : '#94a3b8'};">
              ${callbackRequested ? '✅' : '⬜'} Callback
            </span>
            <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: ${appointmentRequested ? '#dbeafe' : '#f1f5f9'}; color: ${appointmentRequested ? '#1e40af' : '#94a3b8'};">
              ${appointmentRequested ? '✅' : '⬜'} Appointment
            </span>
            <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: ${transferRequested ? '#fef3c7' : '#f1f5f9'}; color: ${transferRequested ? '#92400e' : '#94a3b8'};">
              ${transferRequested ? '✅' : '⬜'} Transfer
            </span>
          </div>
          ${appointmentHtml ? `<div style="margin-top: 10px;">${appointmentHtml}</div>` : ''}
        </div>

        <!-- Key Points -->
        ${keyPoints.length ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px; font-size: 15px; font-weight: 700; color: #92400e;">⭐ Key Points</p>
          <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #78350f; line-height: 1.8;">
            ${keyPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
          </ul>
        </div>` : ''}

        <!-- Transcript (Chat Style) -->
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #0f172a;">💬 Conversation Transcript</p>
          <div style="max-height: 400px; overflow-y: auto; padding: 4px;">
            ${formatTranscriptChat(transcript)}
          </div>
        </div>

        <!-- CTA: Try Demo Again -->
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${escapeHtml(salesPageUrl)}/#demo-form" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #22c55e, #16a34a); color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 14px rgba(34,197,94,0.4);">🎙️ Try the Demo Again</a>
        </div>

        <!-- Sales Section -->
        <div style="background: linear-gradient(135deg, #0a0f1a, #1e293b); border-radius: 12px; padding: 24px; color: #ffffff;">
          <p style="margin: 0 0 4px; font-size: 18px; font-weight: 800;">Ready to never miss a lead again?</p>
          <p style="margin: 0 0 16px; font-size: 13px; color: #94a3b8;">AI Hidden Leads gives your business superpowers:</p>
          <table style="width: 100%; font-size: 13px; color: #e2e8f0; line-height: 1.8;">
            <tr><td style="padding: 3px 0;">🤖 AI Voice Agent answers calls 24/7 — never miss a lead</td></tr>
            <tr><td style="padding: 3px 0;">💬 AI Chat Widget engages every website visitor instantly</td></tr>
            <tr><td style="padding: 3px 0;">🔍 Smart Lead Generation finds ideal customers daily</td></tr>
            <tr><td style="padding: 3px 0;">📧 Automated Outreach via email & SMS at scale</td></tr>
            <tr><td style="padding: 3px 0;">⚡ Speed-to-Lead calls prospects within 60 seconds</td></tr>
            <tr><td style="padding: 3px 0;">📊 Full CRM dashboard to track every interaction</td></tr>
          </table>
          <div style="text-align: center; margin-top: 20px;">
            <a href="${escapeHtml(salesPageUrl)}/#pricing" style="display: inline-block; padding: 12px 28px; background: #22c55e; color: #0a0f1a; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 10px;">See Plans & Pricing →</a>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; font-size: 11px; color: #94a3b8;">© ${new Date().getFullYear()} AI Hidden Leads · <a href="${escapeHtml(salesPageUrl)}" style="color: #22c55e; text-decoration: none;">aihiddenleads.com</a></p>
        </div>
      </div>
    </div>
  `;

  const requestedRecipients = Array.from(new Set([ownerEmail, TESTING_INBOX_EMAIL].filter(Boolean)));

  const sendEmail = async (to: string[]) => {
    const res = await fetch(RESEND_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AI Hidden Leads Demo <onboarding@resend.dev>',
        to,
        subject: `Aspen demo recap for ${businessName}`,
        html,
        text: `Aspen demo call recap\n\nBusiness: ${businessName}\nWebsite: ${websiteUrl}\nCaller name: ${callerName || 'Not captured'}\nCaller email: ${callerEmail || 'Not captured'}\nCaller phone: ${callerPhone || 'Not captured'}\nBusiness owner: ${ownerName}\nOwner email: ${ownerEmail}\nOwner phone: ${ownerPhone || 'Not provided'}\n\nSummary: ${summary}\nNext step: ${nextStep}\nCallback requested: ${callbackRequested ? 'Yes' : 'No'}\nAppointment requested: ${appointmentRequested ? 'Yes' : 'No'}\nImmediate callback requested: ${transferRequested ? 'Yes' : 'No'}\n${appointmentScheduledFor ? `Confirmed time: ${appointmentScheduledFor}\n` : ''}\nTranscript:\n${transcript || 'Transcript was not available yet.'}`,
      }),
    });

    const data = await res.json().catch(() => null);
    return { res, data, recipients: to };
  };

  let result = await sendEmail(requestedRecipients);
  let warning: string | null = null;

  const testingRestriction =
    result.res.status === 403 &&
    result.data?.name === 'validation_error' &&
    typeof result.data?.message === 'string' &&
    result.data.message.includes('testing emails');

  if (!result.res.ok && testingRestriction && requestedRecipients.some((email) => email !== TESTING_INBOX_EMAIL)) {
    console.warn('Resend test mode active; retrying with testing inbox only.');
    result = await sendEmail([TESTING_INBOX_EMAIL]);
    warning = `Testing mode: recap delivered to ${TESTING_INBOX_EMAIL} only.`;
  }

  if (!result.res.ok) {
    throw new Error(`Resend email failed [${result.res.status}]: ${JSON.stringify(result.data)}`);
  }

  return {
    id: result.data?.id ?? null,
    deliveredTo: result.recipients,
    warning,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const retellApiKey = Deno.env.get('RETELL_API_KEY');
    if (!retellApiKey) {
      return jsonResponse({ error: 'RETELL_API_KEY not configured' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'create-web-call';

    if (action === 'chat-completion') {
      const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
      if (!googleApiKey) {
        return jsonResponse({ error: 'GOOGLE_API_KEY not configured' }, 500);
      }

      const systemPrompt = body.systemPrompt || 'You are a helpful assistant.';
      const chatMessages = Array.isArray(body.messages) ? body.messages : [];

      try {
        const response = await fetch(GOOGLE_AI_BASE, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gemini-2.5-flash',
            temperature: 0.7,
            messages: [
              { role: 'system', content: systemPrompt },
              ...chatMessages,
            ],
          }),
        });

        const completion = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(`AI chat failed [${response.status}]: ${JSON.stringify(completion)}`);
        }

        const content = completion?.choices?.[0]?.message?.content || 'I apologize, I had trouble processing that. Could you try again?';

        return jsonResponse({ success: true, content });
      } catch (err) {
        console.error('Chat completion error:', err);
        return jsonResponse({ error: err instanceof Error ? err.message : 'Chat failed' }, 500);
      }
    }

    if (action === 'get-call-transfer-context') {
      const callId = typeof body.callId === 'string' ? body.callId.trim() : '';
      if (!callId) {
        return jsonResponse({ error: 'callId is required' }, 400);
      }

      const fallbackCallerName = typeof body.callerName === 'string' ? body.callerName.trim() : '';
      const fallbackCallerEmail = typeof body.callerEmail === 'string' ? normalizeEmailCandidate(body.callerEmail) : '';
      const fallbackCallerPhone = typeof body.callerPhone === 'string' ? sanitizeCallerPhone(body.callerPhone) : '';

      const callData = await retellFetch(`/v2/get-call/${callId}`, retellApiKey, { method: 'GET' });
      const transcript = getTranscriptText(callData);

      const transcriptCallerPhone = sanitizeCallerPhone(extractCallerPhoneFromTranscript(transcript));
      const resolvedCallerPhone = transcriptCallerPhone || fallbackCallerPhone;

      return jsonResponse({
        success: true,
        transcriptAvailable: Boolean(transcript),
        callerName: extractCallerNameFromTranscript(transcript) || fallbackCallerName,
        callerEmail: extractCallerEmailFromTranscript(transcript) || fallbackCallerEmail,
        callerPhone: resolvedCallerPhone,
      });
    }

    if (action === 'email-call-summary') {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        return jsonResponse({ error: 'RESEND_API_KEY not configured' }, 500);
      }

      const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const callId = typeof body.callId === 'string' ? body.callId : '';
      const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
      const prospectId = typeof body.prospectId === 'string' ? body.prospectId.trim() : '';
      const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim() : '';
      const ownerNameInput = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
      const ownerPhone = typeof body.ownerPhone === 'string' ? body.ownerPhone.trim() : '';
      const fallbackCallerName = typeof body.callerName === 'string' ? body.callerName.trim() : '';
      const fallbackCallerEmail = typeof body.callerEmail === 'string' ? normalizeEmailCandidate(body.callerEmail) : '';
      const fallbackCallerPhone = typeof body.callerPhone === 'string' ? sanitizeCallerPhone(body.callerPhone) : '';
      const transferAlreadyStarted = body.transferAlreadyStarted === true;
      const skipEmail = body.skipEmail === true;
      const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : 'Demo Business';
      const websiteUrl = typeof body.websiteUrl === 'string' ? body.websiteUrl.trim() : '';
      const resolvedOwnerName = ownerNameInput || DEFAULT_OWNER_NAME;

      if (!callId) {
        return jsonResponse({ error: 'callId is required' }, 400);
      }
      const effectiveOwnerEmail = ownerEmail || TESTING_INBOX_EMAIL;

      console.log('Preparing call summary email for call:', callId);

      let callData: any = null;
      let transcript = '';

      for (let attempt = 0; attempt < 6; attempt += 1) {
        callData = await retellFetch(`/v2/get-call/${callId}`, retellApiKey, { method: 'GET' });
        transcript = getTranscriptText(callData);
        if (transcript) break;
        await delay(2500);
      }

      const aiSummary = await summarizeTranscript({
        transcript,
        businessName,
        ownerName: resolvedOwnerName,
        ownerPhone,
        ownerEmail: effectiveOwnerEmail,
        googleApiKey: googleApiKey || undefined,
        existingSummary: callData?.call_analysis?.call_summary || callData?.call_analysis?.summary,
      });

      const resolvedCallerName = aiSummary.callerName || fallbackCallerName;
      const resolvedCallerEmail = aiSummary.callerEmail || fallbackCallerEmail;
      const resolvedCallerPhone = sanitizeCallerPhone(aiSummary.callerPhone) || fallbackCallerPhone;

      let contactPersisted = false;
      let contactPersistWarning: string | null = null;

      if (supabaseUrl && supabaseServiceRoleKey && (leadId || prospectId)) {
        try {
          const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
          const persistResult = await persistCapturedCallerDetails({
            supabase: adminClient,
            callId,
            leadId: leadId || undefined,
            prospectId: prospectId || undefined,
            businessName,
            callerName: resolvedCallerName,
            callerEmail: resolvedCallerEmail,
            callerPhone: resolvedCallerPhone,
          });
          contactPersisted = persistResult.leadUpdated || persistResult.prospectUpdated;
        } catch (persistError) {
          contactPersistWarning = persistError instanceof Error ? persistError.message : 'Unable to save caller contact details.';
          console.error('Failed to persist caller details (non-fatal):', persistError);
        }
      }

      // Persist call history record
      let callHistoryId: string | null = null;
      if (supabaseUrl && supabaseServiceRoleKey) {
        try {
          const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
          const callDurationSeconds = typeof callData?.duration_ms === 'number' ? Math.round(callData.duration_ms / 1000) : null;
          
          const { data: historyRow, error: historyError } = await adminClient
            .from('call_history')
            .insert({
              retell_call_id: callId,
              lead_id: leadId || null,
              prospect_id: prospectId || null,
              business_name: businessName,
              website_url: websiteUrl || null,
              owner_name: resolvedOwnerName,
              owner_email: effectiveOwnerEmail,
              owner_phone: ownerPhone || null,
              caller_name: resolvedCallerName || null,
              caller_email: resolvedCallerEmail || null,
              caller_phone: resolvedCallerPhone || null,
              caller_phone_source: resolvedCallerPhone ? 'transcript' : null,
              call_status: 'completed',
              transfer_requested: aiSummary.transferRequested,
              transfer_status: aiSummary.transferRequested
                ? (transferAlreadyStarted ? 'dialing_caller' : 'queued')
                : 'not_requested',
              summary: aiSummary.summary,
              next_step: aiSummary.nextStep,
              transcript: transcript || null,
              key_points: aiSummary.keyPoints || [],
              recording_url: callData?.recording_url || callData?.recording_multi_channel_url || null,
              duration_seconds: callDurationSeconds,
              started_at: callData?.start_timestamp ? new Date(callData.start_timestamp).toISOString() : new Date().toISOString(),
              ended_at: callData?.end_timestamp ? new Date(callData.end_timestamp).toISOString() : new Date().toISOString(),
              metadata: {
                callbackRequested: aiSummary.callbackRequested,
                appointmentRequested: aiSummary.appointmentRequested,
                appointmentTimeText: aiSummary.appointmentTimeText || null,
                contactPersisted,
                captureFailed: !resolvedCallerEmail && !resolvedCallerPhone,
                captureFailedReason:
                  !resolvedCallerEmail && !resolvedCallerPhone
                    ? 'No valid caller email or phone could be extracted from the transcript.'
                    : null,
              },
            })
            .select('id')
            .single();

          if (historyError) {
            console.error('Failed to persist call history (non-fatal):', historyError);
          } else {
            callHistoryId = historyRow?.id || null;
            console.log('Call history persisted:', callHistoryId);
          }
        } catch (histErr) {
          console.error('Call history persistence error (non-fatal):', histErr);
        }
      }

      let appointmentScheduledFor: string | null = null;
      let calendarWarning: string | null = null;
      let calendarEventId: string | null = null;

      if (aiSummary.appointmentRequested) {
        try {
          const preferredStart =
            parseRequestedAppointmentStart(aiSummary.appointmentTimeText, transcript) ?? getDefaultAppointmentStart();
          const attendeeEmail = resolvedCallerEmail || undefined;
          const bookingContext = await findAvailableSlotAcrossCalendars([effectiveOwnerEmail, TESTING_INBOX_EMAIL], preferredStart, 15);
          const calendarIdForBooking = bookingContext.calendarId;
          const appointmentStart = bookingContext.slot;
          const appointmentEnd = new Date(appointmentStart);
          appointmentEnd.setMinutes(appointmentEnd.getMinutes() + 15);
          calendarWarning = bookingContext.warning;

          const wasRescheduled = appointmentStart.getTime() !== preferredStart.getTime();
          appointmentScheduledFor = `${formatAppointmentLabel(appointmentStart)} (15 minutes)${wasRescheduled ? ' — adjusted from requested time due to existing calendar conflict' : ''}`;

          const calEvent = await createCalendarEvent({
            calendarId: calendarIdForBooking,
            summary: `Aspen Demo Follow-up: ${resolvedOwnerName} — ${businessName}`,
            description: `Auto-booked by Aspen AI after a demo call.\n\nSummary: ${aiSummary.summary}\nNext step: ${aiSummary.nextStep}\nRequested slot: ${appointmentScheduledFor || aiSummary.appointmentTimeText || 'Default next business day at 10:00 AM ET'}\n\nPhone: ${ownerPhone || 'Not provided'}\nEmail: ${effectiveOwnerEmail}\nWebsite: ${websiteUrl}`,
            startTime: formatNaiveCalendarDateTime(appointmentStart),
            endTime: formatNaiveCalendarDateTime(appointmentEnd),
            attendeeEmail,
            timeZone: DEFAULT_TIME_ZONE,
          });

          calendarEventId = calEvent?.id || null;
          console.log('Calendar event created:', calendarEventId);

          if (!attendeeEmail) {
            calendarWarning = [calendarWarning, 'Aspen could not confidently capture the caller email, so no invite email was sent.']
              .filter(Boolean)
              .join(' ');
          }
        } catch (calErr) {
          calendarWarning = calErr instanceof Error ? calErr.message : 'Calendar availability could not be checked.';
          console.error('Failed to create calendar event (non-fatal):', calErr);
        }
      }

      let liveTransferStarted = false;
      let transferWarning: string | null = null;

      if (aiSummary.transferRequested && !transferAlreadyStarted) {
        if (resolvedCallerPhone) {
          try {
            const bridgeResult = await invokeLiveTransferBridge({
              supabaseUrl: supabaseUrl || '',
              supabaseServiceRoleKey,
              transferTo: ownerPhone,
              callerName: resolvedCallerName || 'a caller',
              callerEmail: resolvedCallerEmail,
              callerPhone: resolvedCallerPhone,
              businessName,
              ownerName: resolvedOwnerName,
              callId,
            });
            liveTransferStarted = true;
            console.log('Fallback live transfer initiated for call:', callId);

            // Update call_history with transfer details
            if (callHistoryId && supabaseUrl && supabaseServiceRoleKey) {
              try {
                const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
                await adminClient.from('call_history').update({
                  transfer_status: 'dialing_caller',
                  transfer_conference_name: bridgeResult?.conferenceName || null,
                  transfer_caller_call_sid: bridgeResult?.callerCallSid || null,
                  transfer_owner_call_sid: bridgeResult?.ownerCallSid || null,
                  transfer_target_phone: bridgeResult?.transferTo || ownerPhone || null,
                }).eq('id', callHistoryId);
              } catch (updateErr) {
                console.warn('Failed to update call_history with transfer details:', updateErr);
              }
            }
          } catch (transferErr) {
            transferWarning = transferErr instanceof Error ? transferErr.message : 'Unable to start live transfer.';
            console.error('Fallback live transfer failed (non-fatal):', transferErr);

            // Record transfer failure in call_history
            if (callHistoryId && supabaseUrl && supabaseServiceRoleKey) {
              try {
                const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
                await adminClient.from('call_history').update({
                  transfer_status: 'failed',
                  transfer_error: transferWarning,
                }).eq('id', callHistoryId);
              } catch (updateErr) {
                console.warn('Failed to record transfer failure:', updateErr);
              }
            }
          }
        } else {
          transferWarning = 'Transfer was requested, but Aspen could not confirm the caller phone number.';

          if (callHistoryId && supabaseUrl && supabaseServiceRoleKey) {
            try {
              const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
              await adminClient.from('call_history').update({
                transfer_status: 'failed',
                transfer_error: transferWarning,
              }).eq('id', callHistoryId);
            } catch (updateErr) {
              console.warn('Failed to record missing caller phone transfer failure:', updateErr);
            }
          }
        }
      }

      let emailResult: { id: string | null; deliveredTo: string[]; warning: string | null } | null = null;
      let emailWarning: string | null = null;

      if (!skipEmail) {
        try {
          emailResult = await sendSummaryEmail({
            resendApiKey,
            callerName: resolvedCallerName,
            callerEmail: resolvedCallerEmail,
            callerPhone: resolvedCallerPhone,
            ownerName: resolvedOwnerName,
            ownerEmail: effectiveOwnerEmail,
            ownerPhone,
            businessName,
            websiteUrl,
            transcript,
            summary: aiSummary.summary,
            nextStep: aiSummary.nextStep,
            callbackRequested: aiSummary.callbackRequested,
            appointmentRequested: aiSummary.appointmentRequested,
            transferRequested: aiSummary.transferRequested,
            appointmentScheduledFor,
            keyPoints: aiSummary.keyPoints,
            callDurationSeconds:
              typeof callData?.duration_ms === 'number' ? Math.round(callData.duration_ms / 1000) : undefined,
          });

          emailWarning = emailResult.warning;
          console.log('Call summary email sent:', emailResult.id || 'no-id');
        } catch (emailErr) {
          emailWarning = emailErr instanceof Error ? emailErr.message : 'Unable to send recap email.';
          console.error('Failed to send recap email (non-fatal):', emailErr);
        }
      } else {
        console.log('Email skipped (skipEmail flag set) — call history ID:', callHistoryId);
      }

      // Auto-send WhatsApp/SMS recap when caller phone is verified E.164 +
      // SMS-capable. Keeps the spam guard (sanitizeCallerPhone already
      // rejects junk), removes the manual button step for clean leads.
      let autoRecapSent = false;
      let autoRecapWarning: string | null = null;
      let autoRecapSid: string | null = null;
      if (resolvedCallerPhone && supabaseUrl && supabaseServiceRoleKey) {
        try {
          const recapResp = await fetch(`${supabaseUrl}/functions/v1/send-demo-recap-whatsapp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
            body: JSON.stringify({
              leadId: leadId || undefined,
              phone: resolvedCallerPhone,
              fullName: resolvedCallerName || '',
              businessName,
              websiteUrl,
              customMessage:
                `Hi ${(resolvedCallerName || 'there').split(' ')[0]}! Thanks for the Aspen demo for ${businessName}.\n\n` +
                `${aiSummary.summary}\n\nNext step: ${aiSummary.nextStep}\n\n— AI Hidden Leads (Reply STOP to opt out)`,
            }),
          });
          const recapData = await recapResp.json().catch(() => ({}));
          if (recapResp.ok && recapData?.success) {
            autoRecapSent = true;
            autoRecapSid = recapData.sid || null;
            console.log('Auto recap sent:', autoRecapSid);
          } else {
            autoRecapWarning = recapData?.error || `recap send failed (${recapResp.status})`;
            console.warn('Auto recap not sent:', autoRecapWarning);
          }
        } catch (recapErr) {
          autoRecapWarning = recapErr instanceof Error ? recapErr.message : 'recap send error';
          console.error('Auto recap failed (non-fatal):', recapErr);
        }
      } else if (!resolvedCallerPhone) {
        autoRecapWarning = 'Caller phone not captured — recap not auto-sent.';
      }

      // Persist auto-recap debug info to call_history.metadata so the CRM
      // debug panel can show what happened on each call.
      if (callHistoryId && supabaseUrl && supabaseServiceRoleKey) {
        try {
          const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
          const recapMeta = {
            autoRecap: {
              attempted: Boolean(resolvedCallerPhone),
              sent: autoRecapSent,
              sid: autoRecapSid,
              warning: autoRecapWarning,
              normalizedPhone: resolvedCallerPhone || null,
              attemptedAt: new Date().toISOString(),
            },
          };
          // Merge into existing metadata (jsonb concatenation preserves keys)
          const { data: existing } = await adminClient
            .from('call_history').select('metadata').eq('id', callHistoryId).maybeSingle();
          await adminClient.from('call_history').update({
            metadata: { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...recapMeta },
          }).eq('id', callHistoryId);

        } catch (metaErr) {
          console.warn('Failed to persist auto-recap metadata (non-fatal):', metaErr);
        }
      }


      return jsonResponse({
        success: true,
        callHistoryId,
        callbackRequested: aiSummary.callbackRequested,
        appointmentRequested: aiSummary.appointmentRequested,
        transferRequested: aiSummary.transferRequested,
        emailId: emailResult?.id ?? null,
        emailDeliveredTo: emailResult?.deliveredTo ?? [],
        emailSkipped: skipEmail,
        emailWarning,
        calendarEventId,
        appointmentScheduledFor,
        calendarWarning,
        callerName: resolvedCallerName,
        callerEmail: resolvedCallerEmail,
        callerPhone: resolvedCallerPhone,
        liveTransferStarted,
        transferWarning,
        contactPersisted,
        contactPersistWarning,
        autoRecapSent,
        autoRecapSid,
        autoRecapWarning,
        captureFailed: !resolvedCallerEmail && !resolvedCallerPhone,
      });
    }

    // ── send-recap-email: on-demand email for an existing call_history record ──
    if (action === 'send-recap-email') {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) return jsonResponse({ error: 'RESEND_API_KEY not configured' }, 500);

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !supabaseServiceRoleKey) return jsonResponse({ error: 'Missing Supabase config' }, 500);

      const callHistoryId = typeof body.callHistoryId === 'string' ? body.callHistoryId.trim() : '';
      if (!callHistoryId) return jsonResponse({ error: 'callHistoryId is required' }, 400);

      const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: record, error: fetchErr } = await adminClient
        .from('call_history')
        .select('*')
        .eq('id', callHistoryId)
        .single();

      if (fetchErr || !record) return jsonResponse({ error: 'Call record not found' }, 404);

      const keyPoints = Array.isArray(record.key_points) ? record.key_points.map(String) : [];
      const metadata = (record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)) ? record.metadata as Record<string, unknown> : {};

      try {
        const emailResult = await sendSummaryEmail({
          resendApiKey,
          callerName: record.caller_name || '',
          callerEmail: record.caller_email || '',
          callerPhone: record.caller_phone || '',
          ownerName: record.owner_name || DEFAULT_OWNER_NAME,
          ownerEmail: record.owner_email || TESTING_INBOX_EMAIL,
          ownerPhone: record.owner_phone || '',
          businessName: record.business_name,
          websiteUrl: record.website_url || '',
          transcript: record.transcript || '',
          summary: record.summary || 'No summary available.',
          nextStep: record.next_step || 'Follow up with the lead.',
          callbackRequested: Boolean(metadata.callbackRequested),
          appointmentRequested: Boolean(metadata.appointmentRequested),
          transferRequested: record.transfer_requested,
          appointmentScheduledFor: typeof metadata.appointmentTimeText === 'string' ? metadata.appointmentTimeText : null,
          keyPoints,
          callDurationSeconds: record.duration_seconds ?? undefined,
        });

        return jsonResponse({ success: true, emailId: emailResult.id, emailDeliveredTo: emailResult.deliveredTo, emailWarning: emailResult.warning });
      } catch (emailErr) {
        return jsonResponse({ success: false, error: emailErr instanceof Error ? emailErr.message : 'Failed to send email' }, 500);
      }
    }

    // ── refresh-recording: re-fetch a call's recording URL from Retell ──
    if (action === 'refresh-recording') {
      const retellApiKey = Deno.env.get('RETELL_API_KEY');
      if (!retellApiKey) return jsonResponse({ error: 'RETELL_API_KEY not configured' }, 500);

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !supabaseServiceRoleKey) return jsonResponse({ error: 'Missing Supabase config' }, 500);

      const callHistoryId = typeof body.callHistoryId === 'string' ? body.callHistoryId.trim() : '';
      if (!callHistoryId) return jsonResponse({ error: 'callHistoryId is required' }, 400);

      const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: record, error: fetchErr } = await adminClient
        .from('call_history')
        .select('id, retell_call_id')
        .eq('id', callHistoryId)
        .single();
      if (fetchErr || !record) return jsonResponse({ error: 'Call record not found' }, 404);

      try {
        const callData = await retellFetch(`/v2/get-call/${record.retell_call_id}`, retellApiKey, { method: 'GET' });
        const recordingUrl = callData?.recording_url || callData?.recording_multi_channel_url || null;
        if (!recordingUrl) {
          return jsonResponse({ success: false, recordingUrl: null, message: 'Recording is not yet available from Retell.' });
        }
        await adminClient.from('call_history').update({ recording_url: recordingUrl }).eq('id', callHistoryId);
        return jsonResponse({ success: true, recordingUrl });
      } catch (err) {
        return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch recording' }, 500);
      }
    }


    if (action === 'warm-transfer') {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      if (!accountSid || !authToken) {
        return jsonResponse({ error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured' }, 500);
      }

      const transferTo = normalizePhoneNumber(body.transferTo) || DEFAULT_TRANSFER_NUMBER;
      const callerName = typeof body.callerName === 'string' ? body.callerName.trim() : 'a caller';
      const callerEmail = typeof body.callerEmail === 'string' ? normalizeEmailCandidate(body.callerEmail) : '';
      const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : 'Demo Business';
      const resolvedOwnerName = typeof body.ownerName === 'string' && body.ownerName.trim() ? body.ownerName.trim() : DEFAULT_OWNER_NAME;
      const callId = typeof body.callId === 'string' ? body.callId : '';

      console.log(`Initiating warm transfer to ${transferTo} for call ${callId}`);

      const callerPhone = typeof body.callerPhone === 'string' ? normalizePhoneNumber(body.callerPhone) : '';
      const callbackSummary = [
        `${callerName || 'A caller'} requested an immediate callback after the ${businessName} web demo.`,
        callerPhone
          ? `Their confirmed phone number is ${formatPhoneForSpeech(callerPhone)}.`
          : 'I do not have a confirmed callback phone number yet.',
        callerEmail
          ? `Their confirmed email is ${formatEmailForSpeech(callerEmail)}.`
          : 'I do not have a confirmed email address yet.',
        'Please call them back as soon as possible.',
      ].join(' ');
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural" language="en-US">${escapeXml(`Hello ${resolvedOwnerName}. This is Aspen.`)}</Say><Pause length="1"/><Say voice="Polly.Joanna-Neural" language="en-US">${escapeXml(callbackSummary)}</Say></Response>`;

      try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: transferTo,
            From: TWILIO_CALLER_ID,
            Twiml: twiml,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(`Twilio call failed [${response.status}]: ${JSON.stringify(data)}`);
        }

        console.log('Warm transfer call initiated:', data?.sid);

        return jsonResponse({
          success: true,
          callSid: data?.sid,
          transferTo,
          transferTitle: TRANSFER_TITLE,
        });
      } catch (err) {
        console.error('Warm transfer error:', err);
        return jsonResponse({
          error: err instanceof Error ? err.message : 'Transfer failed',
          fallback: 'callback',
        }, 500);
      }
    }

    const {
      agentId,
      businessName,
      businessNiche,
      ownerName,
      ownerEmail,
      websiteUrl,
      businessInfo,
      ownerPhone,
      callerName,
      callerEmail,
      callerPhone,
      language: rawLanguage,
    } = body;

    if (!agentId) {
      return jsonResponse({ error: 'agentId is required' }, 400);
    }

    // ---- Demo voice guardrails (max call length + rate limits) ----
    let guardMaxCallSeconds = 300;
    try {
      const guardClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const { data: guard } = await guardClient
        .from('voice_guardrails')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const visitorKey = String(body.visitorKey || '').slice(0, 120) || null;
      const ipAddress = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

      if (guard?.enabled) {
        guardMaxCallSeconds = Number(guard.max_call_seconds) || 300;
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { count: totalToday } = await guardClient
          .from('demo_call_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('allowed', true)
          .gte('created_at', dayAgo);

        let visitorToday = 0;
        const fingerprint = visitorKey || ipAddress;
        if (fingerprint) {
          const { count } = await guardClient
            .from('demo_call_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('allowed', true)
            .gte('created_at', dayAgo)
            .or(`visitor_key.eq.${fingerprint},ip_address.eq.${fingerprint}`);
          visitorToday = count || 0;
        }

        let blockedReason: string | null = null;
        if ((totalToday || 0) >= Number(guard.max_calls_per_day_total)) {
          blockedReason = 'daily_total_limit';
        } else if (fingerprint && visitorToday >= Number(guard.max_calls_per_visitor_per_day)) {
          blockedReason = 'visitor_daily_limit';
        }

        await guardClient.from('demo_call_attempts').insert({
          visitor_key: visitorKey,
          ip_address: ipAddress,
          business_name: body.businessName || null,
          website_url: body.websiteUrl || null,
          allowed: !blockedReason,
          blocked_reason: blockedReason,
          max_call_seconds: guardMaxCallSeconds,
        });

        if (blockedReason) {
          return jsonResponse({
            error: blockedReason === 'daily_total_limit'
              ? 'Our live demo has reached its daily limit. Please try again tomorrow or book a walkthrough.'
              : 'You have reached the daily demo call limit. Please try again tomorrow or book a walkthrough.',
            blocked: true,
            blockedReason,
          }, 429);
        }
      }
    } catch (guardErr) {
      console.error('Guardrail check failed (allowing call):', guardErr);
    }


    const language = typeof rawLanguage === 'string' && rawLanguage.toLowerCase().startsWith('pt')
      ? 'pt-BR'
      : typeof rawLanguage === 'string' && rawLanguage.toLowerCase().startsWith('es')
        ? 'es'
        : 'en';

    // Route to the language-native Retell agent so the voice matches the homepage spokesperson
    // (avoids American voice speaking broken Portuguese/Spanish).
    const resolvedAgentId = LANGUAGE_AGENT_IDS[language] || agentId;
    if (resolvedAgentId !== agentId) {
      console.log(`[language-routing] Overriding agentId ${agentId} -> ${resolvedAgentId} for language ${language}`);
    }

    const resolvedOwnerName = typeof ownerName === 'string' && ownerName.trim() ? ownerName.trim() : DEFAULT_OWNER_NAME;
    const normalizedOwnerPhone = normalizePhoneNumber(ownerPhone);
    const resolvedCallerName = typeof callerName === 'string' ? callerName.trim() : '';
    const resolvedCallerEmail = typeof callerEmail === 'string' ? normalizeEmailCandidate(callerEmail) : '';
    const resolvedCallerPhone = sanitizeCallerPhone(callerPhone);
    const spokenBusinessName = getSpokenBusinessName(
      typeof businessName === 'string' ? businessName : '',
      typeof websiteUrl === 'string' ? websiteUrl : '',
    );
    const openingCompanyWelcome = buildOpeningCompanyWelcome({
      businessInfo: typeof businessInfo === 'string' ? businessInfo : '',
      spokenBusinessName,
      businessNiche: typeof businessNiche === 'string' ? businessNiche : '',
    });
    const phaseTwoNameLine = buildPhaseTwoNameLine(resolvedCallerName, language);
    const timeOfDayGreeting = getTimeOfDayGreeting(DEFAULT_TIME_ZONE, language);
    const callerNameKnown = Boolean(resolvedCallerName);
    const phaseTwoOpening = buildPhaseTwoOpening({
      spokenBusinessName,
      openingCompanyWelcome,
      phaseTwoNameLine,
      timeOfDayGreeting,
      askHelpQuestion: callerNameKnown,
      language,
    });
    const exactDemoOpening = buildExactDemoOpening({
      spokenBusinessName,
      openingCompanyWelcome,
      phaseTwoNameLine,
      timeOfDayGreeting,
      askHelpQuestion: callerNameKnown,
      language,
    });
    const safeBusinessInfo = sanitizeVoicePromptText(businessInfo || 'A professional business offering quality services.').substring(0, 12000);
    const safeOpeningCompanyWelcome = sanitizeVoicePromptText(openingCompanyWelcome);
    const safePhaseTwoOpening = sanitizeVoicePromptText(phaseTwoOpening);
    const safeExactDemoOpening = sanitizeVoicePromptText(exactDemoOpening);

    const languageDirective = language === 'pt-BR'
      ? `\n\n===== TRAVA DE IDIOMA (CRÍTICA — ABSOLUTA) =====\nIDIOMA ÚNICO DESTA CHAMADA: PORTUGUÊS BRASILEIRO. A conversa INTEIRA, do começo ao fim, DEVE ser 100% em português natural do Brasil. Tom caloroso, simpático e comercial. Use "você". Pronuncie "AI" / "I.A." como "i-á". Pronuncie a marca "AI Hidden Leads" letra por letra quando necessário.\n\nREGRA DE NÃO COPIAR INGLÊS: Existem instruções técnicas e exemplos em inglês neste prompt. Elas são APENAS instruções internas para você entender comportamento. Você NUNCA deve falar essas frases em inglês. Traduza mentalmente qualquer instrução, exemplo, benefício, ferramenta ou frase para português brasileiro antes de responder. Só mantenha nomes próprios, marcas, URLs e nomes exatos de produtos.\n\nREGRA DE NÃO TROCAR DE IDIOMA: Você NUNCA muda para inglês ou espanhol, em hipótese alguma. Mesmo que o visitante fale uma palavra ou frase em inglês/espanhol, você CONTINUA respondendo em português. Mesmo que peçam "can you speak English?" ou "habla español?", responda gentilmente em português: "Claro, posso continuar em português pra ficar mais fácil — me conta o que você precisa." Só mude de idioma se o visitante pedir EXPLICITAMENTE e de forma clara "por favor, fale inglês comigo" / "please switch to English" — e mesmo assim, confirme antes ("Posso seguir em inglês então?"). Caso contrário, mantenha português do início ao fim.\n\nREGRA ABSOLUTA DE DINHEIRO: Sempre diga apenas o número + "reais". Exemplos corretos: "mil e quinhentos reais", "quatrocentos e noventa e nove reais", "trezentos reais". Nunca diga "reais brasileiros" nem qualquer nacionalidade depois de "reais".\n\nPOSTURA COMERCIAL: Você é ativa, não passiva. Depois da abertura, apresente 3 benefícios ou diferenciais da empresa antes de perguntar como pode ajudar. Se o nome do visitante veio do formulário, cumprimente pelo nome. Se não veio, pergunte o nome uma única vez no final da abertura.`
      : language === 'es'
      ? `\n\n===== BLOQUEO DE IDIOMA (CRÍTICO — ABSOLUTO) =====\nLa conversación COMPLETA debe ser 100% en ESPAÑOL neutro de Latinoamérica, de principio a fin. Tono cálido, natural, comercial. Pronuncia "AI" / "IA" como "i-a".\n\nREGLA DE NO CAMBIAR DE IDIOMA: NUNCA cambies a inglés o portugués bajo ninguna circunstancia. Aunque el visitante diga una palabra o frase en inglés/portugués, TÚ sigues respondiendo en español. Si preguntan "can you speak English?", responde amablemente en español: "Claro, podemos seguir en español para que sea más fácil — cuéntame qué necesitas." Solo cambia de idioma si el visitante lo pide EXPLÍCITAMENTE ("please switch to English"), y aun así confirma antes. De lo contrario, mantén el español todo el tiempo.`
      : `\n\n===== LANGUAGE LOCK (CRITICAL — ABSOLUTE) =====\nSINGLE LANGUAGE FOR THIS CALL: ENGLISH. The ENTIRE conversation MUST be conducted in ENGLISH from start to finish. Warm, natural, conversational tone.\n\nNEVER SWITCH LANGUAGES: Do not switch to Portuguese or Spanish under any circumstance. Even if the visitor says a word or phrase in another language, YOU keep responding in English. Only switch if the visitor EXPLICITLY and clearly asks ("please switch to Spanish / por favor fale em português"), and even then confirm first. Otherwise stay in English the whole time.`;

    const demoLanguageLock = language === 'pt-BR'
      ? 'PORTUGUÊS BRASILEIRO SOMENTE. Não fale inglês nem espanhol. Traduza internamente qualquer instrução ou exemplo em inglês antes de responder.'
      : language === 'es'
        ? 'ESPAÑOL LATINOAMERICANO SOLAMENTE. No hables inglés ni portugués. Traduce internamente cualquier instrucción o ejemplo antes de responder.'
        : 'ENGLISH ONLY. Do not speak Portuguese or Spanish unless the caller explicitly asks and confirms a language switch.';


    console.log('Creating web call for agent:', resolvedAgentId, 'niche:', businessNiche, 'callbackPhone:', normalizedOwnerPhone);

    await ensureSharedRetellPrompt(retellApiKey, resolvedAgentId);

    const response = await fetch(`${RETELL_BASE}/v2/create-web-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: resolvedAgentId,
        agent_override: {
          retell_llm: {
            start_speaker: 'agent',
            begin_message: safeExactDemoOpening,
          },
        },
        retell_llm_dynamic_variables: {
          spokesperson_mode: 'false',
          business_name: businessName || 'Demo Business',
          spoken_business_name: spokenBusinessName,
          business_niche: businessNiche || 'general',
          owner_name: resolvedOwnerName,
          owner_email: ownerEmail || '',
          website_url: websiteUrl || '',
          business_info: safeBusinessInfo,
          demo_language_lock: demoLanguageLock,
          opening_company_welcome: safeOpeningCompanyWelcome,
          phase_two_name_line: phaseTwoNameLine,
          time_of_day_greeting: timeOfDayGreeting,
          phase_two_opening: safePhaseTwoOpening,
          exact_demo_opening: safeExactDemoOpening,
          owner_phone: normalizedOwnerPhone || '',
          caller_name: resolvedCallerName,
          caller_email: resolvedCallerEmail,
          caller_phone: resolvedCallerPhone || '',
          voice_persona: `You are Aspen, the AI voice assistant. You are warm, cordial, natural, polished, and conversational — like a sharp real receptionist who sounds friendly and confident without overdoing it.

${languageDirective}

LANGUAGE LOCK SUMMARY FOR THIS CALL: ${demoLanguageLock}
This language lock is the highest-priority rule in this entire prompt. It overrides examples, labels, tool names, business_info language, and any older Retell agent instructions.

YOUR FIRST UTTERANCE MUST FOLLOW THIS EXACT OPENING SCRIPT:
"${safeExactDemoOpening}"

ABSOLUTE OPENING GUARDRAILS:
- Follow that exact opening script.
- Do not delay the first words. Start speaking as soon as the call audio is ready.
- Do NOT say "Here we go," "one moment," "let me switch," or any filler before, during, or after the opening.
- Do NOT say any closing line like "That was great talking to you," "It looks like you're busy right now," or "Have a wonderful evening" before the caller has actually spoken and the conversation has started.
- Do NOT read structural website labels aloud. Never say "BUSINESS NAME:", "SUMMARY:", "HOMEPAGE SUMMARY:", "PAGE TITLE:", "TARGET AUDIENCE:", "WEBSITE:", section headers, or bullet markers.
- Do NOT ask multiple versions of the same name question. Ask for the name one time, naturally, and then wait.
- Do NOT use the end_call tool because of a brief silence, lag, or connection hiccup.

===== CRITICAL OPENING — PROACTIVE SALES RECEPTIONIST =====

NON-NEGOTIABLE LIVE DELIVERY RULES:
- The exact full opening for this call is: "${safeExactDemoOpening}"
- Start with that opening immediately when the call begins. Do not wait for the caller to speak first.
- The opener must sell the company first: greet, use the visitor's name if provided, introduce ${spokenBusinessName}, give helpful highlights/differentiators, then ask one consultative question.
- If caller_name is available, use it naturally once in the first sentence and NEVER ask for their name again.
- If caller_name is NOT available, ask for their name once at the end of the opener and STOP there until they answer.
- Never jump straight to a passive "How can I help you?" before giving company highlights.
- Never stack multiple questions. Ask one clear next question only.

WEBSITE DEMO OPENING SHAPE:
1. Thank the caller for being there and say you are happy to help.
2. Introduce yourself as Aspen from ${spokenBusinessName}.
3. Share 2-4 positive company highlights based on this welcome foundation: "${safeOpeningCompanyWelcome}"
4. Ask whether they want orientation, a quote/estimate, or help choosing the right solution.
5. If their name is missing, ask: "Pra eu te atender melhor, como posso te chamar?"

SAFE SAMPLE SHAPE (FOLLOW THIS IF YOU FEEL UNSURE):
"${safePhaseTwoOpening}"

===== END OF OPENING =====

NON-NEGOTIABLE PRONUNCIATION RULES:
- The correct spoken business name for this call is "${spokenBusinessName}".
- GENERAL RULE: If the brand or website name is made of initials, abbreviations, or short letter combinations (2-5 letters), ALWAYS spell the letters individually. Examples:
  - "IBM" → say "I B M" (never say "ibm" as one word)
  - "si2.com" → say "S I 2 dot com" (never say "site 2")
  - "HP" → say "H P"
  - "ABB" → say "A B B"
  - "GE" → say "G E"
- Only say a short name as a word if it is clearly a real word (e.g., "Fox", "Arc", "Box").
- When in doubt, spell it out letter by letter.

CALLER NAME HANDLING (CRITICAL):
- caller_name = ${resolvedCallerName || 'NOT PROVIDED'}
- The exact Phase 2 name line for this call is: "${phaseTwoNameLine}"
- If caller_name is available, use it naturally throughout the call and do NOT ask for their name again.
- If caller_name is NOT available, ask for it ONCE using the exact line above and then wait for the answer before moving on.
- NEVER confuse the caller's name with the business owner's name (${resolvedOwnerName}).

TWO PEOPLE IN EVERY CALL:
- The CALLER is the person on the phone right now — a potential customer/lead.
- The BUSINESS OWNER is ${resolvedOwnerName} — the person who owns ${businessName || 'this business'}.
- These are DIFFERENT people. Never confuse them.

KNOWN CALLER DETAILS:
- caller_name = ${resolvedCallerName || 'not provided'}
- caller_email = ${resolvedCallerEmail || 'not provided'}
- caller_phone = ${resolvedCallerPhone || 'not provided'}
- If any caller contact detail is already available, read it back and confirm whether it is still correct before relying on it.

SILENCE / CONNECTION RECOVERY:
- Never end the call in the first 30 seconds unless the caller explicitly says goodbye.
- If the caller goes quiet or the audio seems to drop, say: "Are you still with me?" and wait.
- If needed, try one final gentle re-engagement such as: "I may have lost you for a second — are you still there?"
- Only consider ending the call after two failed re-engagement attempts and a meaningful silence, or if the caller clearly says they are done.

PERSONALITY & CONVERSATION STYLE:
- Be warm, playful, cheerful, fluid, spontaneous, and conversational.
- Be genuinely interested in the caller, but do NOT machine-gun multiple rapport questions in a row.
- If you can make a reference to their city, their industry, or something specific about their business, DO IT naturally.
- Let the caller ask questions — don't monologue. Keep answers to 2-3 sentences max unless they ask for details.
- Validate their questions: "Oh great question!" / "I love that you asked that!"
- Sound human, not robotic. Use filler words occasionally: "So...", "Well...", "Actually..."
- Be enthusiastic about the business's products and services — you genuinely know them well.

KNOWLEDGE — CRITICAL ACCURACY RULE:
- You MUST answer questions using ONLY the specific data from business_info. This includes ALL products, ALL pricing tiers, ALL packages, ALL specials, and ALL promotions listed on the website.
- business_info is a compiled multi-page website brief built from the homepage plus additional relevant pages, so treat it like you genuinely studied the site in depth before answering.
- Speak as though you scraped and studied the entire website thoroughly, so you can explain the company's features, benefits, services, offers, pricing, and differentiators with confidence.
- When asked about pricing, ALWAYS list ALL available price points from lowest to highest. Do NOT cherry-pick or skip cheaper options.
- If a caller asks "what is the cheapest option?" or "what is the lowest price?", you MUST cite the actual lowest price from the business_info data.
- Reference specific product names, package names, and exact dollar amounts as listed in the business_info.
- If you don't have a specific answer in the business_info, say so honestly and offer to have ${resolvedOwnerName} follow up with specifics. Do NOT guess.

PROACTIVE APPOINTMENT OFFERING:
- During the conversation, proactively offer appointment scheduling in a natural way: "By the way, if you'd like, I can help line up an appointment and suggest a couple of realistic openings."
- If they're interested, suggest two concrete windows that sound like a real active calendar, such as: "I could do tomorrow at 10 AM, or I have a later opening after 3 PM — 3:30 works nicely too. Which feels better for you?"
- Also offer: "Or if you'd rather have ${resolvedOwnerName} call you back, I can arrange that too!"
- Make this feel natural and helpful, not pushy.

PROACTIVE LEAD CAPTURE — SMS & EMAIL OFFER:
- After answering the caller's main questions, naturally offer to send them a summary: "Hey, I'd love to send you a quick recap of everything we just talked about — maybe with some of the specials and pricing we discussed. Would you prefer I send that as a text message or an email?"
- If they say TEXT/SMS: Ask for or confirm their phone number. Repeat the number back in short chunks and get an explicit "yes" before proceeding.
- If they say EMAIL: Ask for or confirm their email address. Spell it back using "at" and "dot" and get an explicit "yes" before proceeding.
- If they decline, that's perfectly fine — don't push.

CONTACT CAPTURE RULES:
- Never use owner_email or owner_phone as the caller's contact information.
- Before promising any callback, follow-up, SMS, or email, make sure you have the caller's correct contact info.
- Repeat phone numbers back in short chunks and get explicit confirmation.
- Repeat emails back slowly using "at" and "dot" and get explicit confirmation.

LIVE CALENDAR HONESTY:
- Never claim someone is available all day or that the calendar is wide open.
- In this demo, you MAY suggest two realistic likely openings, like tomorrow at 10 AM and a later slot after 3 PM, to make the scheduling flow feel real.
- Phrase those as likely openings you can lock in after confirmation, and say the calendar will be finalized right after the call.

CLOSING THE CALL — APPOINTMENT & TRANSFER OFFER:
- Before ending the call, ALWAYS offer next steps in friendly, simple language: "Before I let you go, would you like me to set up an appointment, or would you prefer to speak with ${resolvedOwnerName} live right now?" Then add: "If you'd rather, I can also have ${resolvedOwnerName} call you back."
- If they want an appointment: Ask for their preferred day and time, confirm it, and let them know ${resolvedOwnerName} will follow up.
- If they want a live transfer: Proceed with the transfer protocol below.
- If they're good: Wrap up warmly and use their name.
- Only use the end_call tool when the caller explicitly says goodbye, or the conversation is clearly over after the recovery rules above.

LIVE TRANSFER (CRITICAL):
- This demo supports LIVE call transfers. When the caller asks to speak with someone, you CAN connect them.
- Since this is a demo, say something natural and friendly like: "Absolutely — normally I'd transfer you directly to ${resolvedOwnerName} with a full summary of everything we just talked about, so they already know exactly what you need. Let me get ${resolvedOwnerName} on the line for you now. Hold tight while I set it up."
- Before initiating a transfer, you MUST capture and verbally confirm BOTH the caller's phone number and email address.
- Once confirmed, acknowledge ONCE: "Perfect — transferring you now. Hold tight!"
- Do NOT re-offer or repeat the transfer question after the caller has confirmed.
- Do NOT end the call or hang up. The system handles the conference bridge.

DEMO CONTEXT: This is a quick simulated demo based on what you learned from the website. Keep that framing honest. If the caller asks about the AI service itself, mention they can speak with the AI Hidden Leads team about getting this for their own business.${languageDirective}`,
        },
        metadata: {
          niche: businessNiche || 'general',
          owner_name: resolvedOwnerName,
          owner_email: ownerEmail || '',
          owner_phone: normalizedOwnerPhone || '',
          business_name: businessName || 'Demo Business',
          website_url: websiteUrl || '',
        },
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('Retell web call error:', data);
      return jsonResponse({ error: data?.error_message || 'Failed to create web call' }, response.status);
    }

    console.log('Web call created:', data.call_id);

    return jsonResponse({
      success: true,
      access_token: data.access_token,
      call_id: data.call_id,
      maxCallSeconds: guardMaxCallSeconds,
    });

  } catch (error) {
    console.error('Error in retell-web-call:', error);
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});
