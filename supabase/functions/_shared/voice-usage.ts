export type VoicePricing = { model: string; inputAudioPerMinute: number; outputAudioPerMinute: number; source: string; verifiedAt?: string; basis?: string };
export function pcmSeconds(base64: string, sampleRate: number) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding) / (sampleRate * 2);
}
export function audioCost(inputSeconds: number, outputSeconds: number, pricing: VoicePricing | null) {
  if (!pricing) return null;
  return (inputSeconds * pricing.inputAudioPerMinute + outputSeconds * pricing.outputAudioPerMinute) / 60;
}
export function costPerCallMinute(cost: number | null | undefined, durationSeconds: number | null | undefined) {
  return cost == null || !durationSeconds || durationSeconds <= 0 ? null : cost * 60 / durationSeconds;
}
// Planning assumption: capture runs for the call and the agent speaks half the time.
export function typicalConversationCost(minutes: number, pricing: VoicePricing | null) {
  return audioCost(minutes * 60, minutes * 30, pricing);
}
export function validPricing(value: unknown, model: string): VoicePricing | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (p.model !== model || typeof p.inputAudioPerMinute !== 'number' || typeof p.outputAudioPerMinute !== 'number' || !Number.isFinite(p.inputAudioPerMinute) || !Number.isFinite(p.outputAudioPerMinute) || p.inputAudioPerMinute < 0 || p.outputAudioPerMinute < 0 || typeof p.source !== 'string' || !p.source.startsWith('https://')) return null;
  return p as VoicePricing;
}