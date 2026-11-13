// voiceProxy.ts — which host serves the website voice socket (gemini-live-proxy).
//
// Part 2 of the connection fix (design: proxy-vps-move-design-2026-11-10.md §3.1):
// the proxy is moving from Supabase Edge (free-plan ~150 s worker lifetime —
// the proven drop engine) to our own always-on VPS at
// wss://voice-proxy.aihiddenleads.com. Session state lives in Postgres and
// tokens are host-agnostic single-use capabilities, so the host is purely a
// client-side choice made AT EACH CONNECT — GeminiConversation calls
// voiceProxyWsUrl() when it constructs every socket, never at module load,
// so an override change applies to the next reconnect without a page reload.
//
// Resolution order:
//   1. Per-device override — visiting any page with ?voiceProxy=vps stores
//      localStorage['voice-proxy-host']='vps'; ?voiceProxy=edge stores
//      'edge'. A stored 'vps' wins over everything (test stage); a stored
//      'edge' forces the Edge derivation even when the build default is the
//      VPS host (per-device rollback).
//   2. Build-time default — import.meta.env.VITE_VOICE_PROXY_WS_URL, when set
//      (the Stage-3 flip is adding that one line to .env + a publish).
//   3. Fallback — the historical Edge derivation, byte-identical to the
//      module-level WS_URL this replaces.
//
// voicePreload.ts deliberately does NOT use this resolver: its warm-up ping
// stays on the Supabase functions URL (it also warms gemini-session, which
// stays on Edge).

export const VOICE_PROXY_HOST_STORAGE_KEY = 'voice-proxy-host';
export const VOICE_PROXY_VPS_WS_URL = 'wss://voice-proxy.aihiddenleads.com';

/** The pre-Part-2 socket URL, exactly as GeminiConversation derived it inline. */
export function edgeVoiceProxyWsUrl(supabaseUrl: string): string {
  return supabaseUrl.replace(/^https/, 'wss') + '/functions/v1/gemini-live-proxy';
}

export interface VoiceProxyResolutionInputs {
  supabaseUrl: string;
  envWsUrl?: string;
  /** window.location.search of the current page (may be ''). */
  search?: string;
  /** localStorage, or null outside a browser. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/** Pure resolution (the exported voiceProxyWsUrl wires the browser inputs).
 *  Reading the ?voiceProxy= param also PERSISTS it to storage, per §3.1:
 *  one tap on a link with the param flips the device until flipped back. */
export function resolveVoiceProxyWsUrl(inputs: VoiceProxyResolutionInputs): string {
  const { supabaseUrl, envWsUrl, search, storage } = inputs;

  if (storage && search) {
    const param = new URLSearchParams(search).get('voiceProxy');
    if (param === 'vps' || param === 'edge') {
      try {
        storage.setItem(VOICE_PROXY_HOST_STORAGE_KEY, param);
      } catch {
        // Storage can refuse (private mode, quotas); the stored-override
        // simply won't persist — resolution below still honors it this call
        // via the fresh param.
      }
      return param === 'vps' ? VOICE_PROXY_VPS_WS_URL : edgeVoiceProxyWsUrl(supabaseUrl);
    }
  }

  let override: string | null = null;
  if (storage) {
    try {
      override = storage.getItem(VOICE_PROXY_HOST_STORAGE_KEY);
    } catch {
      override = null;
    }
  }
  if (override === 'vps') return VOICE_PROXY_VPS_WS_URL;
  if (override === 'edge') return edgeVoiceProxyWsUrl(supabaseUrl);

  if (envWsUrl) return envWsUrl;

  return edgeVoiceProxyWsUrl(supabaseUrl);
}

/** The resolver GeminiConversation calls at each socket connect. */
export function voiceProxyWsUrl(): string {
  let storage: Pick<Storage, 'getItem' | 'setItem'> | null = null;
  let search = '';
  try {
    storage = window.localStorage;
    search = window.location.search;
  } catch {
    // Non-browser context (SSR/tests without jsdom): fall through to env/default.
  }
  return resolveVoiceProxyWsUrl({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
    envWsUrl: import.meta.env.VITE_VOICE_PROXY_WS_URL as string | undefined,
    search,
    storage,
  });
}
