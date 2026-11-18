import { DEFAULT_VIDEO_AVATAR, type VideoAvatar } from "../../../supabase/functions/_shared/video-avatar";
import { EMPTY_SERVICE_AREA, type ServiceAreaState } from "../../../supabase/functions/_shared/service-area";
import { GEMINI_LIVE_VOICES, type AgentLanguage } from "@/lib/voiceCatalog";
export type Faq = { q: string; a: string };
export type Corner = "bottom-right" | "bottom-left";

export type WizardState = {
  websiteUrl: string;
  businessName: string;
  industry: string;
  customIndustry?: string;
  subNiche?: string;
  businessNotes?: string;
  knowledgeGuidance?: string;
  assistantRestrictions?: string;
  /** Structured service-area choices (mode, places/radius/ZIPs, out-of-area policy, travel fee). */
  serviceArea?: ServiceAreaState;
  /** Compiled coverage sentences — visible/editable text that lands in the knowledge under SERVICE_AREA_MARK. */
  serviceAreaText?: string;
  links: string[];
  files: string[];
  faqs: Faq[];
  name: string;
  greeting: string;
  voice: string;
  /** Agent default language; the picked Live voice speaks it (Live voices are language-agnostic). */
  defaultLanguage?: AgentLanguage;
  /** True when the picker choice is the client's own cloned voice (the Gemini `voice` stays as the live-session fallback). */
  clonedVoiceSelected?: boolean;
  /** Live-voice engine toggle (2026-11-17): true = live conversations speak with the attached ElevenLabs voice (Gemini still listens/thinks). Default false = Gemini voice. */
  elevenLabsLiveVoice?: boolean;
  color: string;
  label: string;
  corner: Corner;
  videoAvatar?: VideoAvatar;
  /** Where booking confirmations + new-booking alerts are emailed (Step 6). Defaults to the account email when blank. */
  notificationEmail?: string;
};

export const INDUSTRIES = [
  "Home services", "Roofing", "HVAC", "Plumbing", "Dental", "Medical clinic", "Legal", "Real estate",
  "Restaurant", "Salon & spa", "Auto services", "Insurance", "Financial services", "Commercial cleaning", "B2B / industrial", "Other",
];

/** All 30 Gemini Live voices (Google's fixed set), from the shared catalog. */
export const VOICES = GEMINI_LIVE_VOICES.map((v) => ({
  id: v.id,
  label: v.id,
  vibe: `${v.style} · ${v.gender}`,
  gender: v.gender,
}));

export const SPECIALTIES: Record<string, string[]> = {
  HVAC: ['Commercial refrigeration', 'Industrial ventilation', 'Heat pumps', 'Maintenance contracts'],
  'Commercial cleaning': ['Office cleaning', 'Medical facilities', 'Industrial facilities', 'Floor care'],
  'B2B / industrial': ['Contract machining', 'Industrial packaging', 'Small-batch manufacturing', 'Equipment maintenance'],
  Roofing: ['Commercial flat roofs', 'Roof repairs', 'Metal roofing'],
  Plumbing: ['Commercial plumbing', 'Drain services', 'New construction'],
};

export function industryName(s: Pick<WizardState, 'industry' | 'customIndustry'>) {
  return (s.industry === 'Other' ? s.customIndustry || '' : s.industry).trim();
}

export const LABELS = ["Ask Aspen", "Talk to us", "Chat or call", "Need help?"];

export const STEPS = [
  { id: "business", title: "Your business" },
  { id: "teach", title: "Teach your assistant" },
  { id: "greeting", title: "Greeting & voice" },
  { id: "face", title: "Face & avatar" },
  { id: "look", title: "Look on your site" },
  { id: "launch", title: "Test & go live" },
] as const;

