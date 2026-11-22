// Voice-proxy resolver (Part 2 server move, 2026-11-11 — design:
// proxy-vps-move-design-2026-11-10.md §3.1). The socket host is chosen at
// each connect: per-device ?voiceProxy override (persisted to localStorage)
// > VITE_VOICE_PROXY_WS_URL build default > the VPS host (the default since
// the 2026-11-22 v3 flip; the Edge derivation is the ?voiceProxy=edge
// rollback). Covers the required behaviors plus the invalid-param guard.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  edgeVoiceProxyWsUrl, resolveVoiceProxyWsUrl, VOICE_PROXY_HOST_STORAGE_KEY,
  VOICE_PROXY_VPS_WS_URL,
} from '@/lib/voiceProxy';

const SUPABASE_URL = 'https://mrtvqttecdfgphgxeygj.supabase.co';
const EDGE_URL = 'wss://mrtvqttecdfgphgxeygj.supabase.co/functions/v1/gemini-live-proxy';
const ENV_URL = 'wss://build-default.example.com';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe('voice proxy resolver', () => {
  test('stored vps override beats the build env', () => {
    const url = resolveVoiceProxyWsUrl({
      supabaseUrl: SUPABASE_URL,
      envWsUrl: ENV_URL,
      search: '',
      storage: fakeStorage({ [VOICE_PROXY_HOST_STORAGE_KEY]: 'vps' }),
    });
    expect(url).toBe(VOICE_PROXY_VPS_WS_URL);
    expect(url).toBe('wss://voice-proxy.aihiddenleads.com');
  });

  test('stored edge override beats the build env (per-device rollback)', () => {
    const url = resolveVoiceProxyWsUrl({
      supabaseUrl: SUPABASE_URL,
      envWsUrl: ENV_URL,
      search: '',
      storage: fakeStorage({ [VOICE_PROXY_HOST_STORAGE_KEY]: 'edge' }),
    });
    expect(url).toBe(EDGE_URL);
  });

  test('build env beats the default when no override is stored', () => {
    const url = resolveVoiceProxyWsUrl({
      supabaseUrl: SUPABASE_URL,
      envWsUrl: ENV_URL,
      search: '',
      storage: fakeStorage(),
    });
    expect(url).toBe(ENV_URL);
  });

  test('edge derivation helper stays byte-identical to the historical inline derivation', () => {
    // The exact expression that used to live at GeminiConversation's module level.
    const historical = SUPABASE_URL.replace(/^https/, 'wss') + '/functions/v1/gemini-live-proxy';
    expect(edgeVoiceProxyWsUrl(SUPABASE_URL)).toBe(historical);
  });

  test('default (no override, no env) is the VPS host since the v3 flip', () => {
    expect(resolveVoiceProxyWsUrl({ supabaseUrl: SUPABASE_URL, search: '', storage: fakeStorage() })).toBe(VOICE_PROXY_VPS_WS_URL);
    expect(resolveVoiceProxyWsUrl({ supabaseUrl: SUPABASE_URL, search: '', storage: null })).toBe(VOICE_PROXY_VPS_WS_URL);
  });

  test('a value stored under the retired v2 key is ignored (device lands on the VPS default)', () => {
    const url = resolveVoiceProxyWsUrl({
      supabaseUrl: SUPABASE_URL,
      search: '',
      storage: fakeStorage({ 'voice-proxy-host-v2': 'edge' }),
    });
    expect(url).toBe(VOICE_PROXY_VPS_WS_URL);
  });

  test('?voiceProxy=vps persists to storage and resolves to the VPS host', () => {
    const storage = fakeStorage();
    const url = resolveVoiceProxyWsUrl({
      supabaseUrl: SUPABASE_URL,
      envWsUrl: ENV_URL,
      search: '?voiceProxy=vps',
      storage,
    });
    expect(url).toBe(VOICE_PROXY_VPS_WS_URL);
    expect(storage.map.get(VOICE_PROXY_HOST_STORAGE_KEY)).toBe('vps');
    // And it sticks for the next bare call (no param, env present).
    expect(resolveVoiceProxyWsUrl({ supabaseUrl: SUPABASE_URL, envWsUrl: ENV_URL, search: '', storage }))
      .toBe(VOICE_PROXY_VPS_WS_URL);
  });

  test('?voiceProxy=edge restores the Edge derivation and overwrites a stored vps', () => {
    const storage = fakeStorage({ [VOICE_PROXY_HOST_STORAGE_KEY]: 'vps' });
    const url = resolveVoiceProxyWsUrl({
      supabaseUrl: SUPABASE_URL,
      envWsUrl: ENV_URL,
      search: '?voiceProxy=edge',
      storage,
    });
    expect(url).toBe(EDGE_URL);
    expect(storage.map.get(VOICE_PROXY_HOST_STORAGE_KEY)).toBe('edge');
  });

  test('an unrecognized ?voiceProxy value is ignored and persists nothing', () => {
    const storage = fakeStorage();
    const url = resolveVoiceProxyWsUrl({
      supabaseUrl: SUPABASE_URL,
      search: '?voiceProxy=banana',
      storage,
    });
    expect(url).toBe(VOICE_PROXY_VPS_WS_URL);
    expect(storage.map.has(VOICE_PROXY_HOST_STORAGE_KEY)).toBe(false);
  });
});

describe('GeminiConversation wiring', () => {
  const convo = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'GeminiConversation.tsx'),
    'utf8',
  );

  test('both socket constructions resolve the URL at connect time', () => {
    const connects = convo.match(/new WebSocket\(`\$\{voiceProxyWsUrl\(\)\}/g) ?? [];
    expect(connects.length).toBe(2);
    expect(convo).not.toContain('const WS_URL');
    expect(convo).toContain("import { voiceProxyWsUrl } from '@/lib/voiceProxy';");
  });

  test('voicePreload still pings the Supabase functions URL (stays on Edge by design)', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'lib', 'voicePreload.ts'), 'utf8');
    expect(preload).not.toContain('voiceProxy');
  });
});
