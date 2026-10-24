// @vitest-environment node
import { expect, test } from 'vitest';
import { pcmSeconds, audioCost, validPricing, costPerCallMinute, typicalConversationCost } from '../../supabase/functions/_shared/voice-usage';
import { officialLivePricing } from '../../supabase/functions/_shared/live-models';
test('one second of 16kHz 16-bit microphone PCM is measured correctly', () => expect(pcmSeconds(Buffer.alloc(32000).toString('base64'),16000)).toBe(1));
test('one second of 24kHz response PCM is measured correctly', () => expect(pcmSeconds(Buffer.alloc(48000).toString('base64'),24000)).toBe(1));
test('unknown pricing never becomes zero cost', () => expect(audioCost(180,60,null)).toBeNull());
test('audio estimate prices input and output minutes separately', () => expect(audioCost(120,60,{model:'test',inputAudioPerMinute:0.02,outputAudioPerMinute:0.08,source:'https://example.com'})).toBeCloseTo(0.12));
test('pricing for a different model is not used', () => expect(validPricing({model:'other',inputAudioPerMinute:0.02,outputAudioPerMinute:0.08,source:'https://example.com'},'gemini-3.8-live')).toBeNull());
test('Google 3.8 Live published audio minute estimates are 0.005 input and 0.018 output', () => {
  const pricing = officialLivePricing('gemini-3.8-live');
  expect(pricing?.inputAudioPerMinute).toBe(0.005);
  expect(pricing?.outputAudioPerMinute).toBe(0.018);
  expect(audioCost(60,60,pricing)).toBeCloseTo(0.023);
});
test('five-minute call with half-time output estimates 0.070 USD and 0.014 USD per call minute', () => {
  const cost=audioCost(300,150,officialLivePricing('gemini-3.8-live'));
  expect(cost).toBeCloseTo(0.07);
  expect(costPerCallMinute(cost,300)).toBeCloseTo(0.014);
});
test('missing cost or duration never invents a per-minute price', () => {
  expect(costPerCallMinute(null,300)).toBeNull();
  expect(costPerCallMinute(0.07,null)).toBeNull();
  expect(costPerCallMinute(0.07,0)).toBeNull();
});
test('legacy 3.1 has the same published audio rates, unsupported 3.6 Live is not priced', () => {
  expect(officialLivePricing('gemini-3.1-flash-live-preview')?.inputAudioPerMinute).toBe(0.005);
  expect(officialLivePricing('gemini-3.1-flash-live-preview')?.outputAudioPerMinute).toBe(0.018);
  expect(officialLivePricing('gemini-3.6-live')).toBeNull();
});
test('conversation totals change when the selected model has different rates', () => {
  const pricing = { model: 'example', inputAudioPerMinute: 0.005, outputAudioPerMinute: 0.018, source: 'https://example.com' };
  expect(typicalConversationCost(1, pricing)).toBeCloseTo(0.014);
  expect(typicalConversationCost(5, pricing)).toBeCloseTo(0.070);
  expect(typicalConversationCost(5, { ...pricing, outputAudioPerMinute: 0.008 })).toBeCloseTo(0.045);
  expect(typicalConversationCost(5, null)).toBeNull();
});