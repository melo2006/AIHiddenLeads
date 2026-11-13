/**
 * The full Gemini Live voice catalog — Google's fixed set of 30 prebuilt
 * voices. Live voices are language-agnostic: the SAME voice speaks whichever
 * language the session runs in, so there are no accent variants on the Live
 * path and none are claimed here. (Accented English — British, Indian —
 * exists only on the Chirp 3 HD phone/TTS path via locales like en-GB /
 * en-IN; that is a separate phone-side catalog, not this list.)
 *
 * `style` words are Google's own character labels for each voice. `gender`
 * follows the labels this repo already used (GeminiConversation) where they
 * exist, and the commonly published split for the rest.
 */
export type VoiceGender = "Female" | "Male";
export type AgentLanguage = "en" | "es" | "pt-BR";

export interface LiveVoice {
  id: string;
  style: string;
  gender: VoiceGender;
}

export const GEMINI_LIVE_VOICES: LiveVoice[] = [
  { id: "Zephyr", style: "Bright", gender: "Female" },
  { id: "Puck", style: "Upbeat", gender: "Male" },
  { id: "Charon", style: "Informative", gender: "Male" },
  { id: "Kore", style: "Firm", gender: "Female" },
  { id: "Fenrir", style: "Excitable", gender: "Male" },
  { id: "Leda", style: "Youthful", gender: "Female" },
  { id: "Orus", style: "Firm", gender: "Male" },
  { id: "Aoede", style: "Breezy", gender: "Female" },
  { id: "Callirrhoe", style: "Easy-going", gender: "Female" },
  { id: "Autonoe", style: "Bright", gender: "Female" },
  { id: "Enceladus", style: "Breathy", gender: "Male" },
  { id: "Iapetus", style: "Clear", gender: "Male" },
  { id: "Umbriel", style: "Easy-going", gender: "Male" },
  { id: "Algieba", style: "Smooth", gender: "Female" },
  { id: "Despina", style: "Smooth", gender: "Female" },
  { id: "Erinome", style: "Clear", gender: "Female" },
  { id: "Algenib", style: "Gravelly", gender: "Male" },
  { id: "Rasalgethi", style: "Informative", gender: "Male" },
  { id: "Laomedeia", style: "Upbeat", gender: "Female" },
  { id: "Achernar", style: "Soft", gender: "Male" },
  { id: "Alnilam", style: "Firm", gender: "Male" },
  { id: "Schedar", style: "Even", gender: "Male" },
  { id: "Gacrux", style: "Mature", gender: "Female" },
  { id: "Pulcherrima", style: "Forward", gender: "Female" },
  { id: "Achird", style: "Friendly", gender: "Male" },
  { id: "Zubenelgenubi", style: "Casual", gender: "Male" },
  { id: "Vindemiatrix", style: "Gentle", gender: "Female" },
  { id: "Sadachbia", style: "Lively", gender: "Female" },
  { id: "Sadaltager", style: "Knowledgeable", gender: "Male" },
  { id: "Sulafat", style: "Warm", gender: "Female" },
];

export const liveVoiceById = (id: string): LiveVoice | undefined =>
  GEMINI_LIVE_VOICES.find((v) => v.id === id);

/** "Kore — Firm · Female" */
export const liveVoiceLabel = (v: LiveVoice): string => `${v.id} — ${v.style} · ${v.gender}`;

/**
 * Curated language sets for the picker. Picking a voice from a set pairs it
 * with that language as the agent's default language — the voice itself is
 * the same Live voice; the set is a language choice, NOT an accent variant.
 */
export interface VoiceLanguageSet {
  language: Exclude<AgentLanguage, "en">;
  label: string;
  note: string;
  female: string[];
  male: string[];
}

export const VOICE_LANGUAGE_SETS: VoiceLanguageSet[] = [
  {
    language: "es",
    label: "Spanish",
    note: "Sets the assistant's default language to Spanish.",
    female: ["Kore", "Aoede", "Sulafat"],
    male: ["Puck", "Charon", "Orus"],
  },
  {
    language: "pt-BR",
    label: "Portuguese (Brazil)",
    note: "Sets the assistant's default language to Portuguese (Brazil).",
    female: ["Zephyr", "Despina", "Callirrhoe"],
    male: ["Fenrir", "Alnilam", "Iapetus"],
  },
];

export const AGENT_LANGUAGES: { id: AgentLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "pt-BR", label: "Portuguese (Brazil)" },
];
