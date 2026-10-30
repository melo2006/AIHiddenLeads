import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { customerRate, resolveRule, summarizeUsage } from "@/lib/telephonyPricing";

type Pricing = Tables<"telephony_pricing">;
type Client = Tables<"telephony_clients">;
type Usage = Tables<"telephony_usage">;

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const money = (n: number, d = 4) => `$${n.toFixed(d)}`;

const steps: { text: string; href?: string }[] = [
  { text: "Your Twilio account is already connected to the app securely. You don't need to paste any API keys here." },
  { text: "Buy a local voice + SMS number for each client (about $1.15/month).", href: "https://console.twilio.com/us1/develop/phone-numbers/manage/search" },
  { text: "Open the number and copy its Phone Number SID (starts with PN), then add it below.", href: "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" },
  { text: "Turn on SMS Pumping Protection to block fraudulent text charges.", href: "https://console.twilio.com/us1/develop/sms/settings/sms-pumping-protection" },
  { text: "Limit SMS Geo Permissions to the countries you actually serve.", href: "https://console.twilio.com/us1/develop/sms/settings/geo-permissions" },
  { text: "Before texting US customers, register A2P 10DLC, or use a toll-free number with verification.", href: "https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc-overview" },
  { text: "Press 'Answer this number with Aspen' on the client below. The previous setting (e.g. Retell) is saved and 'Switch back' restores it." },
  { text: "Test: call the number from a phone other than the transfer number. Ask a question, then say 'transfer me'. The transfer phone hears a short summary first." },
  { text: "Once call routing is switched on, the customer forwards their existing business number to the assigned number. They keep their own number; it isn't ported." },
];

const blankClient = { client_name: "", voice_number: "", number_sid: "", sms_number: "", transfer_phone: "+19547706622", transfer_name: "Owner", markup_pct: null, fixed_voice_per_min: null, fixed_sms_per_segment: null, monthly_cap_usd: 10, active: true, notes: "" };

