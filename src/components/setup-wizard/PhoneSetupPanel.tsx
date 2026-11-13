import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Check, Phone, PhoneForwarded, PhoneIncoming, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CARRIER_GUIDES, carrierGuide, fillAspenNumber, type CarrierGuide } from "../../../supabase/functions/_shared/carrier-guides";
import { RING_OPTIONS, ringSeconds, type PhoneRoute, type PhoneSetupState } from "../../../supabase/functions/_shared/onboarding";

async function request(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("voice-agents", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : error.message);
  }
  return data;
}

export function CarrierGuideView({ guide, aspenNumber }: { guide: CarrierGuide; aspenNumber?: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
      <p className="font-semibold">{guide.name} — forwarding guide</p>
      {!guide.verified && guide.fallback ? (
        <p className="leading-relaxed text-muted-foreground">{guide.fallback}</p>
      ) : (
        guide.sections.map((s) => (
          <div key={s.heading} className="space-y-1.5">
            <p className="font-medium">{s.heading}</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              {s.steps.map((t, i) => <li key={i} className="leading-relaxed">{fillAspenNumber(t, aspenNumber)}</li>)}
            </ol>
            {s.note && <p className="text-xs text-muted-foreground">Note: {s.note}</p>}
          </div>
        ))
      )}
      <p className="text-[11px] text-muted-foreground">
        Steps checked against {guide.name}&rsquo;s own support pages.{" "}
        {guide.sourceUrls.map((u, i) => (
          <span key={u}>{i > 0 && " · "}<a className="underline" href={u} target="_blank" rel="noopener noreferrer">Source {i + 1}</a></span>
        ))}
      </p>
    </div>
  );
}

const ROUTES: { id: PhoneRoute; icon: typeof Phone; title: string; blurb: string }[] = [
  { id: "forward", icon: PhoneForwarded, title: "Forward my existing number", blurb: "Keep your carrier. Your phone rings first; unanswered calls forward to Aspen." },
  { id: "port", icon: PhoneIncoming, title: "Bring my number to AiHiddenLeads", blurb: "We move your number to our phone platform and host it. Porting takes several business days — we handle the paperwork." },
  { id: "new", icon: Plus, title: "Get a new number", blurb: "A fresh Aspen number in your area code, assigned by our team." },
];

function statusCopy(p: PhoneSetupState): string {
  switch (p.status) {
    case "awaiting_number": return "Saved. We're assigning your dedicated Aspen number — this step completes when it's ready, and we'll email you.";
    case "waiting_first_call": return `Setup saved — waiting for your first forwarded call. Forward ${p.businessNumber || "your number"} to ${p.aspenNumber || "your Aspen number"}, then call your own number and let it ring out.`;
    case "port_requested": return "Port requested. We've recorded your request and our team will start the port — do not cancel your old line until we confirm the port is complete. We'll email you updates.";
    case "new_number_requested": return "Requested. Our team is assigning your new Aspen number — we'll email it as soon as it's ready.";
    case "live_detected": return "Live — Aspen has answered a forwarded call on your line.";
    case "live_confirmed": return "Live — you confirmed your test call reached Aspen.";
    default: return "";
  }
}

