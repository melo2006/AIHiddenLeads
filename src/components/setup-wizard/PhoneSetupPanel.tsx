import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Check, MessageSquare, Phone, PhoneForwarded, PhoneIncoming, Plus, RefreshCw, Search } from "lucide-react";
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
  { id: "new", icon: Plus, title: "Get a new number", blurb: "Pick a fresh Aspen number in your area code — included in your plan." },
];

/** +19545550134 -> (954) 555-0134 for display. Non-US shapes pass through. */
export function formatUsNumber(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return e164;
}

interface NumberCandidate { phoneNumber: string; locality?: string; region?: string; rateCenter?: string }

/** Provider place names arrive ALL-CAPS ("POMPANO BEACH") — soften to title case for display. */
export function prettyPlace(locality?: string, region?: string, rateCenter?: string): string {
  const city = locality || rateCenter || "";
  const titled = city === city.toUpperCase() ? city.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : city;
  return [titled, region].filter(Boolean).join(", ");
}

function statusCopy(p: PhoneSetupState): string {
  switch (p.status) {
    case "awaiting_number": return "Saved. We're assigning your dedicated Aspen number — this step completes when it's ready, and we'll email you.";
    case "waiting_first_call": return `Setup saved — waiting for your first forwarded call. Forward ${p.businessNumber || "your number"} to ${p.aspenNumber || "your Aspen number"}, then call your own number and let it ring out.`;
    case "port_requested": return "Port requested. We've recorded your request and our team will start the port — do not cancel your old line until we confirm the port is complete. We'll email you updates.";
    case "new_number_requested":
      if (p.aspenNumber) return `Live — your new number ${formatUsNumber(p.aspenNumber)} is active and Aspen answers it now. Publish it anywhere.`;
      if (p.selectedNumber) return `You picked ${formatUsNumber(p.selectedNumber)}. We're activating it now — we'll email you the moment it's live.`;
      return "Requested. Our team is assigning your new Aspen number — we'll email it as soon as it's ready.";
    case "live_detected": return "Live — Aspen has answered a forwarded call on your line.";
    case "live_confirmed": return "Live — you confirmed your test call reached Aspen.";
    default: return "";
  }
}

