import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Check, ChevronRight, ListChecks, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { checklistProgress, deriveChecklist, type PhoneSetupState } from "../../supabase/functions/_shared/onboarding";

async function request(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("voice-agents", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : error.message);
  }
  return data;
}

/** First-steps checklist (onboarding batch, 2026-11-12). State is derived
 *  server-side from real records by the voice-agents 'onboarding' action —
 *  learned sources, session history, telephony state — never from local
 *  ticks, except the one explicit "I made my test call" confirmation the
 *  server stamps when automatic detection has nothing to see yet. */
export default function FirstStepsChecklist({ agentId }: { agentId?: string }) {
  const [items, setItems] = useState<ReturnType<typeof deriveChecklist> | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (confirm = false) => {
    if (!agentId) return;
    setBusy(true);
    try {
      const data = await request({ action: "onboarding", agentId, ...(confirm ? { confirmTestCall: "agent" } : {}) });
      setItems(deriveChecklist({
        workspaceReady: Boolean(data.workspaceReady),
        phone: (data.phoneSetup || { status: "not_started" }) as PhoneSetupState,
        taught: Boolean(data.taught),
        testCallDone: Boolean(data.testCallDone),
        published: Boolean(data.published),
      }));
      setFailed(false);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }, [agentId]);

  useEffect(() => { void load(); }, [load]);

  if (!agentId || failed) return null;
  if (!items) return null;
  const progress = checklistProgress(items);
  if (progress.complete) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4">
        <Check className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold">You&rsquo;re all set up</h2>
          <p className="text-sm text-muted-foreground">Every first step is done. Aspen is ready for your customers.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><ListChecks className="h-5 w-5 text-primary" /> Your first steps</h2>
        <span className="text-xs text-muted-foreground">{progress.done} of {progress.total} done</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
        <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </div>
      <ol className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-2.5">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${item.done ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"}`}>
              <Check className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
            </div>
            {!item.done && item.id === "testcall" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load(true)}>I made my test call</Button>
            )}
            {!item.done && item.id !== "testcall" && (
              <Button asChild size="sm" variant="ghost"><a href={item.href}>Start<ChevronRight className="ml-0.5 h-3.5 w-3.5" /></a></Button>
            )}
          </li>
        ))}
      </ol>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />Refresh progress</Button>
    </section>
  );
}
