import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Copy, Link2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("voice-agents", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : error.message);
  }
  return data;
}

/** Admin-only: creates a private 14-day client demo link for this saved draft (replaces any previous link). */
export default function ShareDemoLink({ agentId, beforeShare }: { agentId: string; beforeShare: () => Promise<boolean> }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      if (!(await beforeShare())) return;
      const data = await call({ action: "share", agentId });
      const link = `${window.location.origin}/demo-share/${data.token}`;
      setUrl(link);
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      toast.success("Client demo link copied. It works for 14 days.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create link"); }
    finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true);
    try { await call({ action: "unshare", agentId }); setUrl(""); toast.success("Client demo links turned off"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not turn off links"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">Share this draft with a client: they see only the website preview and can talk to the assistant. Calls use real voice minutes.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void create()}><Link2 className="mr-1.5 h-4 w-4" />{url ? "New link" : "Create client demo link"}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void turnOff()}><XCircle className="mr-1.5 h-4 w-4" />Turn off links</Button>
      </div>
      {url && (
        <div className="flex gap-2">
          <Input readOnly value={url} aria-label="Client demo link" className="h-8 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="secondary" aria-label="Copy link" onClick={() => void navigator.clipboard?.writeText(url).then(() => toast.success("Copied"))}><Copy className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
