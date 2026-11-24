// @vitest-environment node
// Manager-leg briefing in Aspen's own voice (Handoff improvement
// batch, 2026-11-12). Ron's live test: Twilio's built-in TTS read
// the press-1 briefing. The batch synthesizes the SAME briefing
// text with the Gemini TTS model in Aspen's prebuilt voice (Kore),
// stores the WAV at a deterministic path (no schema change — the
// owner action derives it from the handoff id), and <Play>s it
// inside the existing press-1 <Gather>. Every failure falls back
// to the previous Twilio <Say> briefing — pinned here.
//
// Item 11 fix (2026-11-21): Ron's Nov 21 test STILL heard the
// carrier voice — synthesis started only at visitor-join and the
// owner leg's single lookup lost the race, silently. Synthesis
// now ARMS at token issuance (all three spoken lines), the join
// pass is a logged backup, the owner leg polls ~4 s before
// falling back, and every failure is logged with its reason —
// all pinned below. (Three wiring pins from the 2026-11-12 batch
// were stale after the 2026-11-16 language batch rewrote the
// call shapes; they are rewritten here to the current shapes.)
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRIEFING_OWNER_POLL_BUDGET_MS,
  BRIEFING_OWNER_POLL_STEP_MS,
  HANDOFF_BRIEFING_BUCKET,
  HANDOFF_BRIEFING_TTS_MODEL,
  HANDOFF_BRIEFING_VOICE,
  handoffBriefingPath,
  handoffConnectingPath,
  handoffStayPath,
  managerBriefingText,
  pollForBriefingUrl,
  storeHandoffBriefing,
  synthesizeBriefingWav,
  synthesizeBriefingWavDetailed,
  ttsPcmFromResponse,
} from '../../supabase/functions/_shared/handoff-briefing-voice';
import { composeHandoffSummary } from '../../supabase/functions/_shared/handoff-summary';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('managerBriefingText — the one briefing, shared by <Play> and <Say>', () => {
  it('matches the wording Twilio TTS spoke before this batch', () => {
    // Since the 2026-11-24 fix batch the embedded summary must be a
    // COMPOSED summary (handoff-summary.ts) — free text is never
    // embedded (see handoff-summary.test.ts for the stitch pins).
    const summary = composeHandoffSummary({ topics: ['pricing'] })!;
    expect(managerBriefingText({ manager_name: 'Ron', summary }))
      .toBe(`Hello Ron. A website visitor is waiting. This is an automated handoff. ${summary} Press 1 to accept and connect. Press any other key to decline.`);
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

describe('fixed-line storage paths (Item 11)', () => {
  it('connecting and stay lines get their own deterministic paths beside the briefing', () => {
    expect(handoffConnectingPath('abc-123')).toBe('handoff-briefings/abc-123-connecting.wav');
    expect(handoffStayPath('abc-123')).toBe('handoff-briefings/abc-123-stay.wav');
  });
});

describe('synthesizeBriefingWavDetailed — every failure carries its reason', () => {
  const okFetch = (async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAECAw==' } }] } }] }),
  })) as unknown as typeof fetch;

  it('success: wav present, failure null', async () => {
    const out = await synthesizeBriefingWavDetailed('Hello Ron.', { apiKey: 'k', fetchImpl: okFetch });
    expect(out.wav).not.toBeNull();
    expect(out.failure).toBeNull();
  });

  it('no API key → no_api_key; blank text → empty_text', async () => {
    expect((await synthesizeBriefingWavDetailed('Hello.', { apiKey: '', fetchImpl: okFetch })).failure).toBe('no_api_key');
    expect((await synthesizeBriefingWavDetailed('   ', { apiKey: 'k', fetchImpl: okFetch })).failure).toBe('empty_text');
  });

  it('HTTP failure → http_error with the status and a detail snippet', async () => {
    const httpFail = (async () => ({ ok: false, status: 404, text: async () => 'model not found', json: async () => ({}) })) as unknown as typeof fetch;
    const out = await synthesizeBriefingWavDetailed('Hello.', { apiKey: 'k', fetchImpl: httpFail });
    expect(out.wav).toBeNull();
    expect(out.failure).toBe('http_error');
    expect(out.httpStatus).toBe(404);
    expect(out.detail).toContain('model not found');
  });

  it('OK response without audio → no_audio_in_payload; a throwing fetch → fetch_exception', async () => {
    const badPayload = (async () => ({ ok: true, json: async () => ({ candidates: [] }) })) as unknown as typeof fetch;
    expect((await synthesizeBriefingWavDetailed('Hello.', { apiKey: 'k', fetchImpl: badPayload })).failure).toBe('no_audio_in_payload');
    const throwing = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const out = await synthesizeBriefingWavDetailed('Hello.', { apiKey: 'k', fetchImpl: throwing });
    expect(out.failure).toBe('fetch_exception');
    expect(out.detail).toContain('network down');
  });
});

describe('storeHandoffBriefing — synthesize, store, and LOG every outcome', () => {
  const okFetch = (async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAECAw==' } }] } }] }),
  })) as unknown as typeof fetch;
  const capture = () => {
    const events: { event: string; fields: Record<string, unknown> }[] = [];
    return { events, log: (event: string, fields: Record<string, unknown>) => { events.push({ event, fields }); } };
  };

  it('stores the WAV and logs handoff_briefing_stored with the byte count', async () => {
    const { events, log } = capture();
    const uploads: { path: string; bytes: number }[] = [];
    const ok = await storeHandoffBriefing({
      handoffId: 'h-1', line: 'briefing', path: 'handoff-briefings/h-1.wav', text: 'Hello Ron.', apiKey: 'k',
      upload: async (path, wav) => { uploads.push({ path, bytes: wav.length }); return { error: null }; },
      log, fetchImpl: okFetch,
    });
    expect(ok).toBe(true);
    expect(uploads).toEqual([{ path: 'handoff-briefings/h-1.wav', bytes: 48 }]);
    expect(events).toEqual([{ event: 'handoff_briefing_stored', fields: { handoffId: 'h-1', line: 'briefing', bytes: 48 } }]);
  });

  it('a synthesis failure is logged WITH its reason and never reaches upload', async () => {
    const { events, log } = capture();
    let uploaded = false;
    const ok = await storeHandoffBriefing({
      handoffId: 'h-2', line: 'briefing', path: 'p.wav', text: 'Hello.', apiKey: '',
      upload: async () => { uploaded = true; return { error: null }; },
      log, fetchImpl: okFetch,
    });
    expect(ok).toBe(false);
    expect(uploaded).toBe(false);
    expect(events).toEqual([{ event: 'handoff_briefing_synthesis_failed', fields: { handoffId: 'h-2', line: 'briefing', reason: 'no_api_key' } }]);
  });

  it('an HTTP failure logs http_error with the status', async () => {
    const { events, log } = capture();
    const httpFail = (async () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) })) as unknown as typeof fetch;
    const ok = await storeHandoffBriefing({
      handoffId: 'h-3', line: 'connecting', path: 'p.wav', text: 'Connecting.', apiKey: 'k',
      upload: async () => ({ error: null }), log, fetchImpl: httpFail,
    });
    expect(ok).toBe(false);
    expect(events[0].event).toBe('handoff_briefing_synthesis_failed');
    expect(events[0].fields).toMatchObject({ reason: 'http_error', httpStatus: 500 });
  });

  it('an upload failure is logged as its own event', async () => {
    const { events, log } = capture();
    const ok = await storeHandoffBriefing({
      handoffId: 'h-4', line: 'stay', path: 'p.wav', text: 'Stay.', apiKey: 'k',
      upload: async () => ({ error: { message: 'bucket denied' } }),
      log, fetchImpl: okFetch,
    });
    expect(ok).toBe(false);
    expect(events).toEqual([{ event: 'handoff_briefing_upload_failed', fields: { handoffId: 'h-4', line: 'stay', detail: 'bucket denied' } }]);
  });
});

