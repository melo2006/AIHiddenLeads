export type VoiceIdleStage = 'waiting' | 'checkin' | 'goodbye';
export const HOMEPAGE_SILENCE_MS = 15_000;

// Called only when playback/model output is finished and no pause, handoff or confirmation is active.
export function voiceIdleAction(stage: VoiceIdleStage, quietSince: number, now: number) {
  if (now - quietSince < HOMEPAGE_SILENCE_MS) return null;
  return stage === 'waiting' ? 'checkin' : stage === 'checkin' ? 'goodbye' : 'close';
}