// Catalog selection (design 2026-11-18 §12.5, Phase 2.5): which
// avatars, voices and languages a RESELLER offers his clients.
//
// Stored per reseller org in voice_organizations.offered_catalog:
//   { avatars: string[] | null, voices: string[] | null,
//     languages: string[] }
// A null list means "everything in the shared library is offered"
// (the default — including faces/voices added later). An explicit
// list is the exact offered set. Languages default to all three the
// product speaks today; French arrives with the later language
// package and is deliberately NOT in the list yet.
//
// The shared library itself (names, images, voice styles) lives in
// the browser bundle (src/lib/avatarLibrary.ts, src/lib/voiceCatalog
// .ts); this module only validates and normalizes the SELECTION, so
// the edge function never needs the asset-heavy library.

/** Languages a tenant's assistants can speak today (mirrors
 *  AgentLanguage in src/lib/voiceCatalog.ts). */
export const CATALOG_LANGUAGES = ['en', 'es', 'pt-BR'] as const;
export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<CatalogLanguage, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
};

export interface CatalogSelection {
  /** Offered avatar library keys; null = the whole library. */
  avatars: string[] | null;
  /** Offered voice ids; null = the whole voice library. */
  voices: string[] | null;
  /** Offered languages; always an explicit list. */
  languages: CatalogLanguage[];
}

export const DEFAULT_CATALOG_SELECTION: CatalogSelection = {
  avatars: null,
  voices: null,
  languages: [...CATALOG_LANGUAGES],
};

const keyList = (v: unknown): string[] | null => {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 120))];
  return out.slice(0, 300);
};

/** Normalize a stored offered_catalog payload. Never throws; a bad
 *  list falls back to "everything offered" rather than to nothing —
 *  a reseller's clients must never lose their assistant's face/voice
 *  because a stored row went stale. */
export function normalizeCatalogSelection(raw: unknown): CatalogSelection {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CATALOG_SELECTION, languages: [...CATALOG_LANGUAGES] };
  const r = raw as Record<string, unknown>;
  const languages = Array.isArray(r.languages)
    ? CATALOG_LANGUAGES.filter((l) => (r.languages as unknown[]).includes(l))
    : [...CATALOG_LANGUAGES];
  return {
    avatars: keyList(r.avatars),
    voices: keyList(r.voices),
    languages: languages.length ? languages : [...CATALOG_LANGUAGES],
  };
}

/** Validate a reseller-submitted selection for writing. */
export function validateCatalogSelectionInput(
  raw: unknown,
): { value: CatalogSelection } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Catalog selection is required' };
  const r = raw as Record<string, unknown>;
  for (const field of ['avatars', 'voices'] as const) {
    const v = r[field];
    if (v !== undefined && v !== null) {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 120)) {
        return { error: `${field} must be a list of catalog keys or empty for "all"` };
      }
      if (v.length > 300) return { error: `${field} is too long` };
    }
  }
  if (r.languages !== undefined) {
    if (!Array.isArray(r.languages) || r.languages.some((l) => !(CATALOG_LANGUAGES as readonly unknown[]).includes(l))) {
      return { error: `languages must be chosen from: ${CATALOG_LANGUAGES.join(', ')}` };
    }
    if (!r.languages.length) return { error: 'At least one language must stay on' };
  }
  return { value: normalizeCatalogSelection(raw) };
}

/** Is a library key offered under this selection? */
export function isOffered(selection: string[] | null, key: string): boolean {
  return selection === null || selection.includes(key);
}
