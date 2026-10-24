import type { VoicePricing } from './voice-usage.ts';
export const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';
export const LIVE_MODELS = [
  { id: DEFAULT_LIVE_MODEL, label: 'Gemini 3.8 Live', status: 'Current default' },
  { id: 'gemini-3.8-live-extended-thinking', label: 'Gemini 3.8 Live Extended Thinking', status: 'Extra reasoning; latency may differ' },
  { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live Preview', status: 'Legacy preview; Google recommends 3.8' },
];
export function officialLivePricing(model: string): VoicePricing | null {
  if (!LIVE_MODELS.some(m => m.id === model)) return null;
  // Google advertises input at approximately $0.005/min; $3/M × 32 tokens/s
  // yields $0.00576/min. Output uses Google's published $0.018/min equivalent.
  return { model, inputAudioPerMinute: 0.00576, outputAudioPerMinute: 0.018, source: 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-live', verifiedAt: '2026-10-24', basis: 'input_token_derived_output_published_audio_estimate' };
}