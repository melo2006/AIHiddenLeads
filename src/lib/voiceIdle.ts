export type VoiceIdleStage = 'waiting' | 'checkin' | 'bridge' | 'goodbye';
export const HOMEPAGE_SILENCE_MS = 15_000;

// Sales silence ladder (owner-directed 2026-11-15): on a homepage
// SALES session, silence gets a shorter first check-in (~5s of room
// after her question, plus playback tail), then — instead of the
// goodbye — a BRIDGE stage (social-proof statistic + early price
// anchor + continue the pitch), and only a long quiet after the
// bridge earns the goodbye. Non-sales sessions keep the original
// 15s check-in → 15s goodbye ladder byte-for-byte.
export const SALES_CHECKIN_MS = 7_000;
export const SALES_BRIDGE_MS = 20_000;
export const SALES_GOODBYE_MS = 45_000;

// One short next-service turn per silence stretch, never an endless sales monologue.
export function homepageWalkthroughDue(text: string, continued: boolean, quietSince: number, now: number) {
  return !continued && /(?:shall we|next advantage|next service|explore the other|hear (?:about|the) next)/i.test(text) && now - quietSince >= 6_000;
}

// Called only when playback/model output is finished and no pause, handoff or confirmation is active.
export function voiceIdleAction(stage: VoiceIdleStage, quietSince: number, now: number, sales = false) {
  const quiet = now - quietSince;
  if (stage === 'waiting') {
    return quiet >= (sales ? SALES_CHECKIN_MS : HOMEPAGE_SILENCE_MS) ? 'checkin' : null;
  }
  if (stage === 'checkin') {
    if (sales) return quiet >= SALES_BRIDGE_MS ? 'bridge' : null;
    return quiet >= HOMEPAGE_SILENCE_MS ? 'goodbye' : null;
  }
  if (stage === 'bridge') {
    return quiet >= SALES_GOODBYE_MS ? 'goodbye' : null;
  }
  return 'close';
}
