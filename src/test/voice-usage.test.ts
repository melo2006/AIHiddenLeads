// @vitest-environment node
import { expect, test } from 'vitest';
import { pcmSeconds, audioCost, validPricing } from '../../supabase/functions/_shared/voice-usage';
test('one second of 16kHz 16-bit microphone PCM is measured correctly', () => expect(pcmSeconds(Buffer.alloc(32000).toString('base64'),16000)).toBe(1));
test('one second of 24kHz response PCM is measured correctly', () => expect(pcmSeconds(Buffer.alloc(48000).toString('base64'),24000)).toBe(1));
test('unknown pricing never becomes zero cost', () => expect(audioCost(180,60,null)).toBeNull());
test('audio estimate prices input and output minutes separately', () => expect(audioCost(120,60,{model:'test',inputAudioPerMinute:0.02,outputAudioPerMinute:0.08,source:'https://example.com'})).toBeCloseTo(0.12));
test('pricing for a different model is not used', () => expect(validPricing({model:'other',inputAudioPerMinute:0.02,outputAudioPerMinute:0.08,source:'https://example.com'},'gemini-3.8-live')).toBeNull());