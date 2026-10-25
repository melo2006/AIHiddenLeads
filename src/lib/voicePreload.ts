import { supabase } from "@/integrations/supabase/client";

type Identity = { name: string; businessName: string; avatarUrl: string };
const identities = new Map<string, { expires: number; promise: Promise<Identity | null> }>();
// Only public display identity is cached. Never preload session capabilities or private prompts.
export function preloadVoiceIdentity(agentId?: string) {
  const key = agentId || "homepage";
  const cached = identities.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = supabase.functions.invoke(`voice-agent-public${agentId ? `?agentId=${agentId}` : ""}`, { method: "GET" }).then(({ data, error }) => {
    if (error || !data?.name) { identities.delete(key); return null; }
    if (data.avatarUrl) { const image = new Image(); image.src = data.avatarUrl; }
    return data as Identity;
  }).catch(() => { identities.delete(key); return null; });
  identities.set(key, { expires: Date.now() + 5 * 60 * 1000, promise });
  return promise;
}