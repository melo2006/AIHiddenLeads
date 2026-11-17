// @vitest-environment node
// ElevenLabs voice import + live mouth (2026-11-17).
//
// Ron's v2 order: import any voice from his ElevenLabs account library
// into an agent (same cloned_voice_id field the record-a-clone flow
// writes — no schema migration), and, behind a per-agent toggle that
// defaults to the Gemini voice, let ElevenLabs speak the live replies
// while Gemini stays the brain. These tests pin the pure halves:
// list shaping (labels → chips/filters), the TTS sentence chunker, the
// usage-ledger event, the toggle default, and the server wiring
// (source pins, matching the repo's barge-in-hardening style).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ELEVENLABS_FILTERS,
  elevenLabsCategoryLabel,
  elevenLabsFilterOptions,
  elevenLabsVoiceChips,
  filterElevenLabsVoices,
  shapeElevenLabsVoice,
  shapeElevenLabsVoiceList,
} from '../../supabase/functions/_shared/elevenlabs-voices';
import {
  bytesToBase64,
  cleanSpeechText,
  createSpeechChunker,
  elevenLabsMouthVoiceId,
  elevenLabsTtsCostUsd,
  mergePcmCarry,
} from '../../supabase/functions/_shared/elevenlabs-mouth';
import { elevenLabsTtsEventFromSession } from '../../supabase/functions/_shared/usage-ledger';
import { EMPTY } from '@/components/setup-wizard/wizardModel';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const RAW_CLONE = {
  voice_id: 'cloneVoiceId0001',
  name: "Ron's receptionist clone",
  category: 'cloned',
  labels: { age: 'middle_aged', gender: 'male', accent: 'american', descriptive: ['warm'], use_case: ['conversational'] },
  preview_url: 'https://cdn.example/clone.mp3',
};
const RAW_PREMADE = {
  voice_id: 'premadeVoiceId02',
  name: 'Aria',
  category: 'premade',
  labels: { age: 'young', gender: 'female', accent: 'american', descriptive: ['bright', 'confident'], use_case: ['narration'] },
  preview_url: 'https://cdn.example/aria.mp3',
};
const RAW_GENERATED = {
  voice_id: 'generatedVoice03',
  name: 'Zed Generated',
  category: 'generated',
  labels: {},
  preview_url: null,
};

describe('list shaping — labels, chips, order', () => {
  it('shapes one API voice with every label and its preview url', () => {
    const v = shapeElevenLabsVoice(RAW_CLONE);
    expect(v).not.toBeNull();
    expect(v!.id).toBe('cloneVoiceId0001');
    expect(v!.category).toBe('cloned');
    expect(v!.labels).toEqual({
      age: 'middle_aged', gender: 'male', accent: 'american',
      descriptive: ['warm'], useCase: ['conversational'],
    });
    expect(v!.previewUrl).toBe('https://cdn.example/clone.mp3');
  });

  it('drops entries with no usable id and tolerates a missing payload', () => {
    expect(shapeElevenLabsVoice({ name: 'No id here' })).toBeNull();
    expect(shapeElevenLabsVoice(null)).toBeNull();
    expect(shapeElevenLabsVoiceList(null)).toEqual([]);
    expect(shapeElevenLabsVoiceList({ voices: 'nope' })).toEqual([]);
  });

  it("orders the account owner's clones first, then generated, then premade — alphabetical inside a rank", () => {
    const list = shapeElevenLabsVoiceList({ voices: [RAW_PREMADE, RAW_GENERATED, RAW_CLONE] });
    expect(list.map((v) => v.id)).toEqual(['cloneVoiceId0001', 'generatedVoice03', 'premadeVoiceId02']);
  });

  it('chips render age, gender, accent, descriptive, use_case — in that order', () => {
    const v = shapeElevenLabsVoice(RAW_PREMADE)!;
    expect(elevenLabsVoiceChips(v)).toEqual(['young', 'female', 'american', 'bright', 'confident', 'narration']);
    expect(elevenLabsVoiceChips(shapeElevenLabsVoice(RAW_GENERATED)!)).toEqual([]);
  });

  it('category labels are human', () => {
    expect(elevenLabsCategoryLabel('cloned')).toBe('Cloned');
    expect(elevenLabsCategoryLabel('premade')).toBe('Premade');
    expect(elevenLabsCategoryLabel('generated')).toBe('Generated');
  });
});

