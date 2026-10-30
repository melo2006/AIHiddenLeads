import { supabase } from "@/integrations/supabase/client";

import type { WidgetTheme } from '../../supabase/functions/_shared/widget-theme';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';
import portrait from '@/assets/aspen-video-frame-final.webp.asset.json';

type Identity = { id: string; name: string; businessName: string; avatarUrl: string; theme?: WidgetTheme; videoAvatar?: VideoAvatar };
const identities = new Map<string, { expires: number; promise: Promise<Identity | null> }>();
let lastWarmup = 0;
let resourcesPrepared = false;
export function prepareVoiceResources() {
  if (resourcesPrepared || typeof document === 'undefined') return;
  resourcesPrepared = true;
  // DNS/TLS and static image only: no SDK client, capability or provider session.
  for (const href of [import.meta.env.VITE_SUPABASE_URL, 'https://api.simli.ai']) {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement('link'); link.rel = 'preconnect'; link.href = href; link.crossOrigin = 'anonymous'; document.head.appendChild(link);
  }
  const image = new Image(); image.src = portrait.url;
}
// Only public display identity is cached. Never preload session capabilities or private prompts.
export function preloadVoiceIdentity(agentId?: string) {
  prepareVoiceResources();
  if (Date.now() - lastWarmup > 5 * 60 * 1000) {
    lastWarmup = Date.now();
    // Health endpoints wake the voice and face services so the first tap connects faster.
    // They return before any capability, Gemini connection or Simli session is created.
    for (const fn of ["gemini-live-proxy?ping=1", "gemini-session?ping=1", "simli-avatar?ping=1"]) void supabase.functions.invoke(fn, { method: "GET" }).catch(() => {});
  }
  const key = agentId || "homepage";
  const cached = identities.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = supabase.functions.invoke(`voice-agent-public${agentId ? `?agentId=${agentId}` : ""}`, { method: "GET" }).then(({ data, error }) => {
    if (error || !data?.name) { identities.delete(key); return null; }
    if (agentId && data.avatarUrl) { const image = new Image(); image.src = data.avatarUrl; }
    return data as Identity;
  }).catch(() => { identities.delete(key); return null; });
  identities.set(key, { expires: Date.now() + 5 * 60 * 1000, promise });
  return promise;
}