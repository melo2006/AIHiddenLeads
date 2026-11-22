import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  Building2, BookOpen, Mic, Palette, Rocket, ChevronLeft, ChevronRight, ChevronDown, Info, Sparkles, RefreshCw, Play, Plus, X,
  UploadCloud, Link2, FileText, Check, Phone, UserRound, ListChecks, Globe, Table2, ShieldCheck, CalendarCheck, Trash2,
} from "lucide-react";
import AvatarSettings from "@/components/AvatarSettings";
import VoiceClonePanel from "@/components/VoiceClonePanel";
import { normalizeVideoAvatar } from "../../../supabase/functions/_shared/video-avatar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GeminiConversation from "@/components/GeminiConversation";
import AgentInstallationGuide from "@/components/AgentInstallationGuide";
import PhoneSetupPanel from "./PhoneSetupPanel";
import { EMPTY_PHONE_SETUP, type PhoneSetupState } from "../../../supabase/functions/_shared/onboarding";
import SitePreview from "./SitePreview";
import ShareDemoLink from "./ShareDemoLink";
import FieldToolbar from "./FieldToolbar";
import { rankAuditExamples } from "@/lib/rankAuditExamples";
import { avatarLibraryEntryByFaceId } from "@/lib/avatarLibrary";
import aspenFace from "@/assets/aspen_blonde_avatar.jpg";
import { GUARDRAILS_MARK, REVIEWED_KNOWLEDGE_MARK, SERVICE_AREA_MARK, replaceSection } from "../../../supabase/functions/_shared/wizard-knowledge";
import {
  EMPTY, INDUSTRIES, SPECIALTIES, industryName, LABELS, askLabel, isAskLabel, labelOptions, STEPS, faqKnowledge, nameFromUrl, renderGreeting, renderTemplate, sentenceAccepted, stepReady, toggleSentence,
  BUILT_IN_VARIABLES, GREETING_TEMPLATES, greetingStyles, customVariableNameValid, parseCsvColumns, compiledKnowledgeChars, KNOWLEDGE_CAP_CHARS, spliceText,
  withNicheKnowledge, withNichePlaybook, prefillNicheAnswers, nicheProgress,
  type WizardState, type CustomVariable, type LookupTableConfig,
} from "./wizardModel";
import { questionnaireForIndustry, hasNicheQuestionnaire, type NicheQuestionnaire } from "./nicheQuestionnaires";
import type { ChecklistItem } from "../../../supabase/functions/_shared/niche-suggestions";
import {
  EMPTY_SERVICE_AREA, OUT_OF_AREA_POLICIES, compileServiceArea, normalizeServiceArea, travelFeeTemplate, type ServiceAreaState,
} from "../../../supabase/functions/_shared/service-area";
import { EMPTY_VOICE_FILTERS, GEMINI_LIVE_VOICES, VOICE_LANGUAGE_SETS, filterVoices, liveVoiceById, type AgentLanguage, type VoiceFilters } from "@/lib/voiceCatalog";
import { VoiceFilterBar, VoiceMetaTags, VoicePreviewButton, VoicePreviewScope } from "@/components/VoicePicker";

const ICONS = [Building2, BookOpen, UserRound, ListChecks, Palette, Rocket];
type Source = { id: string; label: string; kind: string; url?: string; status: string; last_error?: string; content?: string };
type DiscoveredPage = { url: string; path: string; kind: string };
const FAQ_MARK = "--- Wizard FAQs ---";
/** Page kinds the picker ticks by default (Concept C §3): the pages a receptionist actually needs. */
const PICK_DEFAULT_KINDS = new Set(["home", "services", "about", "pricing", "faq", "contact"]);

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

/**
 * Quiet pointer to the phase-two integration consultation, shown at the
 * end of the Learn step: deeper integrations are scoped with our experts
 * later — the card is deliberately a secondary, ghost-button action so it
 * never competes with the wizard's Next button or reads as a roadblock.
 */
function IntegrationConsultCard() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" />{t("wizard.consult.title")}</p>
      <p className="text-xs text-muted-foreground">{t("wizard.consult.body")}</p>
      <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-primary">
        <Link to="/book"><CalendarCheck className="mr-1.5 h-4 w-4" />{t("wizard.consult.cta")}</Link>
      </Button>
    </div>
  );
}

/**
 * Niche questionnaire on the Learn step: collapsible section groups, one
 * input per question, answers live in WizardState.nicheAnswers. Factual
 * answers feed the knowledge; the closing behavior section feeds the
 * playbook in the system prompt.
 */