describe('picker filters — search + attributes', () => {
  const list = shapeElevenLabsVoiceList({ voices: [RAW_CLONE, RAW_PREMADE, RAW_GENERATED] });

  it('text search matches name and labels', () => {
    expect(filterElevenLabsVoices(list, { ...EMPTY_ELEVENLABS_FILTERS, query: 'warm' }).map((v) => v.id))
      .toEqual(['cloneVoiceId0001']);
    expect(filterElevenLabsVoices(list, { ...EMPTY_ELEVENLABS_FILTERS, query: 'aria' }).map((v) => v.id))
      .toEqual(['premadeVoiceId02']);
    expect(filterElevenLabsVoices(list, { ...EMPTY_ELEVENLABS_FILTERS, query: 'zzz' })).toEqual([]);
  });

  it('attribute filters are exact matches; a voice missing the label never matches a specific value', () => {
    expect(filterElevenLabsVoices(list, { ...EMPTY_ELEVENLABS_FILTERS, gender: 'female' }).map((v) => v.id))
      .toEqual(['premadeVoiceId02']);
    expect(filterElevenLabsVoices(list, { ...EMPTY_ELEVENLABS_FILTERS, category: 'cloned' }).map((v) => v.id))
      .toEqual(['cloneVoiceId0001']);
    expect(filterElevenLabsVoices(list, { ...EMPTY_ELEVENLABS_FILTERS, age: 'young' }).map((v) => v.id))
      .toEqual(['premadeVoiceId02']);
  });

  it('filter options are derived from the list itself', () => {
    const opts = elevenLabsFilterOptions(list);
    expect(opts.categories).toEqual(['cloned', 'generated', 'premade']);
    expect(opts.genders).toEqual(['female', 'male']);
    expect(opts.ages).toEqual(['middle_aged', 'young']);
    expect(opts.accents).toEqual(['american']);
  });
});

describe('sentence chunker — TTS streaming', () => {
  it('emits complete sentences as they stream in', () => {
    const c = createSpeechChunker();
    expect(c.push('Hello there. ')).toEqual(['Hello there.']);
    expect(c.push('How can I help you today? ')).toEqual(['How can I help you today?']);
    expect(c.pending()).toBe('');
  });

  it('holds a partial sentence until it completes', () => {
    const c = createSpeechChunker();
    expect(c.push('Your appointment is on')).toEqual([]);
    expect(c.push(' Tuesday at three. ')).toEqual(['Your appointment is on Tuesday at three.']);
  });

  it('does not split on a decimal point', () => {
    const c = createSpeechChunker();
    const out = c.push('The price is 3.5 thousand dollars total for the plan. ');
    expect(out).toEqual(['The price is 3.5 thousand dollars total for the plan.']);
  });

  it('flushes the first chunk early at a clause break so the reply starts fast', () => {
    const c = createSpeechChunker();
    // No sentence end in the first 120 chars: once the buffer reaches
    // the first-chunk cap, it cuts at the last clause break in the
    // 40..120 window instead of waiting for a full sentence.
    const opener = 'Thanks so much for calling our office today, ';
    const filler = 'we really appreciate you stopping by and we are so glad that you found us here today my friend';
    expect((opener + filler).length).toBeGreaterThan(120);
    const out = c.push(opener + filler);
    expect(out).toEqual(['Thanks so much for calling our office today,']);
    expect(c.flush()).toBe(filler);
  });

  it('flush returns the remainder as one final chunk, then nothing', () => {
    const c = createSpeechChunker();
    c.push('One full sentence here. And a tail without end');
    expect(c.flush()).toBe('And a tail without end');
    expect(c.flush()).toBeNull();
  });

  it('strips markdown and drops punctuation-only text', () => {
    expect(cleanSpeechText('**Bold** and _calm_ #now')).toBe('Bold and calm now');
    const c = createSpeechChunker();
    c.push('... ');
    expect(c.flush()).toBeNull();
  });

  it('hard-cuts a run-on with no clause break at a word boundary', () => {
    const c = createSpeechChunker();
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const out = c.push(words);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].length).toBeLessThanOrEqual(120);
    // The cut lands on a word boundary: the chunk ends with a whole word.
    expect(out[0].split(' ').pop()).toMatch(/^word\d+$/);
  });
});

