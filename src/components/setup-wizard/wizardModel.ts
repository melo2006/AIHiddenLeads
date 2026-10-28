export type Faq = { q: string; a: string };
export type Corner = "bottom-right" | "bottom-left";

export type WizardState = {
  websiteUrl: string;
  businessName: string;
  industry: string;
  links: string[];
  files: string[];
  faqs: Faq[];
  name: string;
  greeting: string;
  voice: string;
  color: string;
  label: string;
  corner: Corner;
};

export const INDUSTRIES = [
  "Home services", "Roofing", "HVAC", "Plumbing", "Dental", "Medical clinic", "Legal", "Real estate",
  "Restaurant", "Salon & spa", "Auto services", "Insurance", "Financial services", "B2B / industrial", "Other",
];

export const VOICES = [
  { id: "Kore", label: "Kore", vibe: "Warm, confident" },
  { id: "Aoede", label: "Aoede", vibe: "Bright, friendly" },
  { id: "Leda", label: "Leda", vibe: "Calm, youthful" },
  { id: "Puck", label: "Puck", vibe: "Upbeat, male" },
  { id: "Charon", label: "Charon", vibe: "Deep, steady" },
  { id: "Zephyr", label: "Zephyr", vibe: "Light, clear" },
];

export const LABELS = ["Ask Aspen", "Talk to us", "Chat or call", "Need help?"];

export const STEPS = [
  { id: "business", title: "Your business" },
  { id: "teach", title: "Teach your assistant" },
  { id: "greeting", title: "Greeting & voice" },
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
  voice: "Kore", color: "#10b981", label: "Ask Aspen", corner: "bottom-right",
};

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
  if (step === 0) return Boolean(s.businessName.trim() || nameFromUrl(s.websiteUrl));
  if (step === 2) return s.greeting.trim().length >= 5;
  return true;
}

export function faqKnowledge(faqs: Faq[]) {
  return faqs.filter((f) => f.q.trim() && f.a.trim()).map((f) => `Q: ${f.q.trim()}\nA: ${f.a.trim()}`).join("\n\n");
}