describe('pollForBriefingUrl — the owner leg waits, bounded', () => {
  const fakeClock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => { t += ms; } };
  };

  it('the defaults are the bounded ~4 s poll', () => {
    expect(BRIEFING_OWNER_POLL_BUDGET_MS).toBe(4000);
    expect(BRIEFING_OWNER_POLL_STEP_MS).toBe(650);
  });

  it('a first-lookup hit returns immediately, one attempt', async () => {
    const clock = fakeClock();
    const out = await pollForBriefingUrl({ lookup: async () => ({ url: 'https://x/y.wav', error: null }), ...clock });
    expect(out).toEqual({ url: 'https://x/y.wav', attempts: 1, waitedMs: 0, lastError: null });
  });

  it('a briefing that lands mid-poll still wins', async () => {
    const clock = fakeClock();
    let calls = 0;
    const out = await pollForBriefingUrl({
      lookup: async () => { calls++; return calls < 3 ? { url: null, error: 'not found' } : { url: 'https://x/y.wav', error: null }; },
      ...clock,
    });
    expect(out.url).toBe('https://x/y.wav');
    expect(out.attempts).toBe(3);
    expect(out.waitedMs).toBe(1300);
  });

  it('a genuine miss stops at the budget and surfaces the last error', async () => {
    const clock = fakeClock();
    const out = await pollForBriefingUrl({ lookup: async () => ({ url: null, error: 'Object not found' }), ...clock });
    expect(out.url).toBeNull();
    expect(out.attempts).toBe(8); // t = 0, 650, …, 3900, 4550 — first attempt past the 4000 budget returns
    expect(out.waitedMs).toBe(4550);
    expect(out.lastError).toBe('Object not found');
  });
});

