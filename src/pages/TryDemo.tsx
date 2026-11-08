import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  PhoneMissed,
  Zap,
  UserCheck,
  CalendarCheck,
  Video,
  Star,
  Shield,
  ArrowLeft,
  Home,
  ArrowRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AssistantErrorBoundary from "@/components/AssistantErrorBoundary";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";
import RankAuditPanel from "@/components/landing/demo-results/RankAuditPanel";
import DemoIntakePanel, {
  extractBusinessName,
  type DemoIntakeReady,
} from "@/components/landing/DemoIntakePanel";
import TeamSection from "@/components/landing/TeamSection";
import aspenPortrait from "@/assets/aspen-video-frame-final.webp";
import { rankAuditExamples, type RankAuditExample } from "@/lib/rankAuditExamples";
import { loadDemoResume, clearDemoResume, type DemoResume } from "@/lib/demoVerification";

const LAST_DEMO_STORAGE_KEY = "lastDemoLeadData";

/**
 * /demo landing (redesigned 2026-11-08, owner spec): the hero carries the
 * whole pitch on one mobile screen — slogan, Aspen with her speech-bubble
 * invitation, the price up front, and the intake form. Everything else
 * (benefits, how it works, ready-made examples, the Maps rank grid) lives
 * below the fold so ad/email arrivals reach the form without scrolling.
 * The verified-demo gate flow is untouched: this page only collects the
 * intake and navigates to /demo-site exactly as before.
 */

const perks = [
  { key: "perkVoicemail", icon: PhoneMissed },
  { key: "perkFast", icon: Zap },
  { key: "perkCapture", icon: UserCheck },
  { key: "perkBookings", icon: CalendarCheck },
  { key: "perkLiveAvatar", icon: Video },
] as const;

const steps = ["stepEnter", "stepLearn", "stepTalk"] as const;

