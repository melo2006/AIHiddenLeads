import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  PhoneForwarded,
  MessageSquare,
  Mail,
  UserCheck,
  Clock,
  Zap,
  Star,
  Shield,
  ArrowLeft,
  Home,
  ArrowRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RankAuditPanel from "@/components/landing/demo-results/RankAuditPanel";
import DemoIntakePanel, {
  extractBusinessName,
  type DemoIntakeReady,
} from "@/components/landing/DemoIntakePanel";
import { rankAuditExamples, type RankAuditExample } from "@/lib/rankAuditExamples";
import { loadDemoResume, clearDemoResume, type DemoResume } from "@/lib/demoVerification";

const LAST_DEMO_STORAGE_KEY = "lastDemoLeadData";

const benefits = [
  { key: "transfer", icon: PhoneForwarded },
  { key: "sms", icon: MessageSquare },
  { key: "email", icon: Mail },
  { key: "crm", icon: UserCheck },
  { key: "receptionist", icon: Clock },
  { key: "capture", icon: Zap },
];

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

  const handleIntakeReady = ({ leadData, gateChannel, maskedTarget }: DemoIntakeReady) => {
    try { localStorage.setItem(LAST_DEMO_STORAGE_KEY, JSON.stringify(leadData)); } catch { /* storage unavailable — router state still carries the lead */ }
    const params = new URLSearchParams({
      url: leadData.websiteUrl,
      leadId: leadData.leadId || "",
      name: leadData.businessName,
      callerName: leadData.fullName,
      scan: "1",
      lang: i18n.resolvedLanguage || i18n.language || "en",
      gate: "1",
      gateChannel,
      gateTarget: maskedTarget,
    });
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
      gate: "1",
      lang: i18n.resolvedLanguage || i18n.language || "en",
    });
    navigate(`/demo-site?${params.toString()}`);
  };

  const dismissResume = () => {
    clearDemoResume();
    setResume(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 pt-20 pb-8 relative overflow-hidden">
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

      <div className="relative z-10 w-full max-w-lg mx-auto text-center my-auto">

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-3">
            {t("tryDemo.headline1")}{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              AI
            </span>
            {" "}{t("tryDemo.headline2")}
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg mb-2">
            {t("tryDemo.sub")}
          </p>
          <p className="text-muted-foreground/70 text-xs sm:text-sm mb-5 italic">
            {t("tryDemo.payoff")}
          </p>
        </motion.div>

        {/* Benefits grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6"
        >
          {benefits.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-start gap-2 px-3 py-2 rounded-xl border border-border bg-card/60 backdrop-blur-sm text-left"
            >
              <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground leading-tight">{t(`tryDemo.benefits.${key}.label`)}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{t(`tryDemo.benefits.${key}.desc`)}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Resume a saved demo (Verified Demo Gate graceful exit) */}
        {resume && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-left"
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

        {/* Demo-mode intake (the widget-style form + verification code send) */}
        <DemoIntakePanel
          url={url}
          onUrlChange={(value) => { setUrl(value); setSelectedExample(null); }}
          auditBusinessName={auditBusiness}
          onReady={handleIntakeReady}
        />

        <section aria-labelledby="audit-examples-title" className="mt-6 mb-6 border-y border-border py-5 text-left">
          <h2 id="audit-examples-title" className="text-base font-bold">Try a real business</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {rankAuditExamples.map(example => <Button key={example.id} type="button" variant={selectedExample === example.id ? "default" : "outline"} onClick={() => selectExample(example)} className="h-auto min-h-14 flex-col items-start whitespace-normal px-3 py-2 text-left text-xs">
              <span className="font-semibold">{example.name}</span><span className="mt-1 text-[10px]">{example.mode === "nationwide" ? "Nationwide · B2B supplier" : example.id === "manufacturer" ? "Riviera Beach · manufacturer" : example.id === "bank" ? "Las Olas · single bank branch" : "Fort Lauderdale · plumber"}</span>
            </Button>)}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Public examples, not customers or verified rankings. Website access and Google listings may change.</p>
          {selectedExample && <a className="mt-1 inline-block text-xs text-primary underline" href={rankAuditExamples.find(e => e.id === selectedExample)?.source} target="_blank" rel="noreferrer">View business location source</a>}
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
          className="mt-4 px-4 py-3 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm"
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
  );
};

export default TryDemo;