describe('browser-voice-handoff wiring — arm-time synthesis, backup, poll, fallback', () => {
  const src = read('supabase/functions/browser-voice-handoff/index.ts');

  it('synthesis ARMS at token issuance, just before the JWT is returned — not at visitor-join', () => {
    expect(src).toContain("EdgeRuntime.waitUntil(armBriefingVoice(h,'token'));");
    // In the JSON token action: after the not_requested gate, before the JWT goes out.
    expect(src.indexOf("armBriefingVoice(h,'token')")).toBeGreaterThan(src.indexOf("if(h.status!=='not_requested')"));
    expect(src.indexOf("armBriefingVoice(h,'token')")).toBeLessThan(src.indexOf('return json({token:token.toJwt()})'));
  });

  it('the arm synthesizes all three spoken lines and stores them via the logging helper', () => {
    expect(src).toContain('storeHandoffBriefing({handoffId:handoff.id,line:l.line,path:l.path,text:l.text,apiKey,upload:briefingUpload})');
    expect(src).toContain('handoffBriefingPath(handoff.id)');
    expect(src).toContain('handoffConnectingPath(handoff.id)');
    expect(src).toContain('handoffStayPath(handoff.id)');
    expect(src).toContain("console.info('handoff_briefing_armed'");
    expect(src).toContain("db.storage.from(HANDOFF_BRIEFING_BUCKET).upload(path,wav,{contentType:'audio/wav',upsert:true})");
  });

  it('conference join is only a backup: it checks storage and re-arms solely on a miss, logged either way', () => {
    expect(src).toContain("console.info('handoff_briefing_join_check'");
    expect(src).toContain("if(!existing.url)await armBriefingVoice(handoff,'join');");
    expect(src).not.toContain('synthesizeBriefingWav(');
  });

  it('the owner leg POLLS for the briefing and logs the lookup outcome before any fallback', () => {
    expect(src).toContain('pollForBriefingUrl({lookup:()=>signedBriefingUrl(handoffBriefingPath(handoff.id))})');
    expect(src).toContain("console.info('handoff_briefing_owner_lookup'");
    expect(src).toContain("console.info('handoff_briefing_fallback_say'");
    expect(src).toContain("reason:'not_stored_after_poll'");
  });

  it('the owner leg plays the signed URL inside the same press-1 Gather when it exists', () => {
    expect(src).toContain('createSignedUrl(path,600)');
    expect(src).toContain('`<Play>${escapeXml(briefingAudio)}</Play>`');
    expect(src).toContain('input="dtmf" numDigits="1"');
    expect(src).toContain('${gatherInner}</Gather><Hangup/>');
  });

  it('the Twilio <Say> briefing remains the fallback, from the same shared text builder', () => {
    expect(src).toContain('const briefing=managerBriefingText(handoff,briefingLang);');
    expect(src).toContain('`<Say language="${briefingSayLanguage(briefingLang)}">${escapeXml(briefing)}</Say>`');
  });

  it("the connecting line plays Aspen's voice when stored, else the <Say> line", () => {
    expect(src).toContain('`<Play>${escapeXml(connectingLookup.url)}</Play>`');
    expect(src).toContain('handoffConnectingLine(acceptLang)');
    expect(src).toContain("line:'connecting'");
  });

  it("the visitor leg plays the stay line in Aspen's voice when stored, else the <Say> line", () => {
    expect(src).toContain('`<Play>${escapeXml(stayLookup.url)}</Play>`');
    expect(src).toContain('handoffStayLine(stayLang)');
    expect(src).toContain("line:'stay'");
    expect(src).not.toContain('Please stay here while I connect you with the manager.');
  });

  it('Fix 4 stays intact: Twilio callbacks still validate the request signature in-function', () => {
    expect(src).toContain('twilio.validateRequest(authToken,req.headers.get(\'x-twilio-signature\')||\'\',publicUrl,params)');
  });
});
