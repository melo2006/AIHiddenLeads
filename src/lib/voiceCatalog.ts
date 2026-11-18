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
export type AgentLanguage = "en" | "es" | "pt-BR" | "fr-CA";

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
  { id: "fr-CA", label: "French (Canada)" },
];

/**
 * Age band — ONLY where Google's own style word implies one. "Youthful"
 * (Leda) reads Young and "Mature" (Gacrux) reads Mature; every other
 * style word says nothing about age, so those voices carry NO band
 * rather than a guessed one.
 */
export type VoiceAgeBand = "Young" | "Mature";

const AGE_BAND_BY_STYLE: Record<string, VoiceAgeBand> = {
  Youthful: "Young",
  Mature: "Mature",
};

export const voiceAgeBand = (v: LiveVoice): VoiceAgeBand | undefined =>
  AGE_BAND_BY_STYLE[v.style];

/**
 * Language fit — the locales this voice is a recommended pick for,
 * DERIVED from the data above, never hand-listed per voice: every Live
 * voice is an English-context voice (the picker offers the full catalog
 * for English), and a voice fits es / pt-BR exactly when it belongs to
 * that language's curated set (VOICE_LANGUAGE_SETS — the client mirror
 * of supabase/functions/_shared/locale-voices.ts). Live voices are
 * language-agnostic, so fit means "curated pick for", never "only
 * speaks" — a voice with no set membership still speaks the language.
 */
export const voiceLanguageFit = (v: LiveVoice): AgentLanguage[] => {
  const fit: AgentLanguage[] = ["en"];
  for (const set of VOICE_LANGUAGE_SETS) {
    if (set.female.includes(v.id) || set.male.includes(v.id)) fit.push(set.language);
  }
  return fit;
};

export interface VoiceMeta extends LiveVoice {
  ageBand?: VoiceAgeBand;
  languageFit: AgentLanguage[];
}

export const withVoiceMeta = (v: LiveVoice): VoiceMeta => ({
  ...v,
  ageBand: voiceAgeBand(v),
  languageFit: voiceLanguageFit(v),
});

/** The distinct style words — the picker's "mood" axis, in catalog order. */
export const VOICE_MOODS: string[] = [
  ...new Set(GEMINI_LIVE_VOICES.map((v) => v.style)),
];

export interface VoiceFilters {
  language: AgentLanguage | "all";
  gender: VoiceGender | "all";
  mood: string | "all";
}

export const EMPTY_VOICE_FILTERS: VoiceFilters = {
  language: "all",
  gender: "all",
  mood: "all",
};

/**
 * Picker filtering. Gender and mood are hard filters (they narrow the
 * list). Language is a FIT-FIRST sort, not a cut: Live voices are
 * language-agnostic, so hiding a voice for a language would claim it
 * can't speak it — instead the curated picks for the chosen language
 * come first and every other voice stays reachable below them.
 * Filters compose; EMPTY_VOICE_FILTERS returns the catalog untouched.
 */
export function filterVoices<T extends LiveVoice>(
  voices: readonly T[],
  filters: VoiceFilters,
): T[] {
  const narrowed = voices.filter(
    (v) =>
      (filters.gender === "all" || v.gender === filters.gender) &&
      (filters.mood === "all" || v.style === filters.mood),
  );
  if (filters.language === "all") return [...narrowed];
  const lang = filters.language;
  return [
    ...narrowed.filter((v) => voiceLanguageFit(v).includes(lang)),
    ...narrowed.filter((v) => !voiceLanguageFit(v).includes(lang)),
  ];
}
