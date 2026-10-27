import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import avatar from "@/assets/aspen_blonde_avatar.jpg";
import { renderGreeting, type WizardState } from "./wizardModel";

/** Shows the customer's real site (when it allows embedding) with the floating assistant drawn on top. */
export default function SitePreview({ state, open = true, screenshot }: { state: WizardState; open?: boolean; screenshot?: string }) {
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);
  const [standIn, setStandIn] = useState(false);
  const url = state.websiteUrl && (/^https?:\/\//i.test(state.websiteUrl) ? state.websiteUrl : `https://${state.websiteUrl}`);

  useEffect(() => {
    if (!url) { setEmbeddable(false); return; }
    let active = true;
    setEmbeddable(null);
    void supabase.functions.invoke("check-iframe-embed", { body: { url, embedOrigin: window.location.origin } })
      .then(({ data }) => { if (active) setEmbeddable(Boolean(data?.embeddable)); })
      .catch(() => { if (active) setEmbeddable(false); });
    return () => { active = false; };
  }, [url]);

  const side = state.corner === "bottom-left" ? "left-3" : "right-3";
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-muted">
      <div className="flex h-6 items-center gap-1.5 border-b border-border bg-card px-2">
        <span className="h-2 w-2 rounded-full bg-destructive/70" /><span className="h-2 w-2 rounded-full bg-accent" /><span className="h-2 w-2 rounded-full bg-primary/70" />
        <span className="ml-2 truncate text-[10px] text-muted-foreground">{url || "yourwebsite.com"}</span>
        {embeddable && screenshot && <Button variant="link" size="sm" onClick={() => setStandIn(!standIn)} className="ml-auto h-5 shrink-0 p-0 text-[10px]">{standIn ? "Live site" : "Captured site"}</Button>}
      </div>
      <div className="relative h-[calc(100%-1.5rem)]">
        {screenshot && (standIn || embeddable !== true) ? (
          <img src={screenshot} alt={`Captured website for ${state.businessName}`} className="h-full w-full object-cover object-top" />
        ) : embeddable && url && !standIn ? (
          <iframe title="Your website" src={url} className="pointer-events-none h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-background" sandbox="allow-scripts allow-same-origin" />
        ) : (
          <div className="p-4 text-xs text-muted-foreground" role="status">
            {url ? embeddable === null ? "Checking website…" : "Learn your website in step 2 to capture its original appearance." : "Add your website to see it here."}
            {url && <Button asChild variant="link" size="sm"><a href={url} target="_blank" rel="noopener noreferrer">Open original website</a></Button>}
          </div>
        )}
        {open && (
          <div className={`absolute bottom-14 ${side} w-[46%] min-w-[150px] rounded-lg border border-border bg-card p-2 shadow-lg`}>
            <div className="mb-1 flex items-center gap-1.5">
              <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
              <span className="text-[10px] font-semibold">{state.name || "Aspen"}</span>
            </div>
            <p className="rounded bg-muted p-1.5 text-[10px] leading-snug">{renderGreeting(state)}</p>
          </div>
        )}
        <div className={`absolute bottom-3 ${side} flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[11px] font-semibold shadow-lg`} style={{ background: state.color, color: "#fff" }}>
          <img src={avatar} alt="" className="h-7 w-7 rounded-full border-2 border-white/70 object-cover" />
          {state.label}
        </div>
      </div>
    </div>
  );
}