const TryDemo = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [url, setUrl] = useState("");
  const [auditBusiness, setAuditBusiness] = useState("");
  const [auditLocation, setAuditLocation] = useState("");
  const [auditKeyword, setAuditKeyword] = useState("");
  const [auditMode, setAuditMode] = useState<"maps" | "nationwide">("maps");
  const [selectedExample, setSelectedExample] = useState<string | null>(null);
  const [resume, setResume] = useState<DemoResume | null>(null);

  const selectExample = (example: RankAuditExample) => {
    setUrl(example.website); setAuditBusiness(example.name); setAuditLocation(example.location);
    setAuditKeyword(example.keyword); setAuditMode(example.mode); setSelectedExample(example.id);
    // The demo still starts from the intake form (it needs the visitor's
    // name + email) — bring the form back into view with the site filled in.
    document.getElementById("demo-intake")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Pre-fill the website from URL params (e.g. coming from the CRM prospect table)
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam) setUrl((current) => current || urlParam.replace(/^https?:\/\//i, ""));
  }, [searchParams]);

  // "Continue my demo" — a saved, unfinished verified demo can be resumed.
  useEffect(() => {
    setResume(loadDemoResume());
  }, []);

  const handleIntakeReady = ({ leadData, gateChannel, maskedTarget, verifyDemo }: DemoIntakeReady) => {
    try { localStorage.setItem(LAST_DEMO_STORAGE_KEY, JSON.stringify(leadData)); } catch { /* storage unavailable — router state still carries the lead */ }
    const params = new URLSearchParams({
      url: leadData.websiteUrl,
      leadId: leadData.leadId || "",
      name: leadData.businessName,
      callerName: leadData.fullName,
      scan: "1",
      lang: i18n.resolvedLanguage || i18n.language || "en",
    });
    // TEST-ONLY toggle OFF (see DEMO_TEST_TOGGLE): no gate params at all, so
    // /demo-site never engages the verification gate for this session.
    if (verifyDemo) {
      params.set("gate", "1");
      params.set("gateChannel", gateChannel);
      params.set("gateTarget", maskedTarget);
    }
    if (leadData.email) params.set("callerEmail", leadData.email);
    if (leadData.phone) params.set("callerPhone", leadData.phone);
    if (auditLocation.trim()) params.set("city", auditLocation.trim());
    if (auditKeyword.trim()) params.set("keyword", auditKeyword.trim());
    params.set("auditMode", auditMode);
    if (auditBusiness.trim()) params.set("auditBusiness", auditBusiness.trim());
    navigate(`/demo-site?${params.toString()}`, { state: { leadData } });
  };

  const continueResume = () => {
    if (!resume) return;
    const params = new URLSearchParams({
      url: resume.websiteUrl,
      leadId: resume.leadId,
      scan: "1",
      lang: i18n.resolvedLanguage || i18n.language || "en",
    });
    // The resumed session keeps its TEST-ONLY toggle choice: only a
    // verifying session re-enters through the gate.
    if (resume.verifyDemo) params.set("gate", "1");
    navigate(`/demo-site?${params.toString()}`);
  };

  const dismissResume = () => {
    clearDemoResume();
    setResume(null);
  };

  return (
    <div className="min-h-screen bg-background px-4 pt-[3.75rem] pb-8 sm:pt-16 relative overflow-hidden">
      {/* Sticky header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/60">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label="Back to home"
          >
            <img src="/favicon.png" alt="AI Hidden Leads" className="w-6 h-6" />
            <span className="text-sm font-extrabold tracking-tight text-foreground">
              AI <span className="text-primary">Hidden</span> Leads
            </span>
          </button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="h-8 px-2 text-xs gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="h-8 px-2 text-xs gap-1"
            >
              <Home className="w-3.5 h-3.5" /> Home
            </Button>
            <LanguageSwitcher variant="full" className="h-8 border border-border/60 bg-card/60" />
          </div>
        </div>
      </header>

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg lg:max-w-6xl mx-auto">
        {/* Resume a saved demo (Verified Demo Gate graceful exit) */}
        {resume && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-left"
            role="status"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Welcome back — your demo is saved</p>
              <p className="truncate text-xs text-muted-foreground">
                Pick up right where you left off with {extractBusinessName(resume.websiteUrl)}.
              </p>
            </div>
            <Button size="sm" onClick={continueResume} className="shrink-0 gap-1">
              Continue my demo <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <button
              type="button"
              onClick={dismissResume}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss saved demo"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* HERO — slogan, Aspen, price and the form on the first screen */}
        <div className="grid items-start gap-3 sm:gap-5 lg:grid-cols-2 lg:gap-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-center lg:pt-4 lg:text-left"
          >
            <h1 className="text-[1.6rem] leading-[1.12] sm:text-4xl xl:text-5xl font-bold mb-1.5 sm:mb-2">
              {t("tryDemo.heroHeadline")}
            </h1>
            <p className="text-muted-foreground text-[13px] leading-snug sm:text-base mb-2 sm:mb-3">
              {t("tryDemo.heroTagline")}
            </p>

            {/* Aspen + speech bubble (same approved still as the live widget portrait) */}
            <div className="flex items-center gap-3 text-left sm:gap-4">
              <img
                src={aspenPortrait}
                alt="Aspen, your AI spokesperson"
                width={512}
                height={512}
                decoding="async"
                draggable={false}
                className="aspect-[4/5] w-16 shrink-0 rounded-2xl object-cover object-top shadow-xl sm:w-28 lg:w-36"
              />
              <div className="relative min-w-0 flex-1 rounded-2xl rounded-bl-sm border border-primary/30 bg-primary/10 px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs leading-snug text-foreground sm:text-sm">
                  {t("tryDemo.aspenBubble")}
                </p>
              </div>
            </div>

            {/* Price strip — up front, evergreen promo wording, no dates */}
            <p className="mt-2.5 rounded-2xl border border-border bg-card/60 px-3.5 py-2 text-left text-xs leading-snug text-muted-foreground backdrop-blur-sm sm:mt-4 sm:px-4 sm:py-3 sm:text-sm sm:leading-relaxed">
              {t("tryDemo.priceStrip")}
            </p>

            {/* Ask Aspen — opens the live homepage widget (mounted below)
                with a demo-page framing; the widget listens for this event
                in floating mode. On mobile it sits in normal flow directly
                above the form (never over the submit button); the widget's
                own bubble stays at the standard bottom corner. */}
            <div className="mt-2.5 text-left sm:mt-4">
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-2 rounded-xl text-[13px] font-semibold sm:h-11 sm:text-sm"
                onClick={() => window.dispatchEvent(new CustomEvent("open-homepage-aspen", { detail: { mode: "voice", start: true } }))}
              >
                <Video className="h-4 w-4 text-primary" /> {t("tryDemo.askAspen")}
              </Button>
            </div>
          </motion.div>

          {/* Demo-mode intake (the widget-style form + verification code send) */}
          <div id="demo-intake" className="scroll-mt-20">
            <DemoIntakePanel
              url={url}
              onUrlChange={(value) => { setUrl(value); setSelectedExample(null); }}
              auditBusinessName={auditBusiness}
              onReady={handleIntakeReady}
            />
          </div>
        </div>

        {/* BELOW THE FOLD — benefits, how it works, examples, rank grid */}
        <div className="mx-auto mt-10 w-full max-w-2xl">
          {/* Benefits */}
          <motion.section
            aria-labelledby="demo-benefits-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <h2 id="demo-benefits-title" className="text-lg font-bold text-foreground">
              {t("tryDemo.benefitsTitle")}
            </h2>
            <ul className="mt-3 space-y-2.5">
              {perks.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t(`tryDemo.${key}`)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground/80">{t("tryDemo.smsNote")}</p>
          </motion.section>

          {/* Meet the team — compact variant at the pure-JSX seam between
              Benefits and How-it-works (audit §5): presentational only,
              touches neither DemoIntakePanel nor the widget mount below. */}
          <TeamSection compact />

          {/* How it works */}
          <section aria-labelledby="demo-how-title" className="mt-8">
            <h2 id="demo-how-title" className="text-lg font-bold text-foreground">
              {t("tryDemo.howTitle")}
            </h2>
            <ol className="mt-3 grid gap-2 sm:grid-cols-3">
              {steps.map((key, i) => (
                <li
                  key={key}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3.5 py-3 backdrop-blur-sm sm:flex-col sm:items-start"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{t(`tryDemo.${key}`)}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Ready-made examples — collapsed by default; holds up to 10.
              Adding an example = one more entry in rankAuditExamples plus
              one more button here; the grid simply wraps. */}
          <Accordion type="single" collapsible className="mt-8 rounded-2xl border border-border bg-card/40 px-4 backdrop-blur-sm">
            <AccordionItem value="examples" className="border-b-0">
              <AccordionTrigger className="text-base font-bold hover:no-underline">
                {t("tryDemo.examplesTitle")}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-xs text-muted-foreground">{t("tryDemo.examplesHint")}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {rankAuditExamples.map((example) => (
                    <Button
                      key={example.id}
                      type="button"
                      variant={selectedExample === example.id ? "default" : "outline"}
                      onClick={() => selectExample(example)}
                      className="h-auto min-h-14 flex-col items-start whitespace-normal px-3 py-2 text-left text-xs"
                    >
                      <span className="font-semibold">{example.name}</span>
                      <span className="mt-1 text-[10px] opacity-80">
                        {example.location} · {example.industry}
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Public examples, not customers or verified rankings. Website access and Google listings may change.
                </p>
                {selectedExample && (
                  <a
                    className="mt-1 inline-block text-xs text-primary underline"
                    href={rankAuditExamples.find((e) => e.id === selectedExample)?.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View business location source
                  </a>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* 25-Point Google Maps Rank Grid — a separate tool, below the demo content */}
          <section aria-labelledby="audit-title" className="mt-8 border-t border-border pt-6 text-left">
            <h2 id="audit-title" className="text-base font-bold">{t("tryDemo.rankTitle")}</h2>
            <div className="mt-4 space-y-3">
              <div><label htmlFor="demo-audit-name" className="mb-1 block text-xs font-medium">Business / branch name</label><Input id="demo-audit-name" value={auditBusiness} onChange={e => setAuditBusiness(e.target.value)} placeholder="Exact Google business name" maxLength={200} /></div>
              <div><label htmlFor="demo-audit-location" className="mb-1 block text-xs font-medium">Local branch address or city + state</label><Input id="demo-audit-location" value={auditLocation} onChange={e => setAuditLocation(e.target.value)} placeholder="Optional for nationwide Google search" maxLength={100} /></div>
              <div><label htmlFor="demo-audit-keyword" className="mb-1 block text-xs font-medium">Customer search keyword</label><Input id="demo-audit-keyword" value={auditKeyword} onChange={e => setAuditKeyword(e.target.value)} placeholder="e.g. plumber, custom manufacturing, industrial supplies" maxLength={150} /></div>
            </div>
            <div className="mt-3"><RankAuditPanel businessName={auditBusiness || extractBusinessName(url)} city={auditLocation} websiteUrl={url} initialKeyword={auditKeyword} initialMode={auditMode} /></div>
            <p className="mt-2 text-xs text-muted-foreground">Ranking audit and website demo run separately. Local Maps checks one branch; nationwide mode checks 25 Google buyer searches, not AI citations.</p>
          </section>

          {/* Demo disclaimer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="mt-6 px-4 py-3 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm"
          >
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <button
                type="button"
                onClick={() => navigate("/prospects")}
                className="mr-1 inline-flex items-center font-semibold text-foreground/80 transition-colors hover:text-primary"
                title={t("tryDemo.goToProspects")}
                aria-label={t("tryDemo.goToProspects")}
              >
                {t("tryDemo.disclaimerLead")}
              </button>
              {t("tryDemo.disclaimer")}
            </p>
          </motion.div>

          {/* Trust strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-5 flex flex-col items-center gap-2"
          >
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              ))}
              <span className="text-sm text-muted-foreground ml-1.5">{t("tryDemo.trusted")}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-primary" /> {t("tryDemo.free")}
              </span>
              <span>·</span>
              <span>{t("tryDemo.noSignup")}</span>
              <span>·</span>
              <span>{t('tryDemo.free')} live demo</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Live Aspen on the /demo landing (owner addition, 2026-11-08):
          the same homepage widget Index mounts — standard config (homepage
          sales session; her knowledge covers the demo) with its standard
          "Tap to talk" bubble at the bottom corner. It is per-page (not
          global), so it exists only here and on the homepage — never inside
          the /demo-site simulation. SEAM: GeminiAgentWidget exposes no
          page-context / extra-instructions prop, so no demo-specific script
          is injected; the hero's "Ask Aspen about this demo" button frames
          the entry point and opens her via the widget's own event. */}
      <AssistantErrorBoundary>
        <GeminiAgentWidget floating />
      </AssistantErrorBoundary>
    </div>
  );
};

export default TryDemo;