export default function PhoneSetupPanel({ agentId, value, onSaved }: { agentId?: string; value: PhoneSetupState; onSaved: (p: PhoneSetupState) => void }) {
  const [route, setRoute] = useState<PhoneRoute | undefined>(value.route);
  const [businessNumber, setBusinessNumber] = useState(value.businessNumber || "");
  const [transferNumber, setTransferNumber] = useState(value.transferNumber || "");
  const [carrierId, setCarrierId] = useState(value.carrierId || "");
  const [rings, setRings] = useState<number>(value.rings || 3);
  const [areaCode, setAreaCode] = useState(value.areaCode || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRoute(value.route); setBusinessNumber(value.businessNumber || ""); setTransferNumber(value.transferNumber || "");
    setCarrierId(value.carrierId || ""); setRings(value.rings || 3); setAreaCode(value.areaCode || "");
  }, [value]);

  const guide = carrierGuide(carrierId);
  const seconds = ringSeconds(rings);

  async function save() {
    if (!agentId || !route) return;
    setBusy(true);
    try {
      const data = await request({ action: "phoneSetup", agentId, phoneSetup: { route, businessNumber: businessNumber.trim() || undefined, transferNumber: transferNumber.trim() || undefined, carrierId: carrierId || undefined, rings, areaCode: areaCode.trim() || undefined } });
      onSaved(data.phoneSetup as PhoneSetupState);
      toast.success("Phone setup saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save phone setup"); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (!agentId) return;
    setBusy(true);
    try {
      const data = await request({ action: "onboarding", agentId });
      onSaved(data.phoneSetup as PhoneSetupState);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not refresh status"); }
    finally { setBusy(false); }
  }

  async function confirmTestCall() {
    if (!agentId) return;
    setBusy(true);
    try {
      const data = await request({ action: "onboarding", agentId, confirmTestCall: "phone" });
      onSaved(data.phoneSetup as PhoneSetupState);
      toast.success("Marked live — thanks for testing");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not confirm"); }
    finally { setBusy(false); }
  }

  const saved = value.status !== "not_started";

  return (
    <div className="space-y-4 rounded-2xl border border-border p-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-base font-bold"><Phone className="h-5 w-5 text-primary" /> Your phone number</h3>
        <p className="text-sm text-muted-foreground">Do you have a business number you want Aspen to answer? Your phone rings first — after the rings you choose, Aspen picks up instead of voicemail.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {ROUTES.map((r) => (
          <button key={r.id} type="button" onClick={() => setRoute(r.id)} className={`rounded-xl border-2 p-3 text-left transition ${route === r.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
            <r.icon className={`mb-1 h-4 w-4 ${route === r.id ? "text-primary" : "text-muted-foreground"}`} />
            <p className="text-sm font-semibold">{r.title}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{r.blurb}</p>
          </button>
        ))}
      </div>

      {route === "forward" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Your business number
            <Input inputMode="tel" placeholder="+1 555 123 4567" value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-medium">Your current carrier
            <Select value={carrierId} onValueChange={setCarrierId}>
              <SelectTrigger aria-label="Your carrier"><SelectValue placeholder="Choose your carrier" /></SelectTrigger>
              <SelectContent className="z-[130]">{CARRIER_GUIDES.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}{g.country === "CA" ? " (Canada)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <div className="space-y-1">
            <p className="text-sm font-medium">Rings before Aspen answers</p>
            <div className="flex flex-wrap gap-2">{RING_OPTIONS.map((o) => (
              <button key={o.rings} type="button" onClick={() => setRings(o.rings)} className={`rounded-full border px-3 py-1 text-xs ${rings === o.rings ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{o.rings} rings · ~{o.seconds}s</button>
            ))}</div>
            <p className="text-xs text-muted-foreground">Each ring is about 5–6 seconds. On your carrier the delay is set in seconds (about {seconds} seconds for {rings} rings) — your carrier&rsquo;s guide below uses that number.</p>
          </div>
          <label className="block space-y-1 text-sm font-medium">If Aspen needs to transfer a hot caller, ring this number (optional)
            <Input inputMode="tel" placeholder="Defaults to your business number" value={transferNumber} onChange={(e) => setTransferNumber(e.target.value)} />
          </label>
          {guide && <CarrierGuideView guide={guide} aspenNumber={value.aspenNumber} />}
        </div>
      )}

      {route === "port" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Number to bring over
            <Input inputMode="tel" placeholder="+1 555 123 4567" value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-medium">Its current carrier
            <Select value={carrierId} onValueChange={setCarrierId}>
              <SelectTrigger aria-label="Current carrier"><SelectValue placeholder="Choose the current carrier" /></SelectTrigger>
              <SelectContent className="z-[130]">{CARRIER_GUIDES.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}{g.country === "CA" ? " (Canada)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            Honest timing: porting a number usually takes several business days and your old carrier has to release it. Saving this step records your port request with our team — it does not instantly move the number. Keep your old line active until we confirm the port completed, or callers won&rsquo;t reach you.
          </p>
        </div>
      )}

      {route === "new" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">Preferred area code (optional)
            <Input inputMode="numeric" maxLength={3} placeholder="e.g. 954" value={areaCode} onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">We&rsquo;ll assign a new Aspen number — in your area code when one is available — and email it to you. You can publish it anywhere, or forward an existing number to it later.</p>
        </div>
      )}

      {route && (
        <Button disabled={busy || !agentId || ((route === "forward" || route === "port") && !businessNumber.trim())} onClick={() => void save()}>
          {busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save phone setup
        </Button>
      )}

      {saved && (
        <div className="space-y-2 rounded-xl bg-primary/5 p-3">
          <p role="status" className="text-sm leading-relaxed">{statusCopy(value)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Check status</Button>
            {value.status === "waiting_first_call" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void confirmTestCall()}>I called my number and Aspen answered</Button>
            )}
          </div>
          {value.status === "waiting_first_call" && (
            <p className="text-xs text-muted-foreground">Test it yourself: call your own business number from another phone, let it ring without answering, and Aspen should pick up after about {value.rings || 3} rings.</p>
          )}
        </div>
      )}
    </div>
  );
}
