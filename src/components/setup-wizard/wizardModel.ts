import { DEFAULT_VIDEO_AVATAR, type VideoAvatar } from "../../../supabase/functions/_shared/video-avatar";
import { EMPTY_SERVICE_AREA, type ServiceAreaState } from "../../../supabase/functions/_shared/service-area";
import { NICHE_MARK, NICHE_PLAYBOOK_MARK, replaceSection } from "../../../supabase/functions/_shared/wizard-knowledge";
import { questionnaireForIndustry, type NicheQuestionnaire } from "./nicheQuestionnaires";
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
  /** How deep the website scan reads: 1 = key pages, 2 = also the pages they link to. */
  crawlDepth?: 1 | 2;
  /** Owner-defined variables (Concept C): insertable into greeting/guidance text as {name}. */
  customVariables?: CustomVariable[];
  /** Spreadsheets marked as lookup tables (Concept C UI hooks; the keyed runtime lookup is a later phase). */
  lookupTables?: LookupTableConfig[];
  /** Niche questionnaire answers, keyed by question id (Phase 1: niche questionnaires + personas). */
  nicheAnswers?: Record<string, string>;
  /** The industry name the niche answers were collected under (the questionnaire may change if the industry does). */
  nicheIndustry?: string;
};

/** An owner-created variable: the owner names it, says where its value comes from, and gives an example for previews. */
export type CustomVariable = {
  id: string;
  /** Token name used in text, e.g. "ticketNumber" → inserted as {ticketNumber}. */
  name: string;
  /** Plain-words label shown in the catalog, e.g. "Ticket number". */
  label: string;
  /** Where the value comes from when a caller is talking to the assistant. */
  source: "call" | "caller-id" | "chat" | "lookup";
  /** Example value, used to render previews honestly instead of showing raw {tokens}. */
  example: string;
};

/** A spreadsheet the owner marked as a lookup table: one key column the caller can quote, plus the columns the assistant may say out loud. */
export type LookupTableConfig = {
  id: string;
  /** Source label (the uploaded file's name). */
  label: string;
  keyColumn: string;
  speakableColumns: string[];
};

export const INDUSTRIES = [
  "Home services", "Roofing", "HVAC", "Plumbing", "Dental", "Medical clinic", "Legal", "Real estate",
  "Restaurant", "Salon & spa", "Auto services", "Insurance", "Financial services", "Commercial cleaning", "B2B / industrial",
  "Mortgage & lending", "Fitness & gym", "Veterinary", "Property management", "Solar & EV installation",
  "Staffing & recruitment", "Travel & hospitality", "Physiotherapy & chiropractic", "E-commerce", "Education & coaching",
  "Logistics & delivery", "Franchise development", "Events & webinars", "Subscription & rental services", "Utilities & telecom",
  "Other",
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
  { id: "learn", title: "Learn" },
  { id: "face", title: "Face & voice" },
  { id: "review", title: "Review the draft" },
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
  serviceArea: EMPTY_SERVICE_AREA, serviceAreaText: "", crawlDepth: 1, customVariables: [], lookupTables: [],
  nicheAnswers: {}, nicheIndustry: "",
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
  return renderTemplate(s.greeting, s, hour);
}

/**
 * Render any owner text (greeting, template) the way a caller would hear
 * it: built-in variables filled with the business's real values (or an
 * honest sample for caller-specific ones), custom variables filled with
 * the owner's own example values. A preview NEVER shows a naked {token}.
 */
