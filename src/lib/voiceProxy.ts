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
//      localStorage['voice-proxy-host-v3']='vps'; ?voiceProxy=edge stores
//      'edge'. A stored 'vps' wins over everything (test stage); a stored
//      'edge' forces the Edge derivation even when the build default is the
//      VPS host (per-device rollback).
//   2. Build-time default — import.meta.env.VITE_VOICE_PROXY_WS_URL, when set.
//   3. Fallback — the VPS host (see the v3 note below). The Edge derivation
//      remains one ?voiceProxy=edge visit away as the rollback road.
//
// STORAGE KEY v3 (2026-11-22): the default flips BACK to the VPS proxy.
// The v2 key was introduced earlier the same day when the VPS proxy
// appeared to stall presenter-class sessions (realtor demos: socket
// opens, no ready, no audio) and Edge was made the default as a stopgap.
// Both halves of that trade turned out wrong for production:
//   - Edge hard-kills every conversation at the ~150 s worker lifetime
//     (297 sessions since Nov 19: max 146 s, zero clean >=8-min runs),
//     while the VPS proxy has no such ceiling (900 s sessions proven).
//   - The VPS "stall" was root-caused the same day: the Gemini Live
//     endpoint silently swallows a single WebSocket frame above
//     ~131–140 KB, and Deno's built-in WebSocket sends the whole setup
//     as one frame — presenter setups run ~145–160 KB, homepage ~112 KB.
//     The proxy now fragments the provider-leg setup into <=16 KiB
//     frames (FragmentingWsClient, VOICE_PROVIDER_WS=frag in the VPS
//     service env) and presenter sessions answer in ~1–3 s via the VPS.
// Values stored under the v1/v2 keys are never read again, so every
// device — including ones a ?voiceProxy=edge visit pinned to Edge under
// v2 — lands on the VPS default on its next visit. The override
// mechanism itself is unchanged: a fresh ?voiceProxy= visit persists
// under the v3 key and wins exactly as before.
//
// voicePreload.ts deliberately does NOT use this resolver: its warm-up ping
// stays on the Supabase functions URL (it also warms gemini-session, which
// stays on Edge).

export const VOICE_PROXY_HOST_STORAGE_KEY = 'voice-proxy-host-v3';
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

  // Default (2026-11-22, v3): the VPS proxy — no ~150 s Edge worker
  // ceiling, and the large-setup frame stall is fixed proxy-side.
  return VOICE_PROXY_VPS_WS_URL;
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
