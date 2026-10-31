import test from 'node:test';
import assert from 'node:assert/strict';
import { twilioToGemini, geminiToTwilio, audioEstimate, muToPcm, pcmToMu } from './codec.mjs';

test('20 ms of Twilio audio becomes 20 ms at 16 kHz', () => {
  assert.equal(Buffer.from(twilioToGemini(Buffer.alloc(160, 0xff).toString('base64')), 'base64').length, 640);
});
test('20 ms of Gemini 24 kHz audio becomes 160 Twilio bytes', () => {
  assert.equal(Buffer.from(geminiToTwilio(Buffer.alloc(960).toString('base64')), 'base64').length, 160);
});
test('mu-law round trip stays close', () => {
  for (const x of [-20000, -500, 0, 500, 20000]) assert.ok(Math.abs(muToPcm(pcmToMu(x)) - x) < Math.max(64, Math.abs(x) * 0.07));
});
test('one minute in and out at published rates', () => {
  assert.equal(audioEstimate(60, 60, { inputAudioPerMinute: 0.00576, outputAudioPerMinute: 0.018 }), 0.02376);
  assert.equal(audioEstimate(60, 60, null), null);
});