export function renderTemplate(text: string, s: Pick<WizardState, "name" | "businessName" | "customVariables">, hour = new Date().getHours()) {
  const time = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  let out = text
    .split("{timeGreeting}").join(time)
    .split("{agentName}").join(s.name || "Aspen")
    .split("{businessName}").join(s.businessName || "our business")
    .split("{callerName}").join("Jordan")
    .split("{callerNumber}").join("+1 (555) 010-2030")
    .split("{todayDate}").join(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
  for (const v of s.customVariables || []) out = out.split(`{${v.name}}`).join(v.example || v.label);
  return out.replace(/\{[a-zA-Z0-9_]+\}/g, "").replace(/\s{2,}/g, " ").trim();
}

/** The built-in variable catalog (Concept C §5). `token` is what lands in the owner's text. */
export const BUILT_IN_VARIABLES: { token: string; label: string; hint: string }[] = [
  { token: "timeGreeting", label: "Time of day", hint: "Good morning / afternoon / evening, from the caller's clock" },
  { token: "agentName", label: "Assistant name", hint: "Your assistant's name" },
  { token: "businessName", label: "Business name", hint: "Your business's name" },
  { token: "callerName", label: "Caller's name", hint: "The caller's name, when we know it" },
  { token: "callerNumber", label: "Caller's number", hint: "The number the caller is calling from" },
  { token: "todayDate", label: "Today's date", hint: "Today's full date" },
];

/** A custom-variable name must be a clean token and must not shadow a built-in. */
export function customVariableNameValid(name: string) {
  return /^[a-z][a-zA-Z0-9_]{1,39}$/.test(name) && !BUILT_IN_VARIABLES.some((v) => v.token === name);
}

/** Greeting template library (Concept C §5): tap one to use it; variables stay visible as tokens in the text and render live in the preview. */
export const GREETING_TEMPLATES: { id: string; label: string; text: string }[] = [
  { id: "thanks-for-calling", label: "Thanks for calling", text: "{timeGreeting}, and thanks for calling {businessName}! I'm {agentName}. How can I help you today?" },
  { id: "busy", label: "Busy right now", text: "{timeGreeting}! You've reached {businessName}. Our team is with other customers right now, but I'm {agentName} and I can help you, take a message, or book a time that suits you." },
  { id: "after-hours", label: "After hours", text: "{timeGreeting}! {businessName} is closed right now, but I'm {agentName} — I can answer questions, take a message, or book you in for when we reopen." },
  { id: "warm-welcome", label: "Warm welcome", text: "{timeGreeting}! Great to hear from you — I'm {agentName} with {businessName}. What can I do for you today?" },
  { id: "formal", label: "Formal", text: "{timeGreeting}. {businessName}, {agentName} speaking. How may I assist you?" },
];

/** The three greeting style cards drafted for the Review step (Concept C §5). */
export function greetingStyles(): { id: string; label: string; text: string }[] {
  return [
    { id: "warm", label: "Warm", text: "{timeGreeting}! I'm {agentName} with {businessName}. Lovely to hear from you — are you calling about a new enquiry, an existing job, or something else?" },
    { id: "professional", label: "Professional", text: "{timeGreeting}. Thank you for calling {businessName}. This is {agentName}. How may I help you today?" },
    { id: "short", label: "Short & sweet", text: "{timeGreeting}! {businessName}, {agentName} here. How can I help?" },
  ];
}

/**
 * A short spoken summary of a long owner text for the field toolbar's
 * Listen button: the read-aloud endpoint caps at 800 characters and the
 * owner should hear the gist (opening lines + topic headers), never a
 * robotic read of the whole knowledge base.
 */
export function summarizeForSpeech(text: string, maxChars = 700) {
  const clean = text.replace(/^-{3}.*-{3}$/gm, "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).length > maxChars) break;
    out += sentence;
  }
  return (out || clean.slice(0, maxChars)).trim();
}

/** Splice an insertion into a text field's value at the caret (the variable-chip insert). */
export function spliceText(value: string, start: number, end: number, insert: string) {
  return value.slice(0, start) + insert + value.slice(end);
}

/** Column names from a CSV's header row (quotes respected), for the lookup-table key/speakable pickers. */
export function parseCsvColumns(text: string): string[] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim());
  if (!firstLine) return [];
  const cols: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (quoted) {
      if (ch === '"') { if (firstLine[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cols.push(cur); cur = ""; }
    else cur += ch;
  }
  cols.push(cur);
  return [...new Set(cols.map((c) => c.trim()).filter(Boolean))].slice(0, 30);
}

/** The compiled-knowledge ceiling the capacity meter reads against (matches the server's knowledge cap). */
export const KNOWLEDGE_CAP_CHARS = 60000;

/** Characters the assistant's compiled knowledge currently holds: accepted guidance + coverage text + FAQs + learned source content. */
export function compiledKnowledgeChars(parts: { guidance?: string; serviceAreaText?: string; faqs?: Faq[]; sourcesChars?: number }) {
  return (parts.guidance || "").length + (parts.serviceAreaText || "").length + faqKnowledge(parts.faqs || []).length + (parts.sourcesChars || 0);
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
  if (step === 3) return s.greeting.trim().length >= 5;
  return true;
}

export function faqKnowledge(faqs: Faq[]) {
  return faqs.filter((f) => f.q.trim() && f.a.trim()).map((f) => `Q: ${f.q.trim()}\nA: ${f.a.trim()}`).join("\n\n");
}

export { NICHE_MARK, NICHE_PLAYBOOK_MARK };

/**
 * The factual niche answers, grouped under their section titles, for the
 * knowledge block (NICHE_MARK). Behavior answers are NOT facts — they go to
 * the playbook instead. Empty when nothing factual was answered.
 */
export function nicheKnowledge(answers: Record<string, string> | undefined, industry: string) {
  const q = questionnaireForIndustry(industry);
  const blocks: string[] = [];
  for (const section of q.sections) {
    const lines = section.questions
      .filter((question) => question.kind !== "behavior" && (answers?.[question.id] || "").trim())
      .map((question) => `${question.label}: ${answers![question.id].trim()}`);
    if (lines.length) blocks.push(`${section.title}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

/**
 * The niche playbook for the system prompt (NICHE_PLAYBOOK_MARK): the
 * persona's feel, what it handles, the order it asks booking questions in,
 * its hard rules and escalation paths, its after-call habits — plus the
 * owner's own behavior answers, which always win over the persona defaults.
 */
export function nichePlaybook(answers: Record<string, string> | undefined, industry: string) {
  const q = questionnaireForIndustry(industry);
  const p = q.persona;
  const lines: string[] = [
    `How you should sound: ${p.agentFeel}`,
    `You mainly handle: ${p.handles.join("; ")}.`,
    `When booking or taking an enquiry, ask in this order: ${p.bookingQuestions.map((b, i) => `${i + 1}. ${b}`).join(" ")}`,
  ];
  if (p.hardRules.length) lines.push(`Hard rules: ${p.hardRules.join(" ")}`);
  if (p.escalate.length) lines.push(`Hand over to a human when: ${p.escalate.join("; ")}.`);
  if (p.postCall.length) lines.push(`After the call: ${p.postCall.join(" ")}`);
  for (const section of q.sections) {
    for (const question of section.questions) {
      const answer = (answers?.[question.id] || "").trim();
      if (question.kind === "behavior" && answer) lines.push(`${question.label} Owner's answer: ${answer}`);
    }
  }
  return lines.join("\n");
}

/** Splice the niche knowledge into a knowledge block (replace, never duplicate). */
export function withNicheKnowledge(knowledge: string, answers: Record<string, string> | undefined, industry: string) {
  return replaceSection(knowledge, NICHE_MARK, nicheKnowledge(answers, industry));
}

/** Splice the niche playbook into a system prompt (replace, never duplicate). */
export function withNichePlaybook(systemPrompt: string, answers: Record<string, string> | undefined, industry: string) {
  return replaceSection(systemPrompt, NICHE_PLAYBOOK_MARK, nichePlaybook(answers, industry));
}

/**
 * Answers the wizard already knows, keyed by the shared question ids the
 * questionnaires use for business basics (businessName / website / phone /
 * address / hours). Only fields actually present in state are returned.
 */
export function prefillNicheAnswers(s: Pick<WizardState, "businessName" | "websiteUrl" | "serviceArea">): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.businessName?.trim()) out.businessName = s.businessName.trim();
  if (s.websiteUrl?.trim()) out.website = s.websiteUrl.trim();
  const address = s.serviceArea?.baseAddress?.trim();
  if (address) out.address = address;
  return out;
}

/** Answered/total counts for the questionnaire progress line. */
export function nicheProgress(q: NicheQuestionnaire, answers: Record<string, string> | undefined) {
  const all = q.sections.flatMap((s) => s.questions);
  const answered = all.filter((question) => (answers?.[question.id] || "").trim()).length;
  return { answered, total: all.length };
}

/** "Ask <name>" label for the current agent name. */
export const askLabel = (name: string) => `Ask ${(name || "Aspen").trim() || "Aspen"}`;
/** Button label choices, with the first one following the agent's name. */
export const labelOptions = (name: string) => [askLabel(name), ...LABELS.slice(1)];
/** True when a label is a name-based "Ask …" label that should follow renames. */
export const isAskLabel = (label: string) => /^Ask \S.{0,30}$/.test(label || "") && !LABELS.slice(1).includes(label);
