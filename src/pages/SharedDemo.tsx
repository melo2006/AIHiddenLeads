import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GeminiConversation from "@/components/GeminiConversation";
import SitePreview from "@/components/setup-wizard/SitePreview";
import { EMPTY, type WizardState } from "@/components/setup-wizard/wizardModel";

type ShareInfo = { name: string; businessName: string; websiteUrl: string; industry: string; greeting: string; previewScreenshot: string; launcherLabel: string; launcherCorner: string; theme?: { primary?: string } };

/** Public client demo: only the shared draft's public appearance and a voice call; no admin controls or other tenants. */
export default function SharedDemo() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Your assistant demo · AI Hidden Leads";
    const base = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${base}/functions/v1/voice-agent-public?share=${encodeURIComponent(token)}`, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Demo unavailable"); setInfo(d); })
      .catch((e) => setError(e instanceof Error ? e.message : "Demo unavailable"));
  }, [token]);

  const state: WizardState | null = info && {
    ...EMPTY, websiteUrl: info.websiteUrl, businessName: info.businessName, industry: info.industry, name: info.name || "Aspen",
    greeting: info.greeting || EMPTY.greeting, color: info.theme?.primary || EMPTY.color, label: info.launcherLabel,
    corner: info.launcherCorner === "bottom-left" ? "bottom-left" : "bottom-right",
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background px-4">
        <span className="text-sm font-extrabold">AI Hidden Leads</span>
        <span className="ml-auto text-xs text-muted-foreground">Private demo</span>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 p-4 py-6">
        {error ? <p role="alert" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{error}</p>
          : !state ? <p role="status" className="text-sm text-muted-foreground">Loading your demo…</p>
          : <>
              <div>
                <h1 className="text-xl font-extrabold">{state.businessName}'s AI assistant</h1>
                <p className="text-sm text-muted-foreground">Here is how {state.name} would look on your website. Start a call below to hear the real voice.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_360px]">
                <SitePreview state={state} screenshot={info?.previewScreenshot || undefined} />
                <div className="rounded-xl border border-border p-2"><GeminiConversation shareToken={token} name={state.name} compact /></div>
              </div>
            </>}
      </main>
    </div>
  );
}
