// SERVICE AREA (2026-11-18, wizard suggestions + service area): the owner
// defines coverage ONE of three ways — a list of places, a radius from the
// business address, or a list of ZIP codes — plus an out-of-area policy and
// an optional owner-written travel-fee sentence. The structured state is
// persisted on the agent draft (config.serviceArea); the compiled plain
// sentences land in the knowledge text under SERVICE_AREA_MARK, visible in
// the wizard and editable there (the compiled text is kept on the draft as
// config.serviceAreaText and is what actually compiles on save).

export type ServiceAreaMode = 'places' | 'radius' | 'zips';
export type OutOfAreaPolicy = 'callback' | 'transfer' | 'decline';

export interface ServiceAreaState {
  mode: ServiceAreaMode;
  /** City / county names for mode 'places'. */
  places: string[];
  /** Miles for mode 'radius' (null = not set yet). */
  radiusMiles: number | null;
  /** Business address the radius is measured from. */
  baseAddress: string;
  /** 5-digit ZIP codes for mode 'zips'. */
  zips: string[];
  outOfAreaPolicy: OutOfAreaPolicy;
  travelFeeEnabled: boolean;
  /** Owner-written travel-fee sentence, used verbatim when enabled. */
  travelFeeText: string;
}

export const EMPTY_SERVICE_AREA: ServiceAreaState = {
  mode: 'places',
  places: [],
  radiusMiles: null,
  baseAddress: '',
  zips: [],
  // Ron's recommended default (2026-11-18): never a flat no.
  outOfAreaPolicy: 'callback',
  travelFeeEnabled: false,
  travelFeeText: '',
};

export const OUT_OF_AREA_POLICIES: { id: OutOfAreaPolicy; label: string; hint: string; sentence: string }[] = [
  {
    id: 'callback',
    label: 'Never a flat no — take details & a callback number',
    hint: 'Recommended. The assistant takes the job details and a callback number and says you will confirm coverage.',
    sentence: 'If a caller is outside our service area, never give a flat no. Take the job details and a callback number, and let them know we will check and confirm whether we can cover their area.',
  },
  {
    id: 'transfer',
    label: 'Offer a warm transfer to the office',
    hint: 'The assistant offers to connect the caller to the office so the team can help directly.',
    sentence: 'If a caller is outside our service area, offer to transfer them to the office so the team can help them directly.',
  },
  {
    id: 'decline',
    label: 'Politely decline & refer out',
    hint: 'The assistant explains you do not cover that area yet and suggests finding a closer provider.',
    sentence: 'If a caller is outside our service area, politely explain that we do not cover that area yet and suggest they look for a provider closer to them.',
  },
];

export function policySentence(policy: OutOfAreaPolicy): string {
  return (OUT_OF_AREA_POLICIES.find((p) => p.id === policy) || OUT_OF_AREA_POLICIES[0]).sentence;
}

const cleanList = (values: string[], max: number, maxLen: number) =>
  [...new Set(values.map((v) => v.trim().slice(0, maxLen)).filter(Boolean))].slice(0, max);

/** Validate/normalize structured state coming back from a saved draft. */
export function normalizeServiceArea(raw: unknown): ServiceAreaState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SERVICE_AREA };
  const r = raw as Partial<ServiceAreaState>;
  const radius = typeof r.radiusMiles === 'number' && Number.isFinite(r.radiusMiles) ? Math.min(500, Math.max(1, Math.round(r.radiusMiles))) : null;
  return {
    mode: r.mode === 'radius' || r.mode === 'zips' ? r.mode : 'places',
    places: Array.isArray(r.places) ? cleanList(r.places.map(String), 40, 60) : [],
    radiusMiles: radius,
    baseAddress: typeof r.baseAddress === 'string' ? r.baseAddress.slice(0, 200) : '',
    zips: Array.isArray(r.zips) ? cleanList(r.zips.map(String), 200, 5).filter((z) => /^\d{5}$/.test(z)) : [],
    outOfAreaPolicy: r.outOfAreaPolicy === 'transfer' || r.outOfAreaPolicy === 'decline' ? r.outOfAreaPolicy : 'callback',
    travelFeeEnabled: r.travelFeeEnabled === true,
    travelFeeText: typeof r.travelFeeText === 'string' ? r.travelFeeText.slice(0, 300) : '',
  };
}

/** True when the owner has defined any coverage at all. */
export function hasCoverage(state: ServiceAreaState): boolean {
  if (state.mode === 'places') return state.places.length > 0;
  if (state.mode === 'radius') return state.radiusMiles !== null;
  return state.zips.length > 0;
}

/**
 * Compile the structured state into the plain sentences that land in the
 * assistant's knowledge text. Empty coverage compiles to just the policy
 * sentence (the policy still guides out-of-area callers).
 */
export function compileServiceArea(state: ServiceAreaState): string {
  const parts: string[] = [];
  if (state.mode === 'places' && state.places.length) {
    parts.push(`We serve these areas: ${state.places.join(', ')}.`);
  } else if (state.mode === 'radius' && state.radiusMiles !== null) {
    parts.push(state.baseAddress.trim()
      ? `We serve customers within ${state.radiusMiles} miles of ${state.baseAddress.trim()}.`
      : `We serve customers within ${state.radiusMiles} miles of our business location.`);
  } else if (state.mode === 'zips' && state.zips.length) {
    parts.push(`We serve these ZIP codes: ${state.zips.join(', ')}.`);
  }
  parts.push(policySentence(state.outOfAreaPolicy));
  if (state.travelFeeEnabled && state.travelFeeText.trim()) parts.push(state.travelFeeText.trim());
  return parts.join(' ');
}

/** Default owner-editable travel-fee sentence for the chosen radius. */
export function travelFeeTemplate(radiusMiles: number | null): string {
  return `Jobs beyond ${radiusMiles ?? 25} miles carry a travel fee — ask the office for the amount before booking.`;
}
