// ElevenLabs voice library shaping (2026-11-17) — pure helpers shared by
// the voice-clone-create edge function (which fetches GET /v1/voices with
// the server-side ELEVENLABS_API_KEY and shapes the payload here) and the
// client import picker (which renders chips/filters from the same shape).
// No I/O, no keys: the API key never leaves the edge function, and the
// client only ever sees this shaped, preview-url-bearing list.

export interface ElevenLabsVoiceLabels {
  age?: string;
  gender?: string;
  accent?: string;
  descriptive: string[];
  useCase: string[];
}

export interface ElevenLabsVoice {
  id: string;
  name: string;
  /** ElevenLabs category: 'cloned' | 'premade' | 'generated' | 'professional' (raw value, lowercased). */
  category: string;
  labels: ElevenLabsVoiceLabels;
  previewUrl: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = cleanString(item);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Shape one raw ElevenLabs API voice ({ voice_id, name, category,
 * labels: { age, gender, accent, descriptive, use_case, ... },
 * preview_url }) into the picker shape. Returns null when the entry has
 * no usable id — a voice that cannot be attached must not render.
 */
export function shapeElevenLabsVoice(raw: unknown): ElevenLabsVoice | null {
  const v = asRecord(raw);
  const id = cleanString(v.voice_id) || cleanString(v.id);
  if (!id) return null;
  const labels = asRecord(v.labels);
  const shaped: ElevenLabsVoiceLabels = {
    descriptive: stringList(labels.descriptive),
    useCase: stringList(labels.use_case),
  };
  const age = cleanString(labels.age);
  const gender = cleanString(labels.gender);
  const accent = cleanString(labels.accent);
  if (age) shaped.age = age;
  if (gender) shaped.gender = gender;
  if (accent) shaped.accent = accent;
  return {
    id,
    name: cleanString(v.name) || 'Untitled voice',
    category: (cleanString(v.category) || 'premade').toLowerCase(),
    labels: shaped,
    previewUrl: cleanString(v.preview_url) || null,
  };
}

/** Shape the GET /v1/voices payload ({ voices: [...] }). Cloned voices
 *  first (they are the account owner's own recordings — Ron's 2–3 clones
 *  must be findable at the top), then alphabetical by name. */
export function shapeElevenLabsVoiceList(payload: unknown): ElevenLabsVoice[] {
  const list = asRecord(payload).voices;
  if (!Array.isArray(list)) return [];
  const shaped = list.map(shapeElevenLabsVoice).filter((v): v is ElevenLabsVoice => v !== null);
  const rank = (v: ElevenLabsVoice) => (v.category === 'cloned' ? 0 : v.category === 'generated' ? 1 : 2);
  return shaped.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export interface ElevenLabsVoiceFilters {
  query: string;
  category: string; // 'all' or a category value
  gender: string; // 'all' or a labels.gender value
  age: string; // 'all' or a labels.age value
  accent: string; // 'all' or a labels.accent value
}

export const EMPTY_ELEVENLABS_FILTERS: ElevenLabsVoiceFilters = {
  query: '',
  category: 'all',
  gender: 'all',
  age: 'all',
  accent: 'all',
};

/** Text search over name + every label; attribute filters are exact
 *  matches on the API-provided labels (a voice with no such label never
 *  matches a specific filter value). Mirrors the VoicePicker contract:
 *  filters narrow, they never hide on missing metadata unless asked. */
export function filterElevenLabsVoices(
  voices: ElevenLabsVoice[],
  filters: ElevenLabsVoiceFilters,
): ElevenLabsVoice[] {
  const q = filters.query.trim().toLowerCase();
  return voices.filter((v) => {
    if (filters.category !== 'all' && v.category !== filters.category) return false;
    if (filters.gender !== 'all' && v.labels.gender !== filters.gender) return false;
    if (filters.age !== 'all' && v.labels.age !== filters.age) return false;
    if (filters.accent !== 'all' && v.labels.accent !== filters.accent) return false;
    if (q) {
      const hay = [
        v.name, v.category, v.labels.age || '', v.labels.gender || '', v.labels.accent || '',
        ...v.labels.descriptive, ...v.labels.useCase,
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** The attribute chips a picker row shows, in display order: category is
 *  rendered separately as a badge, so chips are age, gender, accent,
 *  then descriptive tags, then use cases. */
export function elevenLabsVoiceChips(voice: ElevenLabsVoice): string[] {
  const chips: string[] = [];
  if (voice.labels.age) chips.push(voice.labels.age);
  if (voice.labels.gender) chips.push(voice.labels.gender);
  if (voice.labels.accent) chips.push(voice.labels.accent);
  chips.push(...voice.labels.descriptive, ...voice.labels.useCase);
  return chips;
}

/** Distinct filter options present in a list, for building the selects. */
export function elevenLabsFilterOptions(voices: ElevenLabsVoice[]): {
  categories: string[];
  genders: string[];
  ages: string[];
  accents: string[];
} {
  const collect = (pick: (v: ElevenLabsVoice) => string | undefined) => {
    const set = new Set<string>();
    for (const v of voices) { const s = pick(v); if (s) set.add(s); }
    return [...set].sort((a, b) => a.localeCompare(b));
  };
  return {
    categories: collect((v) => v.category),
    genders: collect((v) => v.labels.gender),
    ages: collect((v) => v.labels.age),
    accents: collect((v) => v.labels.accent),
  };
}

/** Human label for a category value. */
export function elevenLabsCategoryLabel(category: string): string {
  switch (category) {
    case 'cloned': return 'Cloned';
    case 'generated': return 'Generated';
    case 'professional': return 'Professional';
    case 'premade': return 'Premade';
    default: return category ? category[0].toUpperCase() + category.slice(1) : 'Voice';
  }
}
