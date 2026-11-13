// @vitest-environment node
// Manager-leg briefing in Aspen's own voice (Handoff improvement
// batch, 2026-11-12). Ron's live test: Twilio's built-in TTS read
// the press-1 briefing. The batch synthesizes the SAME briefing
// text with the Gemini TTS model in Aspen's prebuilt voice (Kore),
// stores the WAV at a deterministic path (no schema change — the
// owner action derives it from the handoff id), and <Play>s it
// inside the existing press-1 <Gather>. Every failure falls back
// to the previous Twilio <Say> briefing — pinned here.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HANDOFF_BRIEFING_BUCKET,
  HANDOFF_BRIEFING_TTS_MODEL,
  HANDOFF_BRIEFING_VOICE,
  handoffBriefingPath,
  managerBriefingText,
  synthesizeBriefingWav,
  ttsPcmFromResponse,
} from '../../supabase/functions/_shared/handoff-briefing-voice';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('managerBriefingText — the one briefing, shared by <Play> and <Say>', () => {
  it('matches the wording Twilio TTS spoke before this batch', () => {
    expect(managerBriefingText({ manager_name: 'Ron', summary: 'The visitor wants pricing.' }))
      .toBe('Hello Ron. A website visitor is waiting. This is an automated handoff. The visitor wants pricing. Press 1 to accept and connect. Press any other key to decline.');
  });

  it('falls back for a missing name and an empty summary', () => {
    expect(managerBriefingText({ manager_name: '', summary: '' }))
      .toBe('Hello the manager. A website visitor is waiting. This is an automated handoff. The visitor has requested to speak with your team. Press 1 to accept and connect. Press any other key to decline.');
    expect(managerBriefingText({}))
      .toContain('The visitor has requested to speak with your team.');
  });
});

describe('storage + voice constants', () => {
  it('the path is deterministic per handoff, in the private recordings bucket', () => {
    expect(HANDOFF_BRIEFING_BUCKET).toBe('conversation-recordings');
    expect(handoffBriefingPath('abc-123')).toBe('handoff-briefings/abc-123.wav');
  });

  it("the voice is Aspen's prebuilt voice and the model is the Gemini TTS model", () => {
    expect(HANDOFF_BRIEFING_VOICE).toBe('Kore');
    expect(HANDOFF_BRIEFING_TTS_MODEL).toBe('gemini-3.1-flash-tts-preview');
  });
});

describe('ttsPcmFromResponse — generateContent AUDIO payload parsing', () => {
  it('decodes the base64 PCM from the first inlineData part', () => {
    const pcm = ttsPcmFromResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAECAw==' } }] } }] });
    expect(pcm).not.toBeNull();
    expect(Array.from(pcm!)).toEqual([0, 1, 2, 3]);
  });

  it('returns null on any shape mismatch instead of throwing', () => {
    expect(ttsPcmFromResponse(null)).toBeNull();
    expect(ttsPcmFromResponse({})).toBeNull();
    expect(ttsPcmFromResponse({ candidates: [] })).toBeNull();
    expect(ttsPcmFromResponse({ candidates: [{ content: { parts: [{ text: 'no audio' }] } }] })).toBeNull();
  });
});

describe('synthesizeBriefingWav — synthesis with a stubbed fetch', () => {
  const okFetch = (async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAECAw==' } }] } }] }),
  })) as unknown as typeof fetch;

  it('returns a complete 24 kHz WAV around the PCM on success', async () => {
    const wav = await synthesizeBriefingWav('Hello Ron.', { apiKey: 'test-key', fetchImpl: okFetch });
    expect(wav).not.toBeNull();
    expect(String.fromCharCode(...wav!.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav!.slice(8, 12))).toBe('WAVE');
    const view = new DataView(wav!.buffer, wav!.byteOffset, wav!.byteLength);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(wav!.length).toBe(44 + 4);
  });

  it('sends the briefing text with the Aspen voice config to the TTS model', async () => {
    let seenUrl = ''; let seenBody = '';
    const spyFetch = (async (url: string, init: { body: string }) => {
      seenUrl = String(url); seenBody = init.body;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAECAw==' } }] } }] }) };
    }) as unknown as typeof fetch;
    await synthesizeBriefingWav('Hello Ron. Press 1.', { apiKey: 'test-key', fetchImpl: spyFetch });
    expect(seenUrl).toContain('gemini-3.1-flash-tts-preview:generateContent');
    const body = JSON.parse(seenBody) as { contents: { parts: { text: string }[] }[]; generationConfig: { responseModalities: string[]; speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } } };
    expect(body.contents[0].parts[0].text).toBe('Hello Ron. Press 1.');
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
  });

  it('returns null — never throws — on no key, HTTP failure, or a bad payload', async () => {
    expect(await synthesizeBriefingWav('Hello.', { apiKey: '', fetchImpl: okFetch })).toBeNull();
    const httpFail = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await synthesizeBriefingWav('Hello.', { apiKey: 'k', fetchImpl: httpFail })).toBeNull();
    const badPayload = (async () => ({ ok: true, json: async () => ({ candidates: [] }) })) as unknown as typeof fetch;
    expect(await synthesizeBriefingWav('Hello.', { apiKey: 'k', fetchImpl: badPayload })).toBeNull();
    const throwing = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect(await synthesizeBriefingWav('Hello.', { apiKey: 'k', fetchImpl: throwing })).toBeNull();
  });
});

describe('browser-voice-handoff wiring — generation, playback, fallback', () => {
  const src = read('supabase/functions/browser-voice-handoff/index.ts');

  it('generation fires at conference join (summary frozen, phone still ringing), fire-and-forget', () => {
    expect(src).toContain('EdgeRuntime.waitUntil((async()=>{');
    expect(src).toContain('synthesizeBriefingWav(managerBriefingText(handoff),{apiKey:Deno.env.get(\'GOOGLE_API_KEY\')||\'\'})');
    expect(src).toContain('db.storage.from(HANDOFF_BRIEFING_BUCKET).upload(handoffBriefingPath(handoff.id),wav,{contentType:\'audio/wav\',upsert:true})');
    expect(src.indexOf('synthesizeBriefingWav')).toBeLessThan(src.indexOf("if(action==='owner')"));
  });

  it('the owner leg plays the signed URL inside the same press-1 Gather when it exists', () => {
    expect(src).toContain('createSignedUrl(handoffBriefingPath(handoff.id),600)');
    expect(src).toContain('`<Play>${escapeXml(briefingAudio)}</Play>`');
    expect(src).toContain('input="dtmf" numDigits="1"');
    expect(src).toContain('${gatherInner}</Gather><Hangup/>');
  });

  it('the Twilio <Say> briefing remains the fallback, from the same shared text builder', () => {
    expect(src).toContain('const briefing=managerBriefingText(handoff);');
    expect(src).toContain('`<Say>${escapeXml(briefing)}</Say>`');
  });

  it('Fix 4 stays intact: Twilio callbacks still validate the request signature in-function', () => {
    expect(src).toContain('twilio.validateRequest(authToken,req.headers.get(\'x-twilio-signature\')||\'\',publicUrl,params)');
  });

  it('the visitor leg carries the stay-until-connected line', () => {
    expect(src).toContain("<Say>Please stay here — I'll stay on until you're connected with the manager, then I'll step away.</Say>");
    expect(src).not.toContain('Please stay here while I connect you with the manager.');
  });
});