export default function TelephonyAdminView() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [draft, setDraft] = useState<Partial<Client>>(blankClient);

  const load = async () => {
    const [p, c] = await Promise.all([
      supabase.from("telephony_pricing").select("*").maybeSingle(),
      supabase.from("telephony_clients").select("*").order("client_name"),
    ]);
    if (p.error || c.error) toast.error(p.error?.message || c.error?.message);
    setPricing(p.data); setClients(c.data ?? []);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
    supabase.from("telephony_usage").select("*").gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString())
      .then(({ data, error }) => { if (error) toast.error(error.message); setUsage(data ?? []); });
  }, [month]);

  const costs = pricing ? { inboundPerMin: pricing.twilio_inbound_per_min, outboundPerMin: pricing.twilio_outbound_per_min, smsPerSegment: pricing.twilio_sms_per_segment } : null;
  const defaults = pricing ? { markupPct: pricing.default_markup_pct, fixedVoicePerMin: pricing.fixed_voice_per_min, fixedSmsPerSegment: pricing.fixed_sms_per_segment } : null;
  const proposedVoice = pricing ? customerRate(pricing.twilio_inbound_per_min, pricing.default_markup_pct, pricing.fixed_voice_per_min) : 0;
  const proposedSms = pricing ? customerRate(pricing.twilio_sms_per_segment, pricing.default_markup_pct, pricing.fixed_sms_per_segment) : 0;

  const report = useMemo(() => !costs || !defaults ? [] : clients.map((c) => {
    const rule = resolveRule(defaults, { markupPct: c.markup_pct ?? undefined, fixedVoicePerMin: c.fixed_voice_per_min ?? undefined, fixedSmsPerSegment: c.fixed_sms_per_segment ?? undefined });
    const rows = usage.filter((u) => u.client_id === c.id).map((u) => ({ ...u, kind: u.kind as "call" | "sms", direction: u.direction as "inbound" | "outbound" }));
    return { client: c, ...summarizeUsage(rows, costs, rule) };
  }), [clients, usage, costs, defaults]);

  const savePricing = async (extra: Partial<Pricing> = {}) => {
    if (!pricing) return;
    const { id: _id, updated_at: _u, ...rest } = pricing;
    const { error } = await supabase.from("telephony_pricing").update({ ...rest, ...extra, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Saved"); load();
  };

  const saveClient = async (c: Partial<Client>) => {
    if (!c.client_name?.trim()) return toast.error("Client name is required");
    if (c.voice_number && !/^\+[1-9]\d{7,14}$/.test(c.voice_number)) return toast.error("Phone numbers must look like +15551234567");
    const { id, created_at: _c, ...rest } = c as Client;
    const payload = { ...rest, client_name: c.client_name!, updated_at: new Date().toISOString() };
    const { error } = id ? await supabase.from("telephony_clients").update(payload).eq("id", id) : await supabase.from("telephony_clients").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Client saved"); if (!id) setDraft(blankClient); load();
  };

  const routeNumber = async (c: Partial<Client>, op: "connect" | "restore") => {
    const { data, error } = await supabase.functions.invoke("telephony-voice", { body: { op, clientId: c.id } });
    if (error || data?.error) {
      const details = error && "context" in error ? await (error as any).context.text().catch(() => error.message) : data?.error;
      return toast.error(`Could not update the Twilio number: ${details}`);
    }
    toast.success(op === "connect" ? "Number now answered by Aspen. Call it to test." : "Previous call setup (Retell) restored.");
    load();
  };
  const removeClient = async (id: string) => {
    const { error } = await supabase.from("telephony_clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const field = (label: string, value: number | null | undefined, onChange: (v: number | null) => void, hint?: string) => (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input type="number" step="0.0001" className="h-8 text-xs" value={value ?? ""} onChange={(e) => onChange(num(e.target.value))} />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Phone & SMS</h1>
        <p className="text-xs text-muted-foreground">Assign client numbers, set your markup and review monthly usage. Calls aren't routed to Aspen yet. Usage will appear here once call routing is switched on.</p>
      </div>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Setup steps in Twilio</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <ol className="space-y-2 text-xs">
            {steps.map((s, i) => <li key={i} className="flex gap-2"><span className="font-bold text-primary">{i + 1}.</span><span>{s.text}{s.href && <> <a href={s.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">Open <ExternalLink className="h-3 w-3" /></a></>}</span></li>)}
          </ol>
        </CardContent>
      </Card>

      {pricing && <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Your Twilio cost and customer price</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {field("Twilio inbound / min", pricing.twilio_inbound_per_min, (v) => setPricing({ ...pricing, twilio_inbound_per_min: v ?? 0 }), "US local ≈ $0.0085")}
            {field("Twilio outbound / min", pricing.twilio_outbound_per_min, (v) => setPricing({ ...pricing, twilio_outbound_per_min: v ?? 0 }), "US ≈ $0.014; transfers add a leg")}
            {field("Twilio SMS / segment", pricing.twilio_sms_per_segment, (v) => setPricing({ ...pricing, twilio_sms_per_segment: v ?? 0 }), "US ≈ $0.0083 + carrier fees")}
            {field("Twilio number / month", pricing.twilio_number_monthly, (v) => setPricing({ ...pricing, twilio_number_monthly: v ?? 0 }), "Local ≈ $1.15")}
          </div>
          <p className="text-[10px] text-muted-foreground">These are approximate list prices. Check your actual rates on <a className="text-primary underline" href="https://www.twilio.com/en-us/voice/pricing/us" target="_blank" rel="noreferrer">Twilio voice pricing</a> and <a className="text-primary underline" href="https://www.twilio.com/en-us/sms/pricing/us" target="_blank" rel="noreferrer">SMS pricing</a>. Aspen's AI voice cost is tracked separately under Voice Usage & Costs.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {field("Default markup %", pricing.default_markup_pct, (v) => setPricing({ ...pricing, default_markup_pct: v ?? 0 }), "e.g. 30 = cost + 30%")}
            {field("Fixed price / min (optional)", pricing.fixed_voice_per_min, (v) => setPricing({ ...pricing, fixed_voice_per_min: v }), "Overrides markup when set")}
            {field("Fixed price / SMS (optional)", pricing.fixed_sms_per_segment, (v) => setPricing({ ...pricing, fixed_sms_per_segment: v }), "Overrides markup when set")}
          </div>
          <div className="grid gap-2 rounded-md border border-border p-3 text-xs sm:grid-cols-2">
            <p>Customer price per call minute: <b className="text-primary">{money(proposedVoice)}</b> <span className="text-muted-foreground">(profit {money(proposedVoice - pricing.twilio_inbound_per_min)})</span></p>
            <p>Customer price per SMS: <b className="text-primary">{money(proposedSms)}</b> <span className="text-muted-foreground">(profit {money(proposedSms - pricing.twilio_sms_per_segment)})</span></p>
            <p className="text-muted-foreground sm:col-span-2">Shown on the website now: {money(pricing.published_voice_per_min, 3)}/min{pricing.published_sms_per_segment != null ? `, ${money(pricing.published_sms_per_segment, 3)}/SMS` : ""}{pricing.published_at ? ` · published ${new Date(pricing.published_at).toLocaleDateString()}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => savePricing()}><Save className="mr-1 h-3.5 w-3.5" />Save costs & markup</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button size="sm" variant="outline">Publish price to website…</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Update the public phone price?</AlertDialogTitle>
                  <AlertDialogDescription>Visitors will see {money(proposedVoice, 3)} per minute and {money(proposedSms, 3)} per SMS. Existing clients with their own price keep it.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => savePricing({ published_voice_per_min: proposedVoice, published_sms_per_segment: proposedSms, published_at: new Date().toISOString() })}>Publish</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Client numbers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[...clients, { ...draft, id: undefined } as Partial<Client>].map((c, idx) => {
            const isNew = !c.id;
            const set = (patch: Partial<Client>) => isNew ? setDraft({ ...draft, ...patch }) : setClients(clients.map((x) => x.id === c.id ? { ...x, ...patch } : x));
            const text = (label: string, key: keyof Client, ph: string) => (
              <div className="space-y-1"><Label className="text-[11px]">{label}</Label><Input className="h-8 text-xs" placeholder={ph} value={(c[key] as string) ?? ""} onChange={(e) => set({ [key]: e.target.value } as Partial<Client>)} /></div>
            );
            return <div key={c.id ?? `new-${idx}`} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{isNew ? "Add client" : c.client_name}</p>
                {!isNew && <div className="flex items-center gap-2"><Label className="text-[11px]">Active</Label><Switch checked={!!c.active} onCheckedChange={(v) => set({ active: v })} /></div>}
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {text("Client name", "client_name", "Acme Plumbing")}
                {text("Assigned Twilio number", "voice_number", "+15551234567")}
                {text("Number SID", "number_sid", "PN…")}
                {text("SMS number (if different)", "sms_number", "+15551234567")}
                {text("Warm transfer number", "transfer_phone", "+19547706622")}
                {text("Transfer to (name or title)", "transfer_name", "Sales Director")}
                {field("Markup % override", c.markup_pct, (v) => set({ markup_pct: v }))}
                {field("Fixed $/min override", c.fixed_voice_per_min, (v) => set({ fixed_voice_per_min: v }))}
                {field("Fixed $/SMS override", c.fixed_sms_per_segment, (v) => set({ fixed_sms_per_segment: v }))}
                {field("Monthly spend cap $", c.monthly_cap_usd, (v) => set({ monthly_cap_usd: v }))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => saveClient(c)}>{isNew ? <><Plus className="mr-1 h-3.5 w-3.5" />Add</> : <><Save className="mr-1 h-3.5 w-3.5" />Save</>}</Button>
                {!isNew && (c.routed_to_aspen
                  ? <Button size="sm" variant="outline" onClick={() => routeNumber(c, "restore")}>Switch back to previous setup</Button>
                  : <Button size="sm" variant="secondary" onClick={() => routeNumber(c, "connect")}>Answer this number with Aspen</Button>)}
                {!isNew && c.routed_to_aspen && <Badge variant="secondary" className="self-center text-[10px]">Aspen answering</Badge>}
                {!isNew && <Button size="sm" variant="ghost" onClick={() => removeClient(c.id!)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">Monthly usage & charges</CardTitle>
          <Input type="month" className="h-8 w-40 text-xs" value={month} onChange={(e) => setMonth(e.target.value)} />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1">Client</th><th>Calls</th><th>Minutes</th><th>SMS</th><th>Twilio cost</th><th>Charge</th><th>Profit</th><th>Cap</th></tr></thead>
            <tbody>
              {report.map((r) => <tr key={r.client.id} className="border-t border-border">
                <td className="py-1.5">{r.client.client_name}</td><td>{r.calls}</td><td>{(r.seconds / 60).toFixed(1)}</td><td>{r.segments}</td>
                <td>${r.costUsd.toFixed(2)}</td><td className="text-primary">${r.chargeUsd.toFixed(2)}</td><td>${r.profitUsd.toFixed(2)}</td>
                <td>{r.client.monthly_cap_usd != null ? <Badge variant="outline" className={r.chargeUsd >= r.client.monthly_cap_usd ? "border-destructive text-destructive" : ""}>${r.client.monthly_cap_usd}</Badge> : "—"}</td>
              </tr>)}
              {!report.length && <tr><td colSpan={8} className="py-3 text-muted-foreground">No clients yet.</td></tr>}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted-foreground">Report only. Nothing is charged automatically. Calls are billed by the second, and totals are rounded to the cent.</p>
        </CardContent>
      </Card>
    </div>
  );
}