describe('mouth helpers — pcm alignment, base64, cost, gate', () => {
  it('carries an odd trailing byte into the next read', () => {
    const first = mergePcmCarry(new Uint8Array([]), new Uint8Array([1, 2, 3]));
    expect([...first.emit]).toEqual([1, 2]);
    expect([...first.rest]).toEqual([3]);
    const second = mergePcmCarry(first.rest, new Uint8Array([4, 5]));
    expect([...second.emit]).toEqual([3, 4]);
    expect([...second.rest]).toEqual([5]);
  });

  it('base64 round-trips', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('cost estimate is $0.30 per 1k characters, zero for nothing', () => {
    expect(elevenLabsTtsCostUsd(1000)).toBeCloseTo(0.3);
    expect(elevenLabsTtsCostUsd(0)).toBe(0);
    expect(elevenLabsTtsCostUsd(-5)).toBe(0);
  });

  it('the session-config gate reads only a non-empty stamped id', () => {
    expect(elevenLabsMouthVoiceId({ elevenLabsVoiceId: 'abc123' })).toBe('abc123');
    expect(elevenLabsMouthVoiceId({ elevenLabsVoiceId: '  ' })).toBeNull();
    expect(elevenLabsMouthVoiceId({})).toBeNull();
    expect(elevenLabsMouthVoiceId(null)).toBeNull();
  });
});

describe('usage ledger — ElevenLabs TTS event', () => {
  const session = { id: 'sess-1', organization_id: 'org-1', agent_id: 'agent-1', duration_seconds: 120, started_at: '2026-11-17T20:00:00Z' };

  it('is null when the mouth never spoke', () => {
    expect(elevenLabsTtsEventFromSession(session, { characters: 0, audioSeconds: 0 })).toBeNull();
    expect(elevenLabsTtsEventFromSession(session, null)).toBeNull();
    expect(elevenLabsTtsEventFromSession(session, undefined)).toBeNull();
  });

  it('rides the web_voice service with characters as the count and a suffixed source id', () => {
    const ev = elevenLabsTtsEventFromSession(session, { characters: 2000, audioSeconds: 90 })!;
    expect(ev).not.toBeNull();
    expect(ev.service).toBe('web_voice');
    // The 0020 CHECK constraint has no 'elevenlabs' provider value.
    expect(ev.provider).toBe('other');
    expect(ev.quantity_count).toBe(2000);
    expect(ev.quantity_minutes).toBe(1.5);
    expect(ev.est_cost_usd).toBeCloseTo(0.6);
    expect(ev.source_table).toBe('gemini_voice_sessions');
    expect(ev.source_id).toBe('sess-1:elevenlabs-tts');
  });
});

describe('toggle default — Gemini voice everywhere unless flipped', () => {
  it('the wizard draft starts with the live ElevenLabs voice OFF', () => {
    expect(EMPTY.elevenLabsLiveVoice).toBe(false);
  });

  it('gemini-session stamps the voice id only when attached, ready AND toggled on', () => {
    const src = read('supabase/functions/gemini-session/index.ts');
    expect(src).toContain("if(id && status==='ready' && target.elevenLabsLiveVoice===true) target.elevenLabsVoiceId=id;");
    expect(src).toContain('else delete target.elevenLabsVoiceId;');
    // Persona segments never inherit the mouth.
    expect(src).toContain('if (b.personaSegment) delete config.elevenLabsVoiceId;');
  });
});

describe('server wiring — import list + attach (source pins)', () => {
  it('voice-clone-create lists via GET /v1/voices and never ships the key to the client', () => {
    const src = read('supabase/functions/voice-clone-create/index.ts');
    expect(src).toContain("z.literal('listVoices')");
    expect(src).toContain("z.literal('importVoice')");
    expect(src).toContain("const ELEVENLABS = 'https://api.elevenlabs.io';");
    expect(src).toContain('${ELEVENLABS}/v1/voices');
    expect(src).toContain("'xi-api-key': apiKey");
    // The key is read server-side only.
    expect(src).toContain("Deno.env.get('ELEVENLABS_API_KEY')");
  });

  it('importVoice validates the voice against the account library, then writes through the same clone state writer', () => {
    const src = read('supabase/functions/voice-clone-create/index.ts');
    const importAt = src.indexOf("b.action === 'importVoice'");
    expect(importAt).toBeGreaterThan(-1);
    const tail = src.slice(importAt);
    expect(tail).toContain('${ELEVENLABS}/v1/voices/${encodeURIComponent(b.voiceId)}');
    expect(tail).toContain('writeState');
    expect(tail).toContain("status: 'ready'");
  });

  it('the proxy mouth is gated on the stamped id + server key, and interruption kills it before the stop signal', () => {
    const src = read('supabase/functions/gemini-live-proxy/index.ts');
    expect(src).toContain('elevenLabsMouthVoiceId(config)');
    expect(src).toContain("Deno.env.get('ELEVENLABS_API_KEY')");
    expect(src).toContain('const mouthActive = Boolean(mouthVoiceId && mouthApiKey)');
    // Interruption: the mouth is aborted/dropped BEFORE {type:'interrupted'}
    // reaches the client, so the locked playout contract is unchanged.
    const hookAt = src.indexOf('if (sc.interrupted)');
    const sendAt = src.indexOf("type: 'interrupted'", hookAt);
    expect(hookAt).toBeGreaterThan(-1);
    expect(src.slice(hookAt, sendAt)).toContain('mouthInterrupt()');
    // Turn end flushes the chunker.
    expect(src).toContain('if (mouthActive) mouthEndTurn()');
    // Cost lands in the session usage stamp and the ledger.
    expect(src).toContain('elevenlabs_tts');
    expect(src).toContain('elevenLabsTtsEventFromSession');
  });

  it('the VPS deploy closure carries the mouth module', () => {
    const src = read('voice-proxy-server/deploy.sh');
    expect(src).toContain('elevenlabs-mouth.ts');
  });
});