export const SAMPLES: Record<string, WizardState> = {
  roofer: {
    websiteUrl: "https://www.apexcommercialroofing.com", businessName: "Apex Commercial Roofing", industry: "Roofing",
    links: ["https://www.apexcommercialroofing.com/services"], files: ["Warranty-guide.pdf"],
    faqs: [{ q: "Do you offer free inspections?", a: "Yes, for commercial roofs in our service area." }],
    name: "Aspen", greeting: "{timeGreeting}! I'm {agentName} with {businessName}. Are you calling about a repair, an inspection or a new roof?",
    voice: "Kore", color: "#10b981", label: "Ask Aspen", corner: "bottom-right",
  },
  dentist: {
    websiteUrl: "https://www.example-dental.com", businessName: "Bright Smile Dental", industry: "Dental",
    links: [], files: [], faqs: [{ q: "Do you take new patients?", a: "Yes, we welcome new patients." }],
    name: "Aspen", greeting: "{timeGreeting}! This is {agentName} at {businessName}. Would you like to book a visit or ask a question?",
    voice: "Aoede", color: "#0ea5e9", label: "Need help?", corner: "bottom-right",
  },
};

export const EMPTY: WizardState = {
  websiteUrl: "", businessName: "", industry: "", links: [], files: [], faqs: [], name: "Aspen",
  greeting: "{timeGreeting}! I'm {agentName} with {businessName}. How can I help you today?",
  voice: "Kore", defaultLanguage: "en", clonedVoiceSelected: false, elevenLabsLiveVoice: false, color: "#10b981", label: "Ask Aspen", corner: "bottom-right", videoAvatar: DEFAULT_VIDEO_AVATAR,
  serviceArea: EMPTY_SERVICE_AREA, serviceAreaText: "",
};

/**
 * Insert or remove one plain sentence in an owner-edited text block (the
 * wizard suggestion checklists). Sentences live on their own lines so an
 * untick removes exactly what a tick added; the owner can edit the text
 * freely afterwards — a sentence they rewrote simply no longer matches,
 * and unticking then leaves their version untouched.
 */
export function toggleSentence(text: string, sentence: string, on: boolean) {
  const s = sentence.trim();
  if (on) {
    if (sentenceAccepted(text, s)) return text;
    return text.trim() ? `${text.trimEnd()}\n${s}` : s;
  }
  if (!sentenceAccepted(text, s)) return text;
  return text.split("\n").filter((l) => l.trim() !== s).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when a suggestion sentence is currently in the owner's text. */
export const sentenceAccepted = (text: string, sentence: string) =>
  text.split("\n").map((l) => l.trim()).includes(sentence.trim());

/** Fill greeting placeholders for previews. */
export function renderGreeting(s: Pick<WizardState, "greeting" | "name" | "businessName">, hour = new Date().getHours()) {
  const time = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return s.greeting
    .split("{timeGreeting}").join(time)
    .split("{agentName}").join(s.name || "Aspen")
    .split("{businessName}").join(s.businessName || "our business")
    .replace(/\{[a-zA-Z]+\}/g, "")
    .trim();
}

/** Business name guess from a URL, e.g. https://www.apex-roofing.com -> "Apex Roofing". */
export function nameFromUrl(url: string) {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return host.split(".")[0].split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  } catch { return ""; }
}

/** Which steps are complete enough to move on. */
export function stepReady(step: number, s: WizardState) {
  if (step === 0) return Boolean(s.businessName.trim() || nameFromUrl(s.websiteUrl)) && (s.industry !== 'Other' || Boolean(s.customIndustry?.trim()));
  if (step === 2) return s.greeting.trim().length >= 5;
  return true;
}

export function faqKnowledge(faqs: Faq[]) {
  return faqs.filter((f) => f.q.trim() && f.a.trim()).map((f) => `Q: ${f.q.trim()}\nA: ${f.a.trim()}`).join("\n\n");
}

/** "Ask <name>" label for the current agent name. */
export const askLabel = (name: string) => `Ask ${(name || "Aspen").trim() || "Aspen"}`;
/** Button label choices, with the first one following the agent's name. */
export const labelOptions = (name: string) => [askLabel(name), ...LABELS.slice(1)];
/** True when a label is a name-based "Ask …" label that should follow renames. */
export const isAskLabel = (label: string) => /^Ask \S.{0,30}$/.test(label || "") && !LABELS.slice(1).includes(label);
