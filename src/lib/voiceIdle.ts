export type VoiceIdleStage = 'waiting' | 'checkin' | 'goodbye';
export const HOMEPAGE_SILENCE_MS = 15_000;

// One short next-service turn per silence stretch, never an endless sales monologue.
export function homepageWalkthroughDue(text: string, continued: boolean, quietSince: number, now: number) {
  return !continued && /(?:shall we|next advantage|next service|explore the other|hear (?:about|the) next)/i.test(text) && now - quietSince >= 6_000;
}

// Called only when playback/model output is finished and no pause, handoff or confirmation is active.
export function voiceIdleAction(stage: VoiceIdleStage, quietSince: number, now: number) {
  if (now - quietSince < HOMEPAGE_SILENCE_MS) return null;
  return stage === 'waiting' ? 'checkin' : stage === 'checkin' ? 'goodbye' : 'close';
}