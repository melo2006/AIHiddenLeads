import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  Building2, BookOpen, Mic, Palette, Rocket, ChevronLeft, ChevronRight, Info, Sparkles, RefreshCw, Play, Plus, X,
  UploadCloud, Link2, FileText, Check, Phone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GeminiConversation from "@/components/GeminiConversation";
import AgentInstallationGuide from "@/components/AgentInstallationGuide";
import SitePreview from "./SitePreview";
import {
  EMPTY, INDUSTRIES, LABELS, STEPS, VOICES, faqKnowledge, nameFromUrl, renderGreeting, stepReady, type WizardState,
} from "./wizardModel";

const ICONS = [Building2, BookOpen, Mic, Palette, Rocket];
type Source = { id: string; label: string; kind: string; url?: string; status: string; last_error?: string; content?: string };
const FAQ_MARK = "--- Wizard FAQs ---";

async function request(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("voice-agents", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : error.message);
  }
  return data;
}

function Help({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="More help" className="inline-flex text-muted-foreground hover:text-primary"><Info className="h-4 w-4" /></button>
      </TooltipTrigger>
      <TooltipContent className="z-[130] max-w-xs text-xs">{children}</TooltipContent>
    </Tooltip>
  );
}

function StepHead({ title, hint, help }: { title: string; hint: string; help?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">{hint}{help && <Help>{help}</Help>}</p>
    </div>
  );
}

type Draft = Record<string, unknown> & { knowledge?: string; theme?: Record<string, string> };

export default function SetupWizard({ preview = false, agentId }: { preview?: boolean; agentId?: string }) {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<WizardState>(EMPTY);
  const [selectedId, setSelectedId] = useState(agentId);
  const [agents, setAgents] = useState<{ id: string; draft: Draft }[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [drag, setDrag] = useState(false);
  const [published, setPublished] = useState(false);
  const [calling, setCalling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<WizardState>) => setS((p) => ({ ...p, ...patch }));

  async function load(id = selectedId) {
    const data = await request({ action: "list" });
    setAgents(data.agents || []);
      const a = data.agents?.find((x: { id: string }) => x.id === id);
      if (!a) { setDraft(null); setSources([]); return; }
      setSources(a.voice_agent_sources || []);
      const d = a.draft as Draft;
      setDraft(d);
      const knowledge = String(d.knowledge || "");
      const faqText = knowledge.includes(FAQ_MARK) ? knowledge.split(FAQ_MARK)[1] : "";
      const faqs = faqText.split(/\n\n+/).map((b) => b.match(/^Q: (.*)\nA: ([\s\S]*)$/)).filter(Boolean).flatMap((m) => m ? [{ q: m[1], a: m[2] }] : []);
      setS({
        websiteUrl: String(d.websiteUrl || ""), businessName: String(d.businessName || ""), industry: String(d.industry || ""),
        links: (a.voice_agent_sources || []).filter((x: { kind: string }) => x.kind === "url").map((x: { url?: string; label: string }) => x.url || x.label),
        files: (a.voice_agent_sources || []).filter((x: { kind: string }) => x.kind === "document").map((x: { label: string }) => x.label),
        faqs, name: String(d.name || "Aspen"), greeting: String(d.greeting || EMPTY.greeting), voice: String(d.voice || "Kore"),
        color: d.theme?.primary || EMPTY.color, label: String(d.launcherLabel || "Ask Aspen"),
        corner: d.launcherCorner === "bottom-left" ? "bottom-left" : "bottom-right",
      });
      setPublished(Boolean(a.published));
  }
  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your assistant"));
  }, [selectedId]);

  async function save() {
    if (!selectedId || !draft) return false;
    const base = String(draft.knowledge || "").split(FAQ_MARK)[0].trimEnd();
    const faq = faqKnowledge(s.faqs);
    const config = {
      ...draft, websiteUrl: s.websiteUrl ? (/^https?:\/\//i.test(s.websiteUrl) ? s.websiteUrl : `https://${s.websiteUrl}`) : "", businessName: s.businessName || "My business", industry: s.industry, name: s.name || "Aspen",
      greeting: s.greeting, voice: s.voice, theme: { ...(draft.theme || {}), primary: s.color }, launcherLabel: s.label, launcherCorner: s.corner,
      knowledge: faq ? `${base}\n\n${FAQ_MARK}\n${faq}`.trim() : base,
    };
    try { await request({ action: "save", agentId: selectedId, config }); setDraft(config); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); return false; }
  }

  async function go(next: number) {
    setBusy(true);
    let ok = false;
    try {
      if (!selectedId && preview) {
        const data = await request({ action: "create", businessName: s.businessName });
        const id = data.agent?.id;
        if (!id) throw new Error("Could not create assistant");
        const config = { ...data.agent.draft, ...s, websiteUrl: s.websiteUrl ? (/^https?:\/\//i.test(s.websiteUrl) ? s.websiteUrl : `https://${s.websiteUrl}`) : "", theme: { primary: s.color, background: "#09090b", foreground: "#fafafa", font: "system" }, launcherLabel: s.label, launcherCorner: s.corner };
        await request({ action: "save", agentId: id, config });
        setSelectedId(id); setDraft(config); ok = true;
      } else ok = await save();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save assistant"); }
    setBusy(false);
    if (ok) { setStep(next); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }

  async function addLink() {
    const url = linkInput.trim();
    if (!url) return;
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    if (!selectedId) return;
    setBusy(true);
    try { if (!await save()) return; await learnSource({ kind: "url", label: full.slice(0,255), url: full }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not learn page"); }
    finally { setBusy(false); }
    setLinkInput("");
  }

  async function learnSource(body: Record<string, unknown>) {
    await request({ action: "source", agentId: selectedId, ...body });
    const data = await request({ action: "list" });
    const a = data.agents?.find((a: { id: string }) => a.id === selectedId);
    const source = a?.voice_agent_sources?.filter((x: Source) => x.label === body.label).at(-1);
    if (!source) throw new Error("Source was not saved");
    try { await request({ action: "refresh", agentId: selectedId, sourceId: source.id }); }
    finally { await load(); }
  }

  async function learnWebsite() {
    if (!s.websiteUrl || !selectedId) return;
    setBusy(true);
    try {
      if (!await save()) return;
      const full = /^https?:\/\//i.test(s.websiteUrl) ? s.websiteUrl : `https://${s.websiteUrl}`;
      const existing = sources.find(x => x.url === full);
      if (existing) { await request({ action: "refresh", agentId: selectedId, sourceId: existing.id }); await load(); }
      else await learnSource({ kind: "url", label: full.slice(0,255), url: full });
      toast.success("Website learned");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not learn website"); }
    finally { setBusy(false); }
  }

  async function addFiles(list: FileList | null) {
    for (const file of Array.from(list || [])) {
      if (!/\.(pdf|txt|md|csv)$/i.test(file.name)) { toast.error(`${file.name}: use PDF, text or CSV`); continue; }
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: maximum 10 MB`); continue; }
      if (selectedId) {
        setBusy(true);
        try {
        const path = `voice/${selectedId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("lead-uploads").upload(path, file);
        if (error) { toast.error(error.message); continue; }
        try { await learnSource({ kind: "document", label: file.name, storagePath: path }); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Could not add file"); continue; }
        } finally { setBusy(false); }
      }

    }
  }

  async function suggest() {
    setBusy(true);
    try {
      setVoiceReady(false);
      const data = await request({ action: "suggestGreeting", ...(selectedId ? { agentId: selectedId } : {}), businessName: s.businessName || undefined, industry: s.industry || undefined, url: s.websiteUrl || undefined });
      if (data?.greeting) set({ greeting: data.greeting });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not get a suggestion"); }
    finally { setBusy(false); }
  }

  async function prepareVoice(call = false) {
    setBusy(true);
    if (await save()) { if (call) setCalling(true); else setVoiceReady(true); }
    setBusy(false);
  }

  async function publish() {
    if (!selectedId) return;
    if (preview && !window.confirm("Publish this assistant for website visitors? This does not create or charge a customer subscription.")) return;
    setBusy(true);
    try { if (await save()) { await request({ action: "publish", agentId: selectedId }); setPublished(true); toast.success("Your assistant is live"); } }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not publish"); }
    finally { setBusy(false); }
  }

  const ready = stepReady(step, s);
  const realVoice = selectedId;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto w-full max-w-5xl space-y-5">
        {preview && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
            <strong className="text-primary">Assisted setup</strong>
            <span className="text-muted-foreground">Saved business drafts · real voice usage · no purchase required</span>
            <Select value={selectedId || "new"} onValueChange={(id) => { setDraft(null); setPublished(false); setSelectedId(id === "new" ? undefined : id); setStep(0); setVoiceReady(false); setCalling(false); if(id === "new") setS(EMPTY); }}>
              <SelectTrigger className="ml-auto h-8 w-full sm:w-64" aria-label="Choose business"><SelectValue placeholder="New business" /></SelectTrigger>
              <SelectContent className="z-[130]"><SelectItem value="new">New business</SelectItem>{agents.map(a => <SelectItem key={a.id} value={a.id}>{String(a.draft.businessName)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <ol className="flex items-center gap-1 sm:gap-2" aria-label="Setup progress">
          {STEPS.map((st, i) => {
            const Icon = ICONS[i];
            const done = i < step;
            return (
              <li key={st.id} className="flex flex-1 items-center gap-1 sm:gap-2">
                <button type="button" onClick={() => i < step && void go(i)} disabled={i > step} aria-current={i === step ? "step" : undefined}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition ${i === step ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
                  {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </button>
                <span className={`hidden text-xs lg:inline ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{st.title}</span>
                {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 rounded ${done ? "bg-primary" : "bg-border"}`} />}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted-foreground lg:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step].title}</p>

        <section className="min-h-[420px] rounded-2xl border border-border bg-card p-4 sm:p-6">
          {step === 0 && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <StepHead title="Tell us about your business" hint="Paste your website. We fill in the rest." help="We read your public pages so your assistant knows your services, hours and area. You can change anything later." />
                <label className="block space-y-1 text-sm font-medium">Website
                  <Input type="url" inputMode="url" placeholder="yourbusiness.com" value={s.websiteUrl}
                    onChange={(e) => set({ websiteUrl: e.target.value })}
                    onBlur={() => !s.businessName && s.websiteUrl && set({ businessName: nameFromUrl(s.websiteUrl) })} />
                </label>
                <label className="block space-y-1 text-sm font-medium">Business name
                  <Input placeholder="Apex Roofing" value={s.businessName} onChange={(e) => set({ businessName: e.target.value })} />
                </label>
                <label className="block space-y-1 text-sm font-medium">Industry
                  <Select value={s.industry} onValueChange={(v) => set({ industry: v })}>
                    <SelectTrigger aria-label="Industry"><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent className="z-[130]">{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              </div>
              <div className="hidden md:block"><SitePreview screenshot={typeof draft?.previewScreenshot === "string" ? draft.previewScreenshot : undefined} state={s} open={false} /></div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <StepHead title="Teach your assistant" hint="Add pages, files or quick answers. All optional." help="Your website is already included. Add price sheets, menus, service area pages or common questions to make answers more accurate." />
              <Button variant="outline" disabled={busy || !s.websiteUrl} onClick={() => void learnWebsite()}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Learning…" : "Learn website & capture preview"}</Button>
              {sources.length > 0 && <div className="divide-y divide-border">{sources.map(source => <div key={source.id} className="flex items-start gap-2 py-2 text-xs"><div className="min-w-0 flex-1"><p className="break-words font-medium">{source.label}</p><p className={source.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{source.status === "ready" ? `Learned · ${source.content?.length || 0} characters` : source.last_error || source.status}</p></div><Button size="icon" variant="ghost" disabled={busy} aria-label={`Retry ${source.label}`} onClick={async () => { setBusy(true); try { await request({ action: "refresh", agentId: selectedId, sourceId: source.id }); } catch(e) { toast.error(e instanceof Error ? e.message : "Learning failed"); } finally { await load(); setBusy(false); } }}><RefreshCw className="h-4 w-4" /></Button></div>)}</div>}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" /> Extra pages</p>
                  <div className="flex gap-2">
                    <Input aria-label="Page link" placeholder="yoursite.com/services" value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addLink()} />
                    <Button size="icon" variant="outline" aria-label="Add page" onClick={() => void addLink()}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{s.links.map((l) => <span key={l} className="max-w-full truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{l.replace(/^https?:\/\//, "")}</span>)}</div>
                </div>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
                  onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition ${drag ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"}`}>
                  <UploadCloud className="h-8 w-8 text-primary" />
                  <p className="text-sm font-semibold">Drop files here</p>
                  <p className="text-[11px] text-muted-foreground">PDF, text or CSV · up to 10 MB</p>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md,.csv" className="hidden" onChange={(e) => void addFiles(e.target.files)} />
                  <div className="flex flex-wrap justify-center gap-1.5">{s.files.map((f) => <span key={f} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"><FileText className="h-3 w-3" />{f}</span>)}</div>
                </div>
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-primary" /> Quick answers</p>
                  {s.faqs.map((f, i) => (
                    <div key={i} className="relative space-y-1 rounded-lg bg-muted/60 p-2">
                      <button type="button" aria-label="Remove answer" className="absolute right-1 top-1 text-muted-foreground" onClick={() => set({ faqs: s.faqs.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></button>
                      <Input aria-label="Question" className="h-8 text-xs" placeholder="Question" value={f.q} onChange={(e) => set({ faqs: s.faqs.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} />
                      <Input aria-label="Answer" className="h-8 text-xs" placeholder="Answer" value={f.a} onChange={(e) => set({ faqs: s.faqs.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} />
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => set({ faqs: [...s.faqs, { q: "", a: "" }] })}><Plus className="mr-1 h-4 w-4" />Add answer</Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <StepHead title="How should it say hello?" hint="Write a greeting or let AI suggest one." help="{timeGreeting} becomes Good morning/afternoon/evening. {agentName} and {businessName} are filled in automatically." />
                <label className="block space-y-1 text-sm font-medium">Assistant name
                  <Input value={s.name} onChange={(e) => set({ name: e.target.value })} />
                </label>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-medium">Greeting
                    <Button size="sm" variant="ghost" className="h-8 text-primary" disabled={busy} onClick={() => void suggest()}>
                      {busy ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}AI suggest
                    </Button>
                  </div>
                  <Textarea rows={3} aria-label="Greeting" value={s.greeting} onChange={(e) => { set({ greeting: e.target.value }); setVoiceReady(false); }} />
                  <p className="rounded-lg bg-muted p-2 text-xs italic text-muted-foreground">"{renderGreeting(s)}"</p>
                </div>
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">Pick a voice<Help>Each voice is the real Gemini voice your callers will hear.</Help></p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {VOICES.map((v) => (
                    <button key={v.id} type="button" onClick={() => { set({ voice: v.id }); setVoiceReady(false); }}
                      className={`rounded-xl border-2 p-3 text-left transition ${s.voice === v.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                      <Mic className={`mb-1 h-4 w-4 ${s.voice === v.id ? "text-primary" : "text-muted-foreground"}`} />
                      <p className="text-sm font-semibold">{v.label}</p>
                      <p className="text-[11px] text-muted-foreground">{v.vibe}</p>
                    </button>
                  ))}
                </div>
                {realVoice && (voiceReady ? <div className="rounded-lg border border-border p-2"><GeminiConversation key={`${selectedId}-${s.voice}-${s.greeting}`} previewOnly draft agentId={selectedId} name={s.name} previewVoice={s.voice} compact /></div> : <Button variant="outline" className="w-full" disabled={busy} onClick={() => void prepareVoice()}><Play className="mr-2 h-4 w-4" />Hear my greeting · {s.voice}</Button>)}

              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
              <div className="space-y-4">
                <StepHead title="How it looks on your site" hint="Pick a color, a label and a corner." />
                <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-medium">Button color
                  <Input aria-label="Button color" type="color" className="h-10 w-16 p-1" value={s.color} onChange={(e) => set({ color: e.target.value })} />
                </label>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Button label</p>
                  <div className="flex flex-wrap gap-2">{LABELS.map((l) => (
                    <button key={l} type="button" onClick={() => set({ label: l })} className={`rounded-full border px-3 py-1 text-xs ${s.label === l ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{l}</button>
                  ))}</div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Corner</p>
                  <div className="flex gap-2">{(["bottom-left", "bottom-right"] as const).map((c) => (
                    <button key={c} type="button" onClick={() => set({ corner: c })} className={`flex-1 rounded-lg border px-3 py-2 text-xs ${s.corner === c ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{c === "bottom-left" ? "Bottom left" : "Bottom right"}</button>
                  ))}</div>
                </div>
              </div>
              <SitePreview screenshot={typeof draft?.previewScreenshot === "string" ? draft.previewScreenshot : undefined} state={s} />
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <StepHead title={published ? "You're live!" : "Try it, then go live"} hint={published ? "Add it to your website with the steps below." : "Make a test call, then publish."} help="Test calls use your saved draft. Publishing makes it available to your website visitors." />
                {realVoice ? (
                  calling ? <div className="rounded-xl border border-border p-2"><GeminiConversation key={`call-${selectedId}`} draft agentId={selectedId} name={s.name} compact /></div>
                    : <Button size="lg" variant="outline" className="w-full" disabled={busy || sources.some(x => x.status !== "ready")} onClick={() => void prepareVoice(true)}><Phone className="mr-2 h-5 w-5" />Try a test call</Button>
                ) : null}
                <Button size="lg" className="w-full" disabled={busy || published || sources.some(x => x.status !== "ready")} onClick={() => void publish()}><Rocket className="mr-2 h-5 w-5" />{published ? "Published" : "Publish my assistant"}</Button>
                {published && <Button asChild variant="ghost" className="w-full"><Link to={preview ? "/dashboard" : "/account"}>Go to my dashboard</Link></Button>}
              </div>
              <SitePreview screenshot={typeof draft?.previewScreenshot === "string" ? draft.previewScreenshot : undefined} state={s} />
              {published && (selectedId
                ? <div className="md:col-span-2"><AgentInstallationGuide agentId={selectedId} /></div>
                : <p className="text-xs text-muted-foreground md:col-span-2">Customers see WordPress, Wix and HTML install steps with a copy button here.</p>)}
            </div>
          )}
        </section>

        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button variant="outline" size="lg" disabled={step === 0 || busy} onClick={() => void go(step - 1)}><ChevronLeft className="mr-1 h-5 w-5" />Back</Button>
          {step < STEPS.length - 1 && (
            <Button size="lg" disabled={!ready || busy || Boolean(selectedId && !draft)} onClick={() => void go(step + 1)}>Next<ChevronRight className="ml-1 h-5 w-5" /></Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