function NicheQuestionsSection({ questionnaire, answers, onAnswer }: { questionnaire: NicheQuestionnaire; answers: Record<string, string>; onAnswer: (id: string, value: string) => void }) {
  const [open, setOpen] = useState<string>(questionnaire.sections[0]?.title || "");
  useEffect(() => { setOpen(questionnaire.sections[0]?.title || ""); }, [questionnaire.key]);
  const { answered, total } = nicheProgress(questionnaire, answers);
  return (
    <div className="space-y-3 border-b border-border pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-primary" />Questions for your kind of business</p>
        <span className="text-xs font-medium text-muted-foreground">{answered} of {total} answered</span>
      </div>
      <p className="text-xs text-muted-foreground">These are the questions a good receptionist for a {questionnaire.name.toLowerCase()} needs answered. Anything you already told us is filled in — just check it and fill the gaps. Your answers become part of what your assistant knows, and the last group shapes how it behaves on calls.</p>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={total} aria-label="Questionnaire progress">
        <div className="h-full bg-primary transition-all" style={{ width: `${total ? Math.round((answered / total) * 100) : 0}%` }} />
      </div>
      {questionnaire.sections.map((section) => {
        const sectionAnswered = section.questions.filter((q) => (answers[q.id] || "").trim()).length;
        const expanded = open === section.title;
        return (
          <div key={section.title} className="rounded-xl border border-border">
            <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? "" : section.title)}>
              <span className="text-sm font-medium">{section.title}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">{sectionAnswered}/{section.questions.length}<ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} /></span>
            </button>
            {expanded && (
              <div className="space-y-3 px-3 pb-3">
                {section.questions.map((q) => (
                  <label key={q.id} className="block space-y-1 text-sm font-medium">{q.label}
                    {q.kind === "longtext" || q.kind === "behavior"
                      ? <Textarea aria-label={q.label} rows={3} maxLength={4000} value={answers[q.id] || ""} onChange={(e) => onAnswer(q.id, e.target.value)} />
                      : <Input aria-label={q.label} maxLength={4000} placeholder={q.kind === "choice" ? "Yes or no — plus any detail that matters" : undefined} value={answers[q.id] || ""} onChange={(e) => onAnswer(q.id, e.target.value)} />}
                    {q.help && <span className="block text-[11px] font-normal text-muted-foreground">{q.help}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Checkable suggestion cards: ticking inserts the item's plain sentence into the owner's editable text; unticking removes exactly that sentence. */
function ChecklistCards({ items, text, onToggle }: { items: ChecklistItem[]; text: string; onToggle: (item: ChecklistItem, on: boolean) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => {
        const on = sentenceAccepted(text, item.sentence);
        return (
          <button key={item.id} type="button" role="checkbox" aria-checked={on} aria-label={item.label} onClick={() => onToggle(item, !on)}
            className={`flex min-w-[180px] max-w-[250px] shrink-0 items-start gap-2 rounded-xl border-2 p-3 text-left transition ${on ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}>{on && <Check className="h-3 w-3" />}</span>
            <span><span className="block text-sm font-medium">{item.label}</span><span className="block text-[11px] text-muted-foreground">{item.sentence}</span></span>
          </button>
        );
      })}
    </div>
  );
}

/** "Suggest more" state for one suggestion checklist: extra rounds fetched, a fetch in flight, or a round that came back with nothing new. */
type MoreState = { rounds: number; busy: boolean; exhausted: boolean };
const EMPTY_MORE: MoreState = { rounds: 0, busy: false, exhausted: false };
const MAX_MORE_ROUNDS = 3;

/**
 * The row under a suggestion checklist: "Suggest more" appends another
 * batch of fresh candidates. After MAX_MORE_ROUNDS extra rounds — or a
 * round that returns nothing new — the button retires into a quiet line
 * pointing at the owner's own free-text box.
 */
function SuggestMoreRow({ more, onMore, labels }: { more: MoreState; onMore: () => void; labels: { more: string; busy: string; exhausted: string; own: string } }) {
  if (more.exhausted) return <p className="text-xs text-muted-foreground">{labels.exhausted}</p>;
  if (more.rounds >= MAX_MORE_ROUNDS) return <p className="text-xs text-muted-foreground">{labels.own}</p>;
  return (
    <Button size="sm" variant="ghost" className="h-8 text-primary" disabled={more.busy} onClick={onMore}>
      {more.busy ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}{more.busy ? labels.busy : labels.more}
    </Button>
  );
}

type Draft = Record<string, unknown> & { knowledge?: string; theme?: Record<string, string> };

export default function SetupWizard({ preview = false, ownerPreview = false, agentId }: { preview?: boolean; ownerPreview?: boolean; agentId?: string }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [s, setS] = useState<WizardState>(EMPTY);
  const [selectedId, setSelectedId] = useState(agentId);
  const [agents, setAgents] = useState<{ id: string; draft: Draft }[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceFilters, setVoiceFilters] = useState<VoiceFilters>(EMPTY_VOICE_FILTERS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [drag, setDrag] = useState(false);
  const [published, setPublished] = useState(false);
  const [phoneSetup, setPhoneSetup] = useState<PhoneSetupState>(EMPTY_PHONE_SETUP);
  const [accountEmail, setAccountEmail] = useState("");
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setAccountEmail(data.user?.email || "")).catch(() => {}); }, []);
  const [calling, setCalling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suggestedIndustry, setSuggestedIndustry] = useState("");
  const [knowledgeProposal, setKnowledgeProposal] = useState("");
  const [knowledgeMode, setKnowledgeMode] = useState<'website' | 'generic'>('website');
  const [serviceItems, setServiceItems] = useState<ChecklistItem[] | null>(null);
  const [guardrailItems, setGuardrailItems] = useState<ChecklistItem[] | null>(null);
  const [serviceMore, setServiceMore] = useState<MoreState>(EMPTY_MORE);
  const [guardrailMore, setGuardrailMore] = useState<MoreState>(EMPTY_MORE);
  const [areaSuggestions, setAreaSuggestions] = useState<string[]>([]);
  const [placeInput, setPlaceInput] = useState("");
  const [zipInput, setZipInput] = useState("");
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [serviceStep, setServiceStep] = useState(0);
  // Concept C: page picker, lookup-table drafts, custom-variable form, phone preview strip.
  const [discovered, setDiscovered] = useState<DiscoveredPage[] | null>(null);
  const [pickedPages, setPickedPages] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [csvColumns, setCsvColumns] = useState<Record<string, string[]>>({});
  const [lookupDraft, setLookupDraft] = useState<{ label: string; keyColumn: string; speakable: string[] } | null>(null);
  const [varForm, setVarForm] = useState({ name: "", label: "", source: "call" as CustomVariable["source"], example: "" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const loadGeneration = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<AudioContext>();
  const progressRef = useRef<HTMLOListElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const guidanceRef = useRef<HTMLTextAreaElement>(null);
  const restrictionsRef = useRef<HTMLTextAreaElement>(null);
  const greetingRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const progress = progressRef.current;
    const active = progress?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!progress || !active) return;
    const bounds = progress.getBoundingClientRect();
    const current = active.getBoundingClientRect();
    if (current.right > bounds.right) progress.scrollLeft += current.right - bounds.right + 2;
    else if (current.left < bounds.left) progress.scrollLeft -= bounds.left - current.left + 2;
  }, [step]);
  useEffect(() => { setSuggestedIndustry(''); setKnowledgeProposal(''); setServiceItems(null); setGuardrailItems(null); setServiceMore(EMPTY_MORE); setGuardrailMore(EMPTY_MORE); setAreaSuggestions([]); setDiscovered(null); setPickedPages([]); setLookupDraft(null); }, [selectedId]);
  /** Prefill niche answers the wizard already knows (name, website, address) — never overwriting an owner's own answer. */
  const prefillKey = `${s.businessName}|${s.websiteUrl}|${s.serviceArea?.baseAddress || ""}`;
  useEffect(() => {
    const pre = prefillNicheAnswers(s);
    setS((p) => {
      const merged = { ...(p.nicheAnswers || {}) };
      let changed = false;
      for (const [id, value] of Object.entries(pre)) if (value && !merged[id]?.trim()) { merged[id] = value; changed = true; }
      return changed ? { ...p, nicheAnswers: merged } : p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey]);
  const set = (patch: Partial<WizardState>) => setS((p) => ({ ...p, ...patch }));
  /** Picking a voice also pairs it with a default language (Live voices are language-agnostic). */
  const pickVoice = (id: string, language: AgentLanguage) => { set({ voice: id, defaultLanguage: language, clonedVoiceSelected: false }); setVoiceReady(false); };

  async function load(id = selectedId) {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
    const data = await request({ action: "list" });
    if (generation !== loadGeneration.current) return;
    setAgents(data.agents || []);
    setServices(data.services || {});
      const a = data.agents?.find((x: { id: string }) => x.id === id);
      if (!a) { setDraft(null); setSources([]); return; }
      setSources(a.voice_agent_sources || []);
      const d = a.draft as Draft;
      setDraft(d);
      const knowledge = String(d.knowledge || "");
      const faqText = knowledge.includes(FAQ_MARK) ? knowledge.split(FAQ_MARK)[1] : "";
      const faqs = faqText.split(/\n\n+/).map((b) => b.match(/^Q: (.*)\nA: ([\s\S]*)$/)).filter(Boolean).flatMap((m) => m ? [{ q: m[1], a: m[2] }] : []);
      setS({
        websiteUrl: String(d.websiteUrl || ""), businessName: String(d.businessName || ""), industry: INDUSTRIES.includes(String(d.industry || "")) ? String(d.industry || "") : d.industry ? "Other" : "",
        customIndustry: INDUSTRIES.includes(String(d.industry || "")) ? "" : String(d.industry || ""), subNiche: String(d.subNiche || ""), businessNotes: String(d.businessNotes || ""), knowledgeGuidance: String(d.knowledgeGuidance || ""), assistantRestrictions: String(d.assistantRestrictions || ""),
        serviceArea: normalizeServiceArea(d.serviceArea), serviceAreaText: typeof d.serviceAreaText === "string" ? d.serviceAreaText : (knowledge.split(FAQ_MARK)[0].split(SERVICE_AREA_MARK)[1] || "").trim(),
        links: (a.voice_agent_sources || []).filter((x: { kind: string }) => x.kind === "url").map((x: { url?: string; label: string }) => x.url || x.label),
        files: (a.voice_agent_sources || []).filter((x: { kind: string }) => x.kind === "document").map((x: { label: string }) => x.label),
        faqs, name: String(d.name || "Aspen"), greeting: String(d.greeting || EMPTY.greeting), voice: String(d.voice || "Kore"), defaultLanguage: (["es", "pt-BR", "fr-CA"].includes(String(d.defaultLanguage)) ? String(d.defaultLanguage) : "en") as AgentLanguage, clonedVoiceSelected: Boolean(d.clonedVoiceSelected), elevenLabsLiveVoice: Boolean(d.elevenLabsLiveVoice),
        color: d.theme?.primary || EMPTY.color, label: (() => { const l = String(d.launcherLabel || ""); return !l || isAskLabel(l) ? askLabel(String(d.name || "Aspen")) : l; })(),
        corner: d.launcherCorner === "bottom-left" ? "bottom-left" : "bottom-right", videoAvatar: normalizeVideoAvatar(d.videoAvatar),
        notificationEmail: String(d.notificationEmail || ""),
        crawlDepth: d.crawlDepth === 2 ? 2 : 1,
        customVariables: Array.isArray(d.customVariables) ? (d.customVariables as CustomVariable[]) : [],
        lookupTables: Array.isArray(d.lookupTables) ? (d.lookupTables as LookupTableConfig[]) : [],
        nicheAnswers: (d.nicheAnswers && typeof d.nicheAnswers === "object" && !Array.isArray(d.nicheAnswers)) ? (d.nicheAnswers as Record<string, string>) : {},
        nicheIndustry: String(d.nicheIndustry || ""),
      });
      setPublished(Boolean(a.published));
      setPhoneSetup((d.phoneSetup as PhoneSetupState) || EMPTY_PHONE_SETUP);
    } finally { if (generation === loadGeneration.current) setLoading(false); }
  }
  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your assistant"));
  }, [selectedId]);

  async function save() {
    if (!selectedId || !draft) return false;
    const reviewed = replaceSection(String(draft.knowledge || "").split(FAQ_MARK)[0], REVIEWED_KNOWLEDGE_MARK, s.knowledgeGuidance || "");
    const withArea = replaceSection(reviewed, SERVICE_AREA_MARK, s.serviceAreaText || "");
    const base = withNicheKnowledge(withArea, s.nicheAnswers, industryName(s));
    const faq = faqKnowledge(s.faqs);
    const config = {
      ...draft, websiteUrl: s.websiteUrl ? (/^https?:\/\//i.test(s.websiteUrl) ? s.websiteUrl : `https://${s.websiteUrl}`) : "", businessName: s.businessName || "My business", industry: industryName(s), subNiche: s.subNiche || "", businessNotes: s.businessNotes || "", knowledgeGuidance: s.knowledgeGuidance || "", assistantRestrictions: s.assistantRestrictions || "", serviceArea: s.serviceArea, serviceAreaText: s.serviceAreaText || "", nicheAnswers: s.nicheAnswers || {}, nicheIndustry: industryName(s), systemPrompt: withNichePlaybook(replaceSection(String(draft.systemPrompt || ""), GUARDRAILS_MARK, s.assistantRestrictions || ""), s.nicheAnswers, industryName(s)), name: s.name || "Aspen",
      greeting: s.greeting, voice: s.voice, defaultLanguage: s.defaultLanguage || "en", clonedVoiceSelected: Boolean(s.clonedVoiceSelected), elevenLabsLiveVoice: Boolean(s.elevenLabsLiveVoice), phoneSetup, notificationEmail: s.notificationEmail?.trim() || undefined, theme: { background: "#101216", foreground: "#F4F6F8", font: "system", ...(draft.theme || {}), primary: s.color }, launcherLabel: s.label, launcherCorner: s.corner, videoAvatar: normalizeVideoAvatar(s.videoAvatar),
      crawlDepth: s.crawlDepth === 2 ? 2 : 1, customVariables: s.customVariables || [], lookupTables: s.lookupTables || [],
      knowledge: faq ? `${base}\n\n${FAQ_MARK}\n${faq}`.trim() : base,
    };
    try { await request({ action: "save", agentId: selectedId, config }); setDraft(config); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); return false; }
  }

  async function go(next: number) {
    if (loading) return;
    setBusy(true);
    let ok = false;
    try {
      if (!selectedId && preview) {
        const businessName = s.businessName.trim() || nameFromUrl(s.websiteUrl);
        const data = await request({ action: "create", businessName });
        const id = data.agent?.id;
        if (!id) throw new Error("Could not create assistant");
        const config = { ...data.agent.draft, ...s, industry: industryName(s), nicheIndustry: industryName(s), businessName, websiteUrl: s.websiteUrl ? (/^https?:\/\//i.test(s.websiteUrl) ? s.websiteUrl : `https://${s.websiteUrl}`) : "", knowledge: withNicheKnowledge(replaceSection(String(data.agent.draft.knowledge || "").split(FAQ_MARK)[0], SERVICE_AREA_MARK, s.serviceAreaText || ""), s.nicheAnswers, industryName(s)), systemPrompt: withNichePlaybook(String(data.agent.draft.systemPrompt || ""), s.nicheAnswers, industryName(s)), theme: { primary: s.color, background: "#09090b", foreground: "#fafafa", font: "system" }, launcherLabel: s.label, launcherCorner: s.corner };
        await request({ action: "save", agentId: id, config });
        setSelectedId(id); setDraft(config); ok = true;
      } else ok = await save();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save assistant"); }
    setBusy(false);
    if (ok) { setStep(next); setMaxStep((m) => Math.max(m, next)); window.scrollTo({ top: 0, behavior: "smooth" }); }
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

  /** Page picker (Concept C §3): discover the site's pages, owner ticks, only ticked pages are learned. */
  async function discoverPages() {
    if (!s.websiteUrl || !selectedId) return;
    setDiscovering(true);
    try {
      if (!await save()) return;
      const full = /^https?:\/\//i.test(s.websiteUrl) ? s.websiteUrl : `https://${s.websiteUrl}`;
      const data = await request({ action: "discoverPages", agentId: selectedId, url: full });
      const pages = Array.isArray(data?.pages) ? data.pages as DiscoveredPage[] : [];
      setDiscovered(pages);
      setPickedPages(pages.filter((p) => PICK_DEFAULT_KINDS.has(p.kind)).map((p) => p.url));
      if (!pages.length) toast.error(t("wizard.learn.noPagesFound"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("wizard.learn.noPagesFound")); }
    finally { setDiscovering(false); }
  }

  async function learnPickedPages() {
    if (!selectedId || !pickedPages.length) return;
    const known = new Set(sources.filter((x) => x.kind === "url").map((x) => x.url));
    const fresh = pickedPages.filter((u) => !known.has(u));
    if (!fresh.length) { toast.success(t("wizard.learn.pagesAlreadyKnown")); return; }
    if (sources.length + fresh.length > 12) { toast.error(t("wizard.learn.sourceCap")); return; }
    setBusy(true);
    try {
      if (!await save()) return;
      for (const url of fresh) await learnSource({ kind: "url", label: url.slice(0, 255), url });
      toast.success(t("wizard.learn.pagesLearned"));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not learn pages"); }
    finally { setBusy(false); }
  }

  async function addFiles(list: FileList | null) {
    for (const file of Array.from(list || [])) {
      if (!/\.(pdf|txt|md|csv)$/i.test(file.name)) { toast.error(`${file.name}: use PDF, text or CSV`); continue; }
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: maximum 10 MB`); continue; }
      if (/\.csv$/i.test(file.name)) {
        try { const text = await file.text(); setCsvColumns((prev) => ({ ...prev, [file.name]: parseCsvColumns(text) })); } catch { /* columns can still come from the learned source */ }
      }
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
      const data = await request({ action: "suggestGreeting", ...(selectedId ? { agentId: selectedId } : {}), businessName: s.businessName || undefined, industry: [industryName(s), s.subNiche].filter(Boolean).join(' · ').slice(0,80) || undefined, url: s.websiteUrl || undefined });
      if (data?.greeting) set({ greeting: data.greeting });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not get a suggestion"); }
    finally { setBusy(false); }
  }

  /** Field-toolbar rewrite (warmer/shorter) for one field's current text. */
  async function rewriteField(text: string, mode: "warmer" | "shorter") {
    const data = await request({ action: "rewriteText", agentId: selectedId, text, rewriteMode: mode });
    if (typeof data?.text !== "string" || !data.text) throw new Error("No rewrite returned");
    return data.text as string;
  }

  async function assist(action: 'suggestKnowledge' | 'suggestIndustry') {
    setBusy(true);
    try {
      const data = await request({ action, agentId: selectedId, businessName: s.businessName || nameFromUrl(s.websiteUrl) || undefined, industry: industryName(s) || undefined, subNiche: s.subNiche || undefined, businessNotes: s.businessNotes || undefined, mode: knowledgeMode });
      if (action === 'suggestIndustry') setSuggestedIndustry(data.suggestion);
      else setKnowledgeProposal(data.suggestion);
    } catch(e) { toast.error(e instanceof Error ? e.message : 'Could not generate suggestions'); }
    finally { setBusy(false); }
  }

  async function suggestChecklist(action: 'suggestServices' | 'suggestGuardrails') {
    setBusy(true);
    // A fresh list restarts the "Suggest more" rounds for that list.
    if (action === 'suggestServices') setServiceMore(EMPTY_MORE); else setGuardrailMore(EMPTY_MORE);
    try {
      const data = await request({ action, agentId: selectedId, businessName: s.businessName || nameFromUrl(s.websiteUrl) || undefined, industry: industryName(s) || undefined, subNiche: s.subNiche || undefined, businessNotes: s.businessNotes || undefined, mode: knowledgeMode });
      const items = Array.isArray(data?.items) ? data.items as ChecklistItem[] : [];
      if (action === 'suggestServices') setServiceItems(items); else setGuardrailItems(items);
      if (!items.length) toast.error('No suggestions came back — typing your own works as always.');
    } catch { toast.error('Suggestions are not available right now — typing your own works as always.'); if (action === 'suggestServices') setServiceItems([]); else setGuardrailItems([]); }
    finally { setBusy(false); }
  }

  /**
   * "Suggest more": ask for another batch, sending everything already
   * shown as exclusions, and APPEND only genuinely new cards — shown
   * cards (ticked or not) are never duplicated or removed. A round with
   * nothing new retires the button into the honest end state; the row
   * also retires after MAX_MORE_ROUNDS rounds (see SuggestMoreRow).
   */
  async function suggestMore(action: 'suggestServices' | 'suggestGuardrails') {
    const items = action === 'suggestServices' ? serviceItems : guardrailItems;
    const more = action === 'suggestServices' ? serviceMore : guardrailMore;
    const setMore = action === 'suggestServices' ? setServiceMore : setGuardrailMore;
    if (!items?.length || more.busy || more.exhausted || more.rounds >= MAX_MORE_ROUNDS) return;
    setMore({ ...more, busy: true });
    try {
      const data = await request({ action, agentId: selectedId, businessName: s.businessName || nameFromUrl(s.websiteUrl) || undefined, industry: industryName(s) || undefined, subNiche: s.subNiche || undefined, businessNotes: s.businessNotes || undefined, mode: knowledgeMode, excludeIds: items.map((i) => i.id), excludeLabels: items.map((i) => i.label), round: more.rounds + 1 });
      const incoming = Array.isArray(data?.items) ? data.items as ChecklistItem[] : [];
      const shown = new Set(items.map((i) => i.id));
      const shownLabels = new Set(items.map((i) => i.label.trim().toLowerCase()));
      const fresh = incoming.filter((i) => {
        if (shown.has(i.id) || shownLabels.has(i.label.trim().toLowerCase())) return false;
        shown.add(i.id); shownLabels.add(i.label.trim().toLowerCase());
        return true;
      });
      if (!fresh.length) { setMore({ ...more, busy: false, exhausted: true }); return; }
      if (action === 'suggestServices') setServiceItems([...items, ...fresh]); else setGuardrailItems([...items, ...fresh]);
      setMore({ rounds: more.rounds + 1, busy: false, exhausted: false });
    } catch { toast.error('Suggestions are not available right now — typing your own works as always.'); setMore({ ...more, busy: false }); }
  }

  async function suggestAreas() {
    setBusy(true);
    try {
      const data = await request({ action: 'suggestServiceArea', agentId: selectedId, businessName: s.businessName || nameFromUrl(s.websiteUrl) || undefined, industry: industryName(s) || undefined, subNiche: s.subNiche || undefined, businessNotes: s.businessNotes || undefined, url: s.websiteUrl || undefined, mode: knowledgeMode });
      const areas = Array.isArray(data?.areas) ? data.areas as string[] : [];
      setAreaSuggestions(areas);
      if (!areas.length) toast.error('No service areas found in your website or notes yet — add yours below.');
    } catch { toast.error('Area suggestions are not available right now — add yours below.'); }
    finally { setBusy(false); }
  }

  const area = s.serviceArea || EMPTY_SERVICE_AREA;
  /** Any structured service-area change recompiles the visible coverage text. */
  function setArea(patch: Partial<ServiceAreaState>) {
    const next = { ...area, ...patch };
    if (patch.travelFeeEnabled && !next.travelFeeText.trim()) next.travelFeeText = travelFeeTemplate(next.radiusMiles);
    set({ serviceArea: next, serviceAreaText: compileServiceArea(next) });
  }
  function addPlace(raw: string) {
    const v = raw.trim(); if (!v) return;
    if (!area.places.some((p) => p.toLowerCase() === v.toLowerCase())) setArea({ places: [...area.places, v] });
    setPlaceInput("");
  }
  function addZip(raw: string) {
    const v = raw.trim(); if (!v) return;
    if (!/^\d{5}$/.test(v)) { toast.error('Enter a 5-digit ZIP code'); return; }
    if (!area.zips.includes(v)) setArea({ zips: [...area.zips, v] });
    setZipInput("");
  }

  async function prepareVoice(call = false) {
    setBusy(true);
    try {
      if (!call) { const ctx = new AudioContext(); previewAudioRef.current = ctx; await ctx.resume(); }
      if (await save()) { if (call) setCalling(true); else setVoiceReady(true); }
      else { await previewAudioRef.current?.close(); previewAudioRef.current = undefined; }
    } catch(e) { toast.error(e instanceof Error ? e.message : 'Could not prepare voice'); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!selectedId) return;
    if (preview && !window.confirm("Publish this assistant for website visitors? This does not create or charge a customer subscription.")) return;
    setBusy(true);
    try { if (await save()) { await request({ action: "publish", agentId: selectedId }); setPublished(true); toast.success("Your assistant is live");
      // Phone step v2: publishing also activates a picked new number.
      // The server action is idempotent — an already-live number is
      // returned as-is, never bought twice.
      if (phoneSetup.route === "new" && phoneSetup.selectedNumber && !phoneSetup.aspenNumber) {
        try { const act = await request({ action: "provisionNumber", agentId: selectedId }); if (act.phoneSetup) setPhoneSetup(act.phoneSetup as PhoneSetupState); } catch { /* activation continues server-side; status copy stays honest */ }
      } } }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not publish"); }
    finally { setBusy(false); }
  }

  const ready = stepReady(step, s);
  const realVoice = selectedId;
  const customVars = s.customVariables || [];
  const allVariables = [
    ...BUILT_IN_VARIABLES.map((v) => ({ token: v.token, label: t(`wizard.variables.${v.token}`) })),
    ...customVars.map((v) => ({ token: v.name, label: v.label })),
  ];
  const sourcesChars = sources.filter((x) => x.status === "ready").reduce((sum, x) => sum + (x.content?.length || 0), 0);
  const knowledgeChars = compiledKnowledgeChars({ guidance: s.knowledgeGuidance, serviceAreaText: s.serviceAreaText, faqs: s.faqs, sourcesChars });
  const knowledgePct = Math.min(100, Math.round((knowledgeChars / KNOWLEDGE_CAP_CHARS) * 100));
  const learnedSummary = [
    sources.filter((x) => x.status === "ready").length ? t("wizard.learn.summarySources", { count: sources.filter((x) => x.status === "ready").length }) : "",
    s.knowledgeGuidance ? t("wizard.learn.summaryGuidance") : "",
    s.faqs.filter((f) => f.q.trim() && f.a.trim()).length ? t("wizard.learn.summaryFaqs", { count: s.faqs.filter((f) => f.q.trim() && f.a.trim()).length }) : "",
  ].filter(Boolean).join(" ") || t("wizard.learn.summaryEmpty");
  const faceImage = avatarLibraryEntryByFaceId(s.videoAvatar?.faceId || "")?.image || aspenFace;
  const pieces = [
    { label: t("wizard.pieces.business"), done: Boolean(s.businessName.trim() || s.websiteUrl) },
    { label: t("wizard.pieces.learn"), done: sources.some((x) => x.status === "ready") || Boolean(s.knowledgeGuidance?.trim()) },
    { label: t("wizard.pieces.face"), done: maxStep > 2 },
    { label: t("wizard.pieces.review"), done: maxStep > 3 },
    { label: t("wizard.pieces.look"), done: maxStep > 4 },
    { label: t("wizard.pieces.launch"), done: published },
  ];

  /** Insert a {token} into a field at its caret (catalog panel + chips share this). */
  function insertToken(ref: React.RefObject<HTMLTextAreaElement | null>, value: string, apply: (next: string) => void, token: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const insert = `{${token}}`;
    apply(spliceText(value, start, end, insert));
    requestAnimationFrame(() => { if (!el) return; el.focus(); try { el.setSelectionRange(start + insert.length, start + insert.length); } catch { /* detached */ } });
  }

  function addCustomVariable() {
    const name = varForm.name.trim();
    if (!customVariableNameValid(name)) { toast.error(t("wizard.variables.nameInvalid")); return; }
    if (customVars.some((v) => v.name === name)) { toast.error(t("wizard.variables.nameTaken")); return; }
    if (!varForm.label.trim()) { toast.error(t("wizard.variables.labelRequired")); return; }
    set({ customVariables: [...customVars, { id: crypto.randomUUID(), name, label: varForm.label.trim(), source: varForm.source, example: varForm.example.trim() }] });
    setVarForm({ name: "", label: "", source: "call", example: "" });
  }

  /** Columns for a CSV the owner uploaded: from the file itself, or from its learned source content. */
  function columnsFor(label: string): string[] {
    if (csvColumns[label]?.length) return csvColumns[label];
    const source = sources.find((x) => x.label === label && x.kind === "document");
    return source?.content ? parseCsvColumns(source.content) : [];
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto w-full max-w-7xl space-y-5">
        {preview && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
            {ownerPreview ? (
              <>
                <strong className="text-primary">{t("wizard.ownerPreview.title")}</strong>
                <span className="text-muted-foreground">{t("wizard.ownerPreview.note")}</span>
              </>
            ) : (
              <>
                <strong className="text-primary">Assisted setup</strong>
                <span className="text-muted-foreground">Saved business drafts · real voice usage · no purchase required</span>
              </>
            )}
            <Select disabled={busy || loading} value={selectedId || "new"} onValueChange={(id) => { void (async () => { setBusy(true); try { if (selectedId && !await save()) return; setDraft(null); setPublished(false); setSelectedId(id === "new" ? undefined : id); setStep(0); setMaxStep(0); setVoiceReady(false); setCalling(false); if(id === "new") setS(EMPTY); } finally { setBusy(false); } })(); }}>
              <SelectTrigger className="ml-auto h-8 w-full sm:w-64" aria-label="Choose business"><SelectValue placeholder="New business" /></SelectTrigger>
              <SelectContent className="z-[130]"><SelectItem value="new">New business</SelectItem>{agents.map(a => <SelectItem key={a.id} value={a.id}>{String(a.draft.businessName)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <div className="items-start gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_370px]">
          <div className="min-w-0 space-y-5">
            <ol ref={progressRef} className="flex items-center gap-2 overflow-x-auto pb-2" aria-label="Setup progress">
              {STEPS.map((st, i) => {
                const done = i < step;
                const StepIcon = ICONS[i];
                return (
                  <li key={st.id} className="flex shrink-0 items-center gap-2">
                    <Button variant={i === step ? 'default' : 'outline'} onClick={() => i < step && void go(i)} disabled={i > step || busy || loading} aria-current={i === step ? "step" : undefined} className="gap-2 whitespace-nowrap">
                      <StepIcon className="h-5 w-5" /><span className="text-sm">{t(`wizard.steps.${st.id}`)}</span>{done && <Check className="h-4 w-4" />}
                    </Button>
                    {i < STEPS.length - 1 && <span className={`h-0.5 w-4 rounded sm:w-6 ${done ? "bg-primary" : "bg-border"}`} />}
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground lg:hidden">Step {step + 1} of {STEPS.length} · {t(`wizard.steps.${STEPS[step].id}`)}</p>

            {/* Phone preview strip (Concept C §1): face + the chat button as it looks right now; full preview one tap away. */}
            <div className="sticky top-2 z-20 rounded-2xl border border-border bg-card/95 p-2 shadow-sm backdrop-blur lg:hidden">
              <div className="flex items-center gap-2">
                <img src={faceImage} alt="" className="h-9 w-9 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{s.name || "Aspen"}</p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">{s.businessName || t("wizard.strip.yourBusiness")}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[11px] font-semibold shadow" style={{ background: s.color, color: "#fff" }}>
                  <img src={faceImage} alt="" className="h-6 w-6 rounded-full border-2 border-white/70 object-cover" />{s.label}
                </span>
                <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 gap-1 px-2 text-xs" aria-expanded={previewOpen} onClick={() => setPreviewOpen((o) => !o)}>
                  {t("wizard.strip.preview")}<ChevronDown className={`h-4 w-4 transition ${previewOpen ? "rotate-180" : ""}`} />
                </Button>
              </div>
              {previewOpen && <div className="mt-2"><SitePreview screenshot={typeof draft?.previewScreenshot === "string" ? draft.previewScreenshot : undefined} state={s} /></div>}
            </div>

            <section className="min-h-[420px] rounded-2xl border border-border bg-card p-4 sm:p-6">
              {step === 0 && (
                <div className="space-y-4">
                  <StepHead title="Tell us about your business" hint="Start with your name, industry and specialty." help="A website is optional. You can add your own business details or review general industry guidance in the next step." />
                  {(preview ? !selectedId : !draft?.websiteUrl && !draft?.businessName) && <div className="space-y-2">
                    <Select disabled={loading || busy} onValueChange={(id) => {
                      const example = rankAuditExamples.find(e => e.id === id);
                      if (example) set({ websiteUrl: example.website, businessName: example.name, industry: example.industry });
                    }}>
                      <SelectTrigger aria-label="Choose a B2B example"><SelectValue placeholder="Choose a B2B example" /></SelectTrigger>
                      <SelectContent className="z-[130]">{rankAuditExamples.map(e => <SelectItem key={e.id} value={e.id}>{e.category} · {e.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Public business examples—not customers or endorsements.</p>
                  </div>}
                  <label className="block space-y-1 text-sm font-medium">Website (optional)
                    <Input type="url" inputMode="url" placeholder="yourbusiness.com" value={s.websiteUrl}
                      disabled={loading} onChange={(e) => set({ websiteUrl: e.target.value })} />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">Business name
                    <Input disabled={loading} placeholder={nameFromUrl(s.websiteUrl) || "Your commercial business"} value={s.businessName} onChange={(e) => set({ businessName: e.target.value })} />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">Industry
                    <Select value={s.industry} onValueChange={(v) => set({ industry: v, subNiche: '' })}>
                      <SelectTrigger aria-label="Industry"><SelectValue placeholder="Choose one" /></SelectTrigger>
                      <SelectContent className="z-[130]">{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                    </Select>
                  </label>
                  {s.industry === 'Other' && <label className="block space-y-1 text-sm font-medium">Your industry<Input aria-label="Your industry" maxLength={80} value={s.customIndustry || ''} placeholder="e.g. Laboratory equipment supplier" onChange={e => set({ customIndustry: e.target.value })} /></label>}
                  <label className="block space-y-1 text-sm font-medium">Specialty / sub-niche (optional)<Input aria-label="Specialty / sub-niche" maxLength={160} value={s.subNiche || ''} placeholder="e.g. Commercial refrigeration" onChange={e => set({ subNiche: e.target.value })} /></label>
                  <div className="flex flex-wrap gap-1">{(SPECIALTIES[s.industry] || []).map(v => <Button key={v} size="sm" variant="outline" className="h-auto whitespace-normal py-1 text-xs" onClick={() => set({ subNiche: v })}>{v}</Button>)}</div>
                  <div className="space-y-1">
                    <label className="block space-y-1 text-sm font-medium">What do you offer? (optional)
                      <Textarea ref={notesRef} aria-label="Business details" rows={3} maxLength={6000} value={s.businessNotes || ''} placeholder="Services, customers, service area and what makes your business different" onChange={e => set({ businessNotes: e.target.value })} />
                    </label>
                    <FieldToolbar textareaRef={notesRef} value={s.businessNotes || ''} onChange={(next) => set({ businessNotes: next })} voice={s.voice} variables={allVariables}
                      onRewrite={(mode) => rewriteField(s.businessNotes || '', mode)} disabled={busy || loading} />
                  </div>
                  <Button variant="outline" disabled={busy || loading || !(s.businessNotes || s.businessName || selectedId)} onClick={() => void assist('suggestIndustry')}><Sparkles className="mr-2 h-4 w-4" />{busy ? 'Thinking…' : 'Suggest industry & specialties'}</Button>
                  {suggestedIndustry && <div role="status" className="whitespace-pre-wrap border-l-2 border-primary pl-3 text-sm">{suggestedIndustry}<p className="mt-2 text-xs text-muted-foreground">Review these suggestions, then enter your preferred industry and specialty above.</p></div>}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <StepHead title={t("wizard.learn.title")} hint={t("wizard.learn.hint")} help={t("wizard.learn.help")} />
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-primary" />{t("wizard.learn.websiteTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("wizard.learn.websiteHint")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={busy || !s.websiteUrl || !selectedId} onClick={() => void learnWebsite()}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Learning…" : "Learn website & capture preview"}</Button>
                      <Button variant="outline" disabled={discovering || busy || !s.websiteUrl || !selectedId} onClick={() => void discoverPages()}><Globe className={`mr-2 h-4 w-4 ${discovering ? "animate-pulse" : ""}`} />{discovering ? t("wizard.learn.findingPages") : t("wizard.learn.findPages")}</Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{t("wizard.learn.depthLabel")}</span>
                      {([1, 2] as const).map((d) => (
                        <Button key={d} size="sm" variant={s.crawlDepth === d ? 'default' : 'outline'} onClick={() => set({ crawlDepth: d })}>{d === 1 ? t("wizard.learn.depthKey") : t("wizard.learn.depthDeep")}</Button>
                      ))}
                    </div>
                    {discovered && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{t("wizard.learn.pagesFound", { count: discovered.length })}</p>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPickedPages(discovered.map((p) => p.url))}>{t("wizard.learn.pickAll")}</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPickedPages([])}>{t("wizard.learn.pickNone")}</Button>
                        </div>
                        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                          {discovered.map((p) => {
                            const on = pickedPages.includes(p.url);
                            const already = sources.some((x) => x.kind === "url" && x.url === p.url);
                            return (
                              <label key={p.url} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${on ? "border-primary bg-primary/10" : "border-border"}`}>
                                <input type="checkbox" checked={on} disabled={already} onChange={(e) => setPickedPages(e.target.checked ? [...pickedPages, p.url] : pickedPages.filter((u) => u !== p.url))} />
                                <span className="min-w-0 flex-1 truncate font-medium">{p.path || "/"}</span>
                                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t(`wizard.learn.kind.${p.kind}`)}</span>
                                {already && <span className="shrink-0 text-[10px] font-medium text-primary">{t("wizard.learn.alreadyLearned")}</span>}
                              </label>
                            );
                          })}
                        </div>
                        <Button disabled={busy || !pickedPages.length} onClick={() => void learnPickedPages()}><Check className="mr-2 h-4 w-4" />{t("wizard.learn.learnPicked", { count: pickedPages.length })}</Button>
                        <p className="text-[11px] text-muted-foreground">{t("wizard.learn.pickerNote")}</p>
                      </div>
                    )}
                  </div>

                  {sources.length > 0 && <div className="divide-y divide-border rounded-xl border border-border px-3">{sources.map(source => <div key={source.id} className="flex items-start gap-2 py-2 text-xs"><div className="min-w-0 flex-1"><p className="break-words font-medium">{source.label}</p><p className={source.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{source.status === "ready" ? `Learned · ${source.content?.length || 0} characters` : source.last_error || source.status}</p></div><Button size="icon" variant="ghost" disabled={busy} aria-label={`Retry ${source.label}`} onClick={async () => { setBusy(true); try { await request({ action: "refresh", agentId: selectedId, sourceId: source.id }); } catch(e) { toast.error(e instanceof Error ? e.message : "Learning failed"); } finally { await load(); setBusy(false); } }}><RefreshCw className="h-4 w-4" /></Button></div>)}</div>}

                  <div className="space-y-1.5 rounded-xl border border-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">{t("wizard.learn.capacityTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("wizard.learn.capacityValue", { used: knowledgeChars.toLocaleString(), cap: KNOWLEDGE_CAP_CHARS.toLocaleString() })}</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={knowledgePct} aria-valuemin={0} aria-valuemax={100} aria-label={t("wizard.learn.capacityTitle")}>
                      <div className={`h-full rounded-full transition-all ${knowledgePct >= 90 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(2, knowledgePct)}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t("wizard.learn.capacityHint")}</p>
                  </div>

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

                  {s.files.filter((f) => /\.csv$/i.test(f)).length > 0 && (
                    <div className="space-y-3 rounded-xl border border-border p-3">
                      <p className="flex items-center gap-2 text-sm font-semibold"><Table2 className="h-4 w-4 text-primary" />{t("wizard.lookup.title")}</p>
                      <p className="text-xs text-muted-foreground">{t("wizard.lookup.hint")}</p>
                      {s.files.filter((f) => /\.csv$/i.test(f)).map((label) => {
                        const config = (s.lookupTables || []).find((l) => l.label === label);
                        const columns = columnsFor(label);
                        const editing = lookupDraft?.label === label;
                        return (
                          <div key={label} className="space-y-2 rounded-lg bg-muted/50 p-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="min-w-0 flex-1 truncate text-xs font-medium">{label}</p>
                              {config && !editing && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t("wizard.lookup.keyIs", { column: config.keyColumn })}</span>}
                              {!editing && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLookupDraft({ label, keyColumn: config?.keyColumn || columns[0] || "", speakable: config?.speakableColumns || [] })}>{config ? t("wizard.lookup.edit") : t("wizard.lookup.useAsTable")}</Button>}
                              {config && !editing && <Button size="sm" variant="ghost" className="h-7 text-xs" aria-label={t("wizard.lookup.remove")} onClick={() => set({ lookupTables: (s.lookupTables || []).filter((l) => l.label !== label) })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                            </div>
                            {editing && (columns.length ? (
                              <div className="space-y-2">
                                <label className="block space-y-1 text-xs font-medium">{t("wizard.lookup.keyColumn")}
                                  <Select value={lookupDraft.keyColumn} onValueChange={(v) => setLookupDraft({ ...lookupDraft, keyColumn: v })}>
                                    <SelectTrigger aria-label={t("wizard.lookup.keyColumn")} className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-[130]">{columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                  </Select>
                                </label>
                                <p className="text-xs font-medium">{t("wizard.lookup.speakable")}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {columns.map((c) => {
                                    const on = lookupDraft.speakable.includes(c);
                                    return <button key={c} type="button" aria-pressed={on} onClick={() => setLookupDraft({ ...lookupDraft, speakable: on ? lookupDraft.speakable.filter((x) => x !== c) : [...lookupDraft.speakable, c] })} className={`rounded-full border px-2.5 py-1 text-[11px] ${on ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{c}</button>;
                                  })}
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" disabled={!lookupDraft.keyColumn} onClick={() => { const entry: LookupTableConfig = { id: config?.id || crypto.randomUUID(), label, keyColumn: lookupDraft.keyColumn, speakableColumns: lookupDraft.speakable }; set({ lookupTables: [...(s.lookupTables || []).filter((l) => l.label !== label), entry] }); setLookupDraft(null); }}><Check className="mr-1 h-4 w-4" />{t("wizard.lookup.save")}</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setLookupDraft(null)}>{t("wizard.lookup.cancel")}</Button>
                                </div>
                              </div>
                            ) : <p className="text-xs text-muted-foreground">{t("wizard.lookup.noColumns")}</p>)}
                          </div>
                        );
                      })}
                      <p className="text-[11px] text-muted-foreground">{t("wizard.lookup.phaseNote")}</p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block space-y-1 text-sm font-medium">{t("wizard.learn.notesTitle")}
                      <Textarea ref={notesRef} aria-label="Knowledge inputs" rows={3} maxLength={6000} placeholder="Add services, policies or questions the assistant should know" value={s.businessNotes || ''} onChange={e => set({ businessNotes: e.target.value })} />
                    </label>
                    <FieldToolbar textareaRef={notesRef} value={s.businessNotes || ''} onChange={(next) => set({ businessNotes: next })} voice={s.voice} variables={allVariables} summaryText={learnedSummary}
                      onRewrite={(mode) => rewriteField(s.businessNotes || '', mode)} disabled={busy || loading} />
                  </div>

                  {hasNicheQuestionnaire(industryName(s)) && (
                    <NicheQuestionsSection questionnaire={questionnaireForIndustry(industryName(s))} answers={s.nicheAnswers || {}}
                      onAnswer={(id, value) => set({ nicheAnswers: { ...(s.nicheAnswers || {}), [id]: value }, nicheIndustry: industryName(s) })} />
                  )}

                  <IntegrationConsultCard />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <StepHead title={t("wizard.face.title")} hint={t("wizard.face.hint")} help={t("wizard.face.help")} />
                  <label className="block max-w-sm space-y-1 text-sm font-medium">Assistant name
                    <Input value={s.name} onChange={(e) => set(isAskLabel(s.label) ? { name: e.target.value, label: askLabel(e.target.value) } : { name: e.target.value })} />
                  </label>
                  <AvatarSettings value={normalizeVideoAvatar(s.videoAvatar)} onChange={(videoAvatar) => set({ videoAvatar })} agentId={selectedId} beforePreview={save} voice={s.voice} onVoiceChange={voice => { set({ voice, clonedVoiceSelected: false }); setVoiceReady(false); }} name={s.name} onNameChange={(next) => set(isAskLabel(s.label) ? { name: next, label: askLabel(next) } : { name: next })} clonedVoiceSelected={Boolean(s.clonedVoiceSelected)} onClonedVoiceSelectedChange={(cloned) => { set({ clonedVoiceSelected: cloned }); if (cloned) setVoiceReady(false); }} elevenLabsLiveVoice={Boolean(s.elevenLabsLiveVoice)} onElevenLabsLiveVoiceChange={(enabled) => set({ elevenLabsLiveVoice: enabled })} />
                  <div className="space-y-3">
                  <VoicePreviewScope>
                    <p className="flex items-center gap-1.5 text-sm font-semibold">Pick a voice<Help>Each voice is the real voice your callers will hear. The same voice can speak English, Spanish or Portuguese — the language sets below simply pair the voice with that default language. Tap the play button on a card to hear that voice first.</Help></p>
                    <VoiceFilterBar filters={voiceFilters} onChange={setVoiceFilters} />
                    <p className="text-xs font-medium text-muted-foreground">English</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {filterVoices(GEMINI_LIVE_VOICES, voiceFilters).map((v) => { const active = s.voice === v.id && (s.defaultLanguage || "en") === "en" && !s.clonedVoiceSelected; return (
                        <div key={v.id} className="relative">
                          <button type="button" onClick={() => pickVoice(v.id, "en")}
                            className={`w-full rounded-xl border-2 p-3 pr-9 text-left transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                            <Mic className={`mb-1 h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                            <p className="text-sm font-semibold">{v.id}</p>
                            <p className="text-[11px] text-muted-foreground">{v.style} · {v.gender}</p>
                            <VoiceMetaTags voice={v} />
                          </button>
                          <VoicePreviewButton voiceId={v.id} />
                        </div> ); })}
                    </div>
                    {VOICE_LANGUAGE_SETS.map((setDef) => (
                      <div key={setDef.language} className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{setDef.label} <span className="font-normal">· {setDef.note}</span></p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {[...setDef.female, ...setDef.male].map((id) => { const v = liveVoiceById(id); if (!v) return null; const active = s.voice === id && s.defaultLanguage === setDef.language && !s.clonedVoiceSelected; return (
                            <div key={id} className="relative">
                              <button type="button" onClick={() => pickVoice(id, setDef.language)}
                                className={`w-full rounded-xl border-2 p-3 pr-9 text-left transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                                <Mic className={`mb-1 h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                                <p className="text-sm font-semibold">{v.id}</p>
                                <p className="text-[11px] text-muted-foreground">{v.style} · {v.gender}</p>
                                <VoiceMetaTags voice={v} />
                              </button>
                              <VoicePreviewButton voiceId={id} />
                            </div> ); })}
                        </div>
                      </div>
                    ))}
                  </VoicePreviewScope>
                  </div>
                  <VoiceClonePanel agentId={selectedId} selected={Boolean(s.clonedVoiceSelected)} onSelectChange={(cloned) => { set({ clonedVoiceSelected: cloned }); if (cloned) setVoiceReady(false); }} liveVoiceEnabled={Boolean(s.elevenLabsLiveVoice)} onLiveVoiceChange={(enabled) => set({ elevenLabsLiveVoice: enabled })} />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <StepHead title={t("wizard.review.title")} hint={t("wizard.review.hint")} help={t("wizard.review.help")} />
                  <div className="space-y-3 border-b border-border pb-5">
                    <p className="text-sm font-semibold">{t("wizard.review.greetingTitle")}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {greetingStyles().map((style) => (
                        <div key={style.id} className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${s.greeting === style.text ? "border-primary bg-primary/10" : "border-border"}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`wizard.review.style.${style.id}`)}</p>
                          <p className="flex-1 text-sm italic">"{renderTemplate(style.text, s)}"</p>
                          <div className="flex flex-wrap gap-1">{[...style.text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m, i) => <span key={i} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">{`{${m[1]}}`}</span>)}</div>
                          <Button size="sm" variant={s.greeting === style.text ? "default" : "outline"} onClick={() => { set({ greeting: style.text }); setVoiceReady(false); }}>{t("wizard.review.useStyle")}</Button>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm font-medium">Greeting
                        <Button size="sm" variant="ghost" className="h-8 text-primary" disabled={busy} onClick={() => void suggest()}>
                          {busy ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}AI suggest
                        </Button>
                      </div>
                      <Textarea ref={greetingRef} rows={3} aria-label="Greeting" value={s.greeting} onChange={(e) => { set({ greeting: e.target.value }); setVoiceReady(false); }} />
                      <FieldToolbar textareaRef={greetingRef} value={s.greeting} onChange={(next) => { set({ greeting: next }); setVoiceReady(false); }} voice={s.voice} variables={allVariables}
                        onSuggest={() => void suggest()} onRewrite={(mode) => rewriteField(s.greeting, mode)} disabled={busy} />
                      <p className="rounded-lg bg-muted p-2 text-xs italic text-muted-foreground">"{renderGreeting(s)}"</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{t("wizard.review.templateLibrary")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {GREETING_TEMPLATES.map((tpl) => (
                          <button key={tpl.id} type="button" onClick={() => { set({ greeting: tpl.text }); setVoiceReady(false); }} className="rounded-full border border-border px-3 py-1 text-xs transition hover:border-primary/60">{t(`wizard.review.template.${tpl.id}`)}</button>
                        ))}
                      </div>
                    </div>
                    {hasNicheQuestionnaire(industryName(s)) && (!s.greeting.trim() || s.greeting === EMPTY.greeting) && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2">
                        <p className="flex-1 text-xs text-muted-foreground">Suggested for a {questionnaireForIndustry(industryName(s)).name.toLowerCase()}: “{renderTemplate(questionnaireForIndustry(industryName(s)).persona.greetingPattern, s)}”</p>
                        <Button size="sm" variant="outline" onClick={() => { set({ greeting: questionnaireForIndustry(industryName(s)).persona.greetingPattern }); setVoiceReady(false); }}>Use suggested greeting</Button>
                      </div>
                    )}
                    {realVoice && (voiceReady ? <div className="rounded-lg border border-border p-2"><GeminiConversation key={`${selectedId}-${s.voice}-${s.greeting}`} previewOnly autoStart previewAudioContext={previewAudioRef.current} draft agentId={selectedId} name={s.name} previewVoice={s.voice} compact /></div> : <Button variant="outline" className="w-full" disabled={busy} onClick={() => void prepareVoice()}>{busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}{busy ? 'Saving & preparing voice…' : `Hear my greeting · ${s.voice}`}</Button>)}
                  </div>

                  <div className="space-y-3 border-b border-border pb-5">
                    <p className="text-sm font-semibold">{t("wizard.variables.title")}</p>
                    <p className="text-xs text-muted-foreground">{t("wizard.variables.hint")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {BUILT_IN_VARIABLES.map((v) => (
                        <button key={v.token} type="button" title={v.hint} onClick={() => insertToken(greetingRef, s.greeting, (next) => set({ greeting: next }), v.token)}
                          className="rounded-full border border-border px-2.5 py-1 text-[11px] transition hover:border-primary/60">
                          <span className="font-semibold">{`{${v.token}}`}</span> <span className="text-muted-foreground">· {t(`wizard.variables.${v.token}`)}</span>
                        </button>
                      ))}
                    </div>
                    {customVars.length > 0 && <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{t("wizard.variables.yours")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {customVars.map((v) => (
                          <span key={v.id} className="flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px]">
                            <button type="button" className="font-semibold" onClick={() => insertToken(greetingRef, s.greeting, (next) => set({ greeting: next }), v.name)}>{`{${v.name}}`}</button>
                            <span className="text-muted-foreground">{v.label}</span>
                            <button type="button" aria-label={`${t("wizard.variables.remove")} ${v.label}`} className="text-muted-foreground hover:text-destructive" onClick={() => set({ customVariables: customVars.filter((x) => x.id !== v.id) })}><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                    </div>}
                    <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
                      <label className="block space-y-1 text-xs font-medium">{t("wizard.variables.nameLabel")}
                        <Input aria-label={t("wizard.variables.nameLabel")} placeholder="ticketNumber" value={varForm.name} onChange={(e) => setVarForm({ ...varForm, name: e.target.value.replace(/\s+/g, "") })} />
                      </label>
                      <label className="block space-y-1 text-xs font-medium">{t("wizard.variables.labelLabel")}
                        <Input aria-label={t("wizard.variables.labelLabel")} placeholder={t("wizard.variables.labelPlaceholder")} value={varForm.label} onChange={(e) => setVarForm({ ...varForm, label: e.target.value })} />
                      </label>
                      <label className="block space-y-1 text-xs font-medium">{t("wizard.variables.sourceLabel")}
                        <Select value={varForm.source} onValueChange={(v) => setVarForm({ ...varForm, source: v as CustomVariable["source"] })}>
                          <SelectTrigger aria-label={t("wizard.variables.sourceLabel")}><SelectValue /></SelectTrigger>
                          <SelectContent className="z-[130]">
                            <SelectItem value="call">{t("wizard.variables.source.call")}</SelectItem>
                            <SelectItem value="caller-id">{t("wizard.variables.source.callerId")}</SelectItem>
                            <SelectItem value="chat">{t("wizard.variables.source.chat")}</SelectItem>
                            <SelectItem value="lookup">{t("wizard.variables.source.lookup")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="block space-y-1 text-xs font-medium">{t("wizard.variables.exampleLabel")}
                        <Input aria-label={t("wizard.variables.exampleLabel")} placeholder="4821" value={varForm.example} onChange={(e) => setVarForm({ ...varForm, example: e.target.value })} />
                      </label>
                      <Button size="sm" variant="outline" className="sm:col-span-2" onClick={addCustomVariable}><Plus className="mr-1 h-4 w-4" />{t("wizard.variables.add")}</Button>
                    </div>
                  </div>

                  <div className="space-y-3 border-b border-border pb-5">
                    <p className="text-sm font-semibold">Industry knowledge · {industryName(s) || 'General'}{s.subNiche ? ` / ${s.subNiche}` : ''}</p>
                    <div className="flex flex-wrap gap-2">{(['website','generic'] as const).map(mode => <Button key={mode} size="sm" variant={knowledgeMode === mode ? 'default' : 'outline'} onClick={() => setKnowledgeMode(mode)}>{mode === 'website' ? 'Use learned website & files' : 'General industry guidance'}</Button>)}</div>
                    <Button variant="outline" disabled={busy || !selectedId} onClick={() => void assist('suggestKnowledge')}><Sparkles className={`mr-2 h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />{busy ? 'Preparing your draft…' : knowledgeProposal || s.knowledgeGuidance ? 'Regenerate knowledge draft' : 'Generate knowledge draft'}</Button>
                    {knowledgeProposal && <div className="space-y-2"><p className="text-xs text-muted-foreground">Not yet used by your assistant. Review business facts and remove anything unconfirmed.</p><Textarea aria-label="Knowledge draft for review" rows={12} maxLength={12000} value={knowledgeProposal} onChange={e => setKnowledgeProposal(e.target.value)} /><div className="flex gap-2"><Button disabled={busy} onClick={() => { set({ knowledgeGuidance: knowledgeProposal }); setKnowledgeProposal(''); toast.success('Accepted. Saved when you continue.'); }}><Check className="mr-2 h-4 w-4" />Accept reviewed draft</Button><Button variant="ghost" onClick={() => setKnowledgeProposal('')}>Discard</Button></div></div>}
                    {s.knowledgeGuidance && <div className="space-y-1"><label className="block space-y-1 text-sm font-medium">Accepted guidance<Textarea ref={guidanceRef} aria-label="Accepted guidance" rows={8} maxLength={12000} value={s.knowledgeGuidance} onChange={e => set({ knowledgeGuidance: e.target.value })} /></label>
                      <FieldToolbar textareaRef={guidanceRef} value={s.knowledgeGuidance} onChange={(next) => set({ knowledgeGuidance: next })} voice={s.voice} variables={allVariables}
                        onSuggest={() => void assist('suggestKnowledge')} onRewrite={(mode) => rewriteField(s.knowledgeGuidance || '', mode)} disabled={busy} /></div>}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">Services you offer</p>
                        <Button size="sm" variant="outline" disabled={busy || !selectedId} onClick={() => void suggestChecklist('suggestServices')}><Sparkles className={`mr-2 h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />{serviceItems ? 'Re-run suggestions' : 'Suggest for me'}</Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Short on time? Let us suggest services a typical {industryName(s) || 'business like yours'} offers. Tick the ones you actually offer — each ticked service is added as a sentence to your guidance text above, where you can edit it. Nothing is added until you tick it.</p>
                      {serviceItems && (serviceItems.length
                        ? <><p className="text-xs font-medium">Do you also offer any of these?</p><ChecklistCards items={serviceItems} text={s.knowledgeGuidance || ''} onToggle={(item, on) => set({ knowledgeGuidance: toggleSentence(s.knowledgeGuidance || '', item.sentence, on) })} /><SuggestMoreRow more={serviceMore} onMore={() => void suggestMore('suggestServices')} labels={{ more: t('wizard.suggestMore'), busy: t('wizard.suggestingMore'), exhausted: t('wizard.suggestExhausted'), own: t('wizard.suggestOwnBelow') }} /></>
                        : <p className="text-xs text-muted-foreground">Suggestions are not available right now — typing your services above works as always.</p>)}
                    </div>
                    <div className="space-y-1">
                      <label className="block space-y-1 text-sm font-medium">Assistant restrictions (optional)<Textarea ref={restrictionsRef} aria-label="Assistant restrictions" rows={3} maxLength={4000} placeholder="e.g. Do not quote prices. Do not give technical safety advice. Ask the team when unsure." value={s.assistantRestrictions || ''} onChange={e => set({ assistantRestrictions: e.target.value })} /></label>
                      <FieldToolbar textareaRef={restrictionsRef} value={s.assistantRestrictions || ''} onChange={(next) => set({ assistantRestrictions: next })} voice={s.voice} variables={allVariables}
                        onSuggest={() => void suggestChecklist('suggestGuardrails')} onSuggestMore={guardrailItems?.length ? () => void suggestMore('suggestGuardrails') : undefined} onRewrite={(mode) => rewriteField(s.assistantRestrictions || '', mode)} disabled={busy} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">Guardrails</p>
                        <Button size="sm" variant="outline" disabled={busy || !selectedId} onClick={() => void suggestChecklist('suggestGuardrails')}><Sparkles className={`mr-2 h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />{guardrailItems ? 'Re-run suggestions' : 'Suggest guardrails'}</Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Typical "never do this" rules for a {industryName(s) || 'business like yours'}. Tick the ones you want — each ticked rule is added to your restrictions above, where you can edit it.</p>
                      {guardrailItems && (guardrailItems.length
                        ? <><ChecklistCards items={guardrailItems} text={s.assistantRestrictions || ''} onToggle={(item, on) => set({ assistantRestrictions: toggleSentence(s.assistantRestrictions || '', item.sentence, on) })} /><SuggestMoreRow more={guardrailMore} onMore={() => void suggestMore('suggestGuardrails')} labels={{ more: t('wizard.suggestMore'), busy: t('wizard.suggestingMore'), exhausted: t('wizard.suggestExhausted'), own: t('wizard.suggestOwnBelow') }} /></>
                        : <p className="text-xs text-muted-foreground">Suggestions are not available right now — typing your restrictions above works as always.</p>)}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Service area</p>
                    <p className="text-xs text-muted-foreground">Tell your assistant where you work, so it can answer "do you cover my area?" — and what to do when a caller is outside it. Pick one way to describe your coverage.</p>
                    <div className="flex flex-wrap gap-2">
                      {([['places', 'Cities & counties'], ['radius', 'Radius from our address'], ['zips', 'ZIP codes']] as const).map(([mode, label]) => (
                        <Button key={mode} size="sm" variant={area.mode === mode ? 'default' : 'outline'} onClick={() => setArea({ mode })}>{label}</Button>
                      ))}
                    </div>
                    {area.mode === 'places' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input aria-label="Add a city or county" placeholder="e.g. Fort Lauderdale or Broward County" value={placeInput} onChange={(e) => setPlaceInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlace(placeInput)} />
                          <Button variant="outline" aria-label="Add area" onClick={() => addPlace(placeInput)}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">{area.places.map((p) => <span key={p} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{p}<button type="button" aria-label={`Remove ${p}`} onClick={() => setArea({ places: area.places.filter((x) => x !== p) })}><X className="h-3 w-3" /></button></span>)}</div>
                        <Button size="sm" variant="outline" disabled={busy || !selectedId} onClick={() => void suggestAreas()}><Sparkles className={`mr-2 h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />Suggest areas from my website & notes</Button>
                        {areaSuggestions.length > 0 && <div className="space-y-1"><p className="text-xs text-muted-foreground">Found in your website or notes — tap to add:</p><div className="flex flex-wrap gap-1.5">{areaSuggestions.filter((a) => !area.places.some((p) => p.toLowerCase() === a.toLowerCase())).map((a) => <button key={a} type="button" className="rounded-full border border-dashed border-primary/60 px-2 py-0.5 text-[11px] text-primary" onClick={() => setArea({ places: [...area.places, a] })}>+ {a}</button>)}</div></div>}
                      </div>
                    )}
                    {area.mode === 'radius' && (
                      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                        <label className="block space-y-1 text-sm font-medium">Business address<Input aria-label="Business address" placeholder="Street, city, state" value={area.baseAddress} onChange={(e) => setArea({ baseAddress: e.target.value })} /></label>
                        <label className="block space-y-1 text-sm font-medium">Radius (miles)<Input aria-label="Radius in miles" type="number" min={1} max={500} placeholder="25" value={area.radiusMiles ?? ''} onChange={(e) => setArea({ radiusMiles: e.target.value ? Number(e.target.value) : null })} /></label>
                      </div>
                    )}
                    {area.mode === 'zips' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input aria-label="Add a ZIP code" inputMode="numeric" placeholder="e.g. 33301" value={zipInput} onChange={(e) => setZipInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addZip(zipInput)} />
                          <Button variant="outline" aria-label="Add ZIP code" onClick={() => addZip(zipInput)}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">{area.zips.map((z) => <span key={z} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{z}<button type="button" aria-label={`Remove ${z}`} onClick={() => setArea({ zips: area.zips.filter((x) => x !== z) })}><X className="h-3 w-3" /></button></span>)}</div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">When a caller is outside your area</p>
                      {OUT_OF_AREA_POLICIES.map((p) => (
                        <label key={p.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border-2 p-3 transition ${area.outOfAreaPolicy === p.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                          <input type="radio" name="out-of-area-policy" className="mt-1" checked={area.outOfAreaPolicy === p.id} onChange={() => setArea({ outOfAreaPolicy: p.id })} />
                          <span><span className="block text-sm font-medium">{p.label}{p.id === 'callback' && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Recommended</span>}</span><span className="block text-[11px] text-muted-foreground">{p.hint}</span></span>
                        </label>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={area.travelFeeEnabled} onChange={(e) => setArea({ travelFeeEnabled: e.target.checked })} /> Travel fee for far-away jobs</label>
                      {area.travelFeeEnabled && <Textarea aria-label="Travel fee sentence" rows={2} maxLength={300} value={area.travelFeeText} onChange={(e) => setArea({ travelFeeText: e.target.value })} />}
                    </div>
                    <label className="block space-y-1 text-sm font-medium">Coverage text in your assistant's knowledge
                      <Textarea aria-label="Coverage text" rows={3} maxLength={2000} value={s.serviceAreaText || ''} onChange={(e) => set({ serviceAreaText: e.target.value })} />
                      <span className="block text-[11px] font-normal text-muted-foreground">This is exactly what your assistant learns about your coverage. Edit it any time — changing a choice above rewrites it from your choices.</span>
                    </label>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <StepHead title="How it looks on your site" hint="Pick a color, a label and a corner." />
                  <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-medium">Button color
                    <Input aria-label="Button color" type="color" className="h-10 w-16 p-1" value={s.color} onChange={(e) => set({ color: e.target.value })} />
                  </label>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Button label</p>
                    <div className="flex flex-wrap gap-2">{labelOptions(s.name).map((l) => (
                      <button key={l} type="button" onClick={() => set({ label: l })} className={`rounded-full border px-3 py-1 text-xs ${s.label === l ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{l}</button>
                    ))}</div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Corner</p>
                    <div className="flex gap-2">{(["bottom-left", "bottom-right"] as const).map((c) => (
                      <button key={c} type="button" onClick={() => set({ corner: c })} className={`flex-1 rounded-lg border px-3 py-2 text-xs ${s.corner === c ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{c === "bottom-left" ? "Bottom left" : "Bottom right"}</button>
                    ))}</div>
                  </div>
                  <p className="text-xs text-muted-foreground lg:hidden">{t("wizard.look.phoneHint")}</p>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <StepHead title={published ? "You're live!" : "Try it, then go live"} hint={published ? "Add it to your website with the steps below." : "Make a test call, then publish."} help="Test calls use your saved draft. Publishing makes it available to your website visitors." />
                  <PhoneSetupPanel agentId={selectedId} value={phoneSetup} onSaved={setPhoneSetup} businessName={s.businessName} />
                  <div className="space-y-2 rounded-2xl border border-border p-4">
                    <h3 className="text-base font-bold">Booking notifications</h3>
                    <p className="text-sm text-muted-foreground">New bookings and appointment confirmations are emailed here. Leave blank to use your account email{accountEmail ? <> (<strong>{accountEmail}</strong>)</> : null}.</p>
                    <label className="block space-y-1 text-sm font-medium">Notification email
                      <Input type="email" placeholder={accountEmail || "you@yourbusiness.com"} value={s.notificationEmail || ""} onChange={(e) => set({ notificationEmail: e.target.value })} />
                    </label>
                    <p className="text-[11px] text-muted-foreground">Saved when you publish — change it any time.</p>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-border p-4">
                    <h3 className="flex items-center gap-2 text-base font-bold"><ShieldCheck className="h-5 w-5 text-primary" />{t("wizard.knownCaller.title")}</h3>
                    <p className="text-sm text-muted-foreground">{t("wizard.knownCaller.body")}</p>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-border p-4">
                    <h3 className="text-base font-bold">{t("wizard.integrations.title")}</h3>
                    <p className="text-sm text-muted-foreground">{t("wizard.integrations.body")}</p>
                    <Button asChild variant="outline"><Link to="/book"><CalendarCheck className="mr-2 h-4 w-4" />{t("wizard.integrations.cta")}</Link></Button>
                  </div>
                  {realVoice ? (
                    calling ? <div className="rounded-xl border border-border p-2"><GeminiConversation key={`call-${selectedId}`} draft agentId={selectedId} name={s.name} previewVoice={s.voice} compact videoAvatar={normalizeVideoAvatar(s.videoAvatar)} /></div>
                      : <Button size="lg" variant="outline" className="w-full" disabled={busy || sources.some(x => x.status !== "ready")} onClick={() => void prepareVoice(true)}><Phone className="mr-2 h-5 w-5" />Try a test call</Button>
                  ) : null}
                  <Button size="lg" className="w-full" disabled={busy || published || sources.some(x => x.status !== "ready")} onClick={() => void publish()}><Rocket className="mr-2 h-5 w-5" />{published ? "Published" : "Publish my assistant"}</Button>
                  {preview && selectedId && <ShareDemoLink agentId={selectedId} beforeShare={save} />}
                  {published && <Button asChild variant="ghost" className="w-full"><Link to={preview ? "/dashboard" : "/account"}>Go to my dashboard</Link></Button>}
                  {published && (selectedId
                    ? <AgentInstallationGuide agentId={selectedId} />
                    : <p className="text-xs text-muted-foreground">Customers see WordPress, Wix and HTML install steps with a copy button here.</p>)}
                </div>
              )}
            </section>

            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
              <Button variant="outline" size="lg" disabled={step === 0 || busy || loading} onClick={() => void go(step - 1)}><ChevronLeft className="mr-1 h-5 w-5" />Back</Button>
              {step < STEPS.length - 1 && (
                <Button size="lg" disabled={!ready || busy || loading || Boolean(selectedId && !draft)} onClick={() => void go(step + 1)}>Next<ChevronRight className="ml-1 h-5 w-5" /></Button>
              )}
            </div>
          </div>

          {/* Desktop preview stage (Concept C §1): the site preview plus the pieces checklist filling in as the owner builds. */}
          <aside className="sticky top-4 mt-6 hidden space-y-4 lg:mt-0 lg:block">
            <SitePreview screenshot={typeof draft?.previewScreenshot === "string" ? draft.previewScreenshot : undefined} state={s} />
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">{t("wizard.pieces.title")}</p>
              <ul className="mt-2 space-y-1.5">
                {pieces.map((piece) => (
                  <li key={piece.label} className="flex items-center gap-2 text-sm">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${piece.done ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"}`}><Check className="h-3 w-3" /></span>
                    <span className={piece.done ? "" : "text-muted-foreground"}>{piece.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        {preview && <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-medium">Connected services</summary><div className="mt-3 space-y-3 text-sm"><div className="flex flex-wrap gap-2">{['Website learning','Website capture','Gemini voice'].map((label,i) => <Button key={label} size="sm" variant={serviceStep === i ? 'default' : 'outline'} onClick={() => setServiceStep(i)}>{i+1}. {label}</Button>)}</div><p>{['Website learning uses your saved Firecrawl connection.','Website capture uses your saved Browserbase connection and project.','Real voice uses your saved Google AI key.'][serviceStep]}</p><p className="text-primary">{services[['websiteLearning','websiteCapture','voice'][serviceStep]] ? 'Configured securely · no need to enter it again.' : 'Not configured · ask to connect this service securely.'}</p><Button asChild variant="link" className="px-0"><a href={['https://www.firecrawl.dev/app/api-keys','https://www.browserbase.com/settings','https://aistudio.google.com/apikey'][serviceStep]} target="_blank" rel="noopener noreferrer">Open provider settings<Link2 className="ml-1 h-3 w-3" /></a></Button><p className="text-xs text-muted-foreground">Keys stay in secure project storage, not in customer records. To replace one, request secure entry for that service only.</p></div></details>}
      </div>
    </TooltipProvider>
  );
}