export default function PhoneSetupPanel({ agentId, value, onSaved, businessName }: { agentId?: string; value: PhoneSetupState; onSaved: (p: PhoneSetupState) => void; businessName?: string }) {
  const [route, setRoute] = useState<PhoneRoute | undefined>(value.route);
  const [businessNumber, setBusinessNumber] = useState(value.businessNumber || "");
  const [transferNumber, setTransferNumber] = useState(value.transferNumber || "");
  const [carrierId, setCarrierId] = useState(value.carrierId || "");
  const [rings, setRings] = useState<number>(value.rings || 3);
  const [areaCode, setAreaCode] = useState(value.areaCode || "");
  const [zip, setZip] = useState("");
  const [vanity, setVanity] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<NumberCandidate[]>([]);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState(value.selectedNumber || "");
  const [selectedLocality, setSelectedLocality] = useState(value.selectedNumberLocality || "");
  const [smsWanted, setSmsWanted] = useState(Boolean(value.smsIntent?.wanted));
  const [smsLegalName, setSmsLegalName] = useState(value.smsIntent?.legalName || businessName || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRoute(value.route); setBusinessNumber(value.businessNumber || ""); setTransferNumber(value.transferNumber || "");
    setCarrierId(value.carrierId || ""); setRings(value.rings || 3); setAreaCode(value.areaCode || "");
    setSelected(value.selectedNumber || ""); setSelectedLocality(value.selectedNumberLocality || "");
    setSmsWanted(Boolean(value.smsIntent?.wanted)); setSmsLegalName(value.smsIntent?.legalName || businessName || "");
  }, [value]);

  const guide = carrierGuide(carrierId);
  const seconds = ringSeconds(rings);

  async function searchNumbers() {
    if (!agentId) return;
    const ac = areaCode.trim();
    if (ac && ac.length !== 3) { setSearchError("Area codes are 3 digits — check what you typed."); return; }
    if (!ac && !zip.trim() && !vanity.trim()) { setSearchError("Enter an area code, a ZIP code, or a word you'd like your number to spell."); return; }
    setSearching(true); setSearchError("");
    try {
      const data = await request({ action: "searchNumbers", agentId, numberQuery: { areaCode: ac || undefined, zip: zip.trim() || undefined, contains: vanity.trim() || undefined } });
      setResults((data.numbers || []) as NumberCandidate[]);
      setSearched(true);
    } catch (e) { setSearchError(e instanceof Error ? e.message : "Number search is unavailable right now"); setResults([]); setSearched(true); }
    finally { setSearching(false); }
  }

  async function save() {
    if (!agentId || !route) return;
    setBusy(true);
    try {
      const withSms = route === "new" || route === "port";
      const data = await request({ action: "phoneSetup", agentId, phoneSetup: { route, businessNumber: businessNumber.trim() || undefined, transferNumber: transferNumber.trim() || undefined, carrierId: carrierId || undefined, rings, areaCode: areaCode.trim() || undefined, selectedNumber: route === "new" && selected ? selected : undefined, selectedNumberLocality: route === "new" && selected ? (selectedLocality || undefined) : undefined, smsIntent: withSms ? { wanted: smsWanted, legalName: smsLegalName.trim() || undefined } : undefined } });
      let savedState = data.phoneSetup as PhoneSetupState;
      // New route with a pick: ask the server to activate it. The action
      // is idempotent — re-saving never activates (or buys) twice.
      if (route === "new" && selected && !savedState.aspenNumber) {
        try {
          const act = await request({ action: "provisionNumber", agentId });
          if (act.phoneSetup) savedState = act.phoneSetup as PhoneSetupState;
        } catch { /* activation continues in the background; the saved pick + status copy say so honestly */ }
      }
      onSaved(savedState);
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
          {value.aspenNumber ? (
            <p className="rounded-lg bg-primary/5 p-3 text-sm leading-relaxed">Your number <strong>{formatUsNumber(value.aspenNumber)}</strong> is live — Aspen answers it now. Publish it anywhere.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1 text-sm font-medium">Area code
                  <Input inputMode="numeric" maxLength={3} placeholder="e.g. 954" value={areaCode} onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))} />
                </label>
                <label className="block space-y-1 text-sm font-medium">or ZIP code
                  <Input inputMode="numeric" maxLength={5} placeholder="e.g. 33308" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
                </label>
                <label className="block space-y-1 text-sm font-medium">or a word it spells
                  <Input maxLength={10} placeholder="e.g. PLUMB" value={vanity} onChange={(e) => setVanity(e.target.value.toUpperCase())} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" disabled={searching || !agentId} onClick={() => void searchNumbers()}>
                  {searching ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Find my numbers
                </Button>
                <p className="text-xs text-muted-foreground">Your first number is <strong>included in your plan</strong> — no extra monthly charge. Additional numbers are $3/mo each.</p>
              </div>
              {searchError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">{searchError}</p>}
              {searched && !searchError && results.length === 0 && (
                <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">No numbers came back for that search. Try a nearby area code, or clear the word it spells — some words are rare in real inventory. You can also save now and our team will assign a number for you, or forward your existing number instead.</p>
              )}
              {results.length > 0 && (
                <div className="space-y-2" role="radiogroup" aria-label="Available numbers">
                  {results.map((n) => {
                    const place = prettyPlace(n.locality, n.region, n.rateCenter);
                    const isPick = selected === n.phoneNumber;
                    return (
                      <button key={n.phoneNumber} type="button" role="radio" aria-checked={isPick} onClick={() => { setSelected(n.phoneNumber); setSelectedLocality(place); }} className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 p-3 text-left transition ${isPick ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                        <span>
                          <span className="block text-sm font-semibold">{formatUsNumber(n.phoneNumber)}</span>
                          {place && <span className="block text-[11px] text-muted-foreground">{place}</span>}
                        </span>
                        {isPick ? <span className="flex items-center gap-1 text-xs font-semibold text-primary"><Check className="h-3.5 w-3.5" />Your pick</span> : <span className="text-[11px] text-muted-foreground">Included in your plan</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {selected && (
                <p className="text-xs text-muted-foreground">Your pick: <strong>{formatUsNumber(selected)}</strong>{selectedLocality ? ` · ${selectedLocality}` : ""}. Save below and we&rsquo;ll activate it. You can publish it anywhere, or forward an existing number to it later.</p>
              )}
              {!selected && (
                <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">Prefer not to pick? Save now and we&rsquo;ll assign a new Aspen number — in your area code when one is available — and email it to you.</p>
              )}
            </>
          )}
        </div>
      )}

      {(route === "new" || route === "port") && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={smsWanted} onChange={(e) => setSmsWanted(e.target.checked)} />
            <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" />I also want texting (SMS) on my number</span>
          </label>
          {smsWanted && (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Honest timing: texting needs a one-time registration for your business with the mobile carriers — an anti-spam rule that applies to every business, us included. We file it for you. It usually takes a few business days, and we&rsquo;ll email you when texting is live on your number. Your voice service starts right away either way.
              </p>
              <label className="block space-y-1 text-sm font-medium">Legal business name (as registered)
                <Input placeholder="e.g. BlueLine Plumbing Co. LLC" value={smsLegalName} onChange={(e) => setSmsLegalName(e.target.value)} />
              </label>
              <p className="text-[11px] text-muted-foreground">Use the exact legal name on your business registration — the carriers check it against their records.</p>
              {value.smsIntent?.status === "requested" && <p className="text-xs font-medium text-primary">Texting requested — we&rsquo;ll file your registration and email you when it&rsquo;s live.</p>}
            </div>
          )}
        </div>
      )}

      {route === "forward" && (
        <p className="text-xs leading-relaxed text-muted-foreground">Want texting too? Texting (SMS) becomes available once a number sits on our phone platform — choose &ldquo;Get a new number&rdquo; or &ldquo;Bring my number&rdquo; above and tick the texting box there.</p>
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
