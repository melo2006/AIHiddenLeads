import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Globe,
  Loader2,
  PhoneForwarded,
  MessageSquare,
  Mail,
  UserCheck,
  Clock,
  Zap,
  Star,
  Shield,
  User,
  Phone,
  ArrowLeft,
  Home,
  FileText,
  ChevronDown,
  Upload,
  X,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneNumber, sanitizeUrlInput } from "@/lib/formatters";
import ScanningAnimation from "@/components/landing/ScanningAnimation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { DemoLeadData } from "@/components/landing/demo-results/demoResultsUtils";
import RankAuditPanel from "@/components/landing/demo-results/RankAuditPanel";
import { rankAuditExamples, type RankAuditExample } from "@/lib/rankAuditExamples";

const LAST_DEMO_STORAGE_KEY = "lastDemoLeadData";
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const normalizeUrl = (raw: string): string => {
  let url = raw.trim().replace(/^["']+|["']+$/g, "").trim();
  url = url.replace(/^(?:https?:\/\/)/i, "");
  url = url.replace(/\/+$/, "");
  if (!url) return raw.trim();
  return `https://${url}`;
};

const looksLikeDomain = (value: string) => {
  const host = value
    .trim()
    .replace(/^(?:https?:\/\/)/i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0];
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(host);
};


const extractBusinessName = (url: string): string => {
  try {
    const clean = url.replace(/^(?:https?:\/\/)/i, "").replace(/^www\./i, "");
    const domain = clean.split("/")[0].split(".")[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return "Business";
  }
};

const formSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  url: z
    .string()
    .trim()
    .min(1, "Enter your website URL")
    .max(255)
    .refine((v) => looksLikeDomain(v), { message: "Enter a valid domain (e.g. mybusiness.com)" })
    .transform(normalizeUrl),
});

const benefits = [
  { key: "transfer", icon: PhoneForwarded },
  { key: "sms", icon: MessageSquare },
  { key: "email", icon: Mail },
  { key: "crm", icon: UserCheck },
  { key: "receptionist", icon: Clock },
  { key: "capture", icon: Zap },
];

const TryDemo = () => {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [auditBusiness, setAuditBusiness] = useState("");
  const [auditLocation, setAuditLocation] = useState("");
  const [auditKeyword, setAuditKeyword] = useState("");
  const [auditMode, setAuditMode] = useState<"maps" | "nationwide">("maps");
  const [selectedExample, setSelectedExample] = useState<string | null>(null);
  const selectExample = (example: RankAuditExample) => {
    setUrl(example.website); setAuditBusiness(example.name); setAuditLocation(example.location);
    setAuditKeyword(example.keyword); setAuditMode(example.mode); setSelectedExample(example.id);
  };
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [crawlDepth, setCrawlDepth] = useState<1 | 2>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    const valid = incoming.filter((f) => {
      if (!ALLOWED_FILE_TYPES.includes(f.type)) {
        toast({ title: "Unsupported file", description: `${f.name} must be a PDF, Word doc or text file.`, variant: "destructive" });
        return false;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${f.name} is over 10 MB.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFiles = async (leadId: string) => {
    const paths: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "bin";
      const filePath = `${leadId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("lead-uploads").upload(filePath, file);
      if (error) {
        console.error("File upload error:", error);
        continue;
      }
      paths.push(filePath);
    }
    return paths;
  };
  // Pre-fill form fields from URL params (e.g. coming from CRM prospect table)
  useEffect(() => {
    const urlParam = searchParams.get("url");
    const nameParam = searchParams.get("name");
    const _nicheParam = searchParams.get("niche");
    const phoneParam = searchParams.get("callerPhone");
    const emailParam = searchParams.get("callerEmail");
    const callerNameParam = searchParams.get("callerName");

    if (urlParam && !url) setUrl(urlParam.replace(/^https?:\/\//i, ""));
    if (callerNameParam && !fullName) setFullName(callerNameParam);
    else if (nameParam && !fullName) setFullName(nameParam);
    if (phoneParam && !phone) setPhone(phoneParam);
    if (emailParam && !email) setEmail(emailParam);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = formSchema.safeParse({ fullName, phone, email, url });
    if (!parsed.success) {
      toast({ title: t("tryDemo.missingInfo"), description: t("tryDemo.fixFields"), variant: "destructive" });
      return;
    }

    const { fullName: name, phone: ph, email: em, url: websiteUrl } = parsed.data;
    const businessName = auditBusiness.trim() || extractBusinessName(websiteUrl);

    setIsSubmitting(true);

    try {
      // Always use the safe public demo helper. Public visitors cannot query the private leads table directly.
      const { data: leadId, error } = await (supabase as any).rpc("create_demo_lead", {
        _business_name: businessName,
        _full_name: name,
        _phone: ph,
        _email: em || null,
        _website_url: websiteUrl,
        _niche: "general",
        _secondary_url: secondaryUrl.trim() ? normalizeUrl(secondaryUrl) : null,
      });

      if (error) throw error;
      if (!leadId) throw new Error("Demo lead was not created");

      let filePaths: string[] = [];
      if (files.length > 0) {
        filePaths = await uploadFiles(leadId);
        if (filePaths.length > 0) {
          try {
            await (supabase as any).rpc("set_demo_lead_uploads", { _lead_id: leadId, _uploaded_files: filePaths });
          } catch (uploadErr) {
            console.error("Could not attach uploads:", uploadErr);
          }
        }
      }

      const leadData: DemoLeadData = {
        leadId,
        previewVersion: new Date().toISOString(),
        fullName: name,
        phone: ph,
        email: em || undefined,
        businessName,
        websiteUrl,
        niche: "general",
        secondaryUrls: secondaryUrl.trim() ? [normalizeUrl(secondaryUrl)] : [],
        uploadedFiles: filePaths,
        crawlDepth,
      };

      try { localStorage.setItem(LAST_DEMO_STORAGE_KEY, JSON.stringify(leadData)); } catch {}
      setIsScanning(true);

      const params = new URLSearchParams({
        url: websiteUrl,
        leadId,
        name: businessName,
        callerName: name,
        scan: "1",
        lang: i18n.resolvedLanguage || i18n.language || "en",
      });
      if (em) params.set("callerEmail", em);
      if (ph) params.set("callerPhone", ph);
      if (auditLocation.trim()) params.set("city", auditLocation.trim());
      if (auditKeyword.trim()) params.set("keyword", auditKeyword.trim());
      params.set("auditMode", auditMode);
      params.set("auditBusiness", businessName);
      navigate(`/demo-site?${params.toString()}`, { state: { leadData } });
    } catch (err) {
      console.error("Error:", err);
      toast({ title: t("tryDemo.errorTitle"), description: t("tryDemo.errorDesc"), variant: "destructive" });
      setIsScanning(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isScanning) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <ScanningAnimation websiteUrl={url} businessName={extractBusinessName(url)} callerName={fullName} onComplete={() => {}} mode="continuous" onCancel={() => setIsScanning(false)} />
      </div>
    );
  }

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

        <section aria-labelledby="audit-examples-title" className="mb-6 border-y border-border py-5 text-left">
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

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          onSubmit={handleSubmit}
          className="w-full space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Name */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("tryDemo.namePlaceholder")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-9 h-12 text-sm bg-card border-border rounded-xl focus-visible:ring-primary"
                disabled={isSubmitting}
              />
            </div>
            {/* Phone */}
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="(954) 555-1234 (optional)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                className="pl-9 h-12 text-sm bg-card border-border rounded-xl focus-visible:ring-primary"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1 pl-1">
            Phone is optional — try Aspen instantly in your browser (free, works worldwide). Add a number only if you want a live phone call too.
          </p>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Website */}
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="mybusiness.com *"
                value={url}
                onChange={(e) => { setUrl(sanitizeUrlInput(e.target.value)); setSelectedExample(null); }}
                onBlur={() => {
                  if (url.trim()) {
                    const normalized = normalizeUrl(url);
                    if (normalized !== url) setUrl(normalized);
                  }
                }}
                className="pl-9 h-12 text-sm bg-card border-border rounded-xl focus-visible:ring-primary"
                disabled={isSubmitting}
              />
            </div>
            {/* Email (optional) */}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("tryDemo.emailPlaceholder")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-12 text-sm bg-card border-border rounded-xl focus-visible:ring-primary"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Advanced: extra URL, crawl depth, documents */}
          <div className="rounded-xl border border-border bg-card/40 text-left">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-foreground/90"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Teach Aspen more (optional): extra page, deeper crawl, documents
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>

            {showAdvanced && (
              <div className="px-4 pb-4 space-y-3">
                {/* Secondary URL */}
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Additional page or second website (optional)"
                    value={secondaryUrl}
                    onChange={(e) => setSecondaryUrl(sanitizeUrlInput(e.target.value))}
                    className="pl-9 h-11 text-sm bg-card border-border rounded-xl focus-visible:ring-primary"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Crawl depth */}
                <div>
                  <p className="text-[11px] font-semibold text-foreground/80 mb-1.5">How deep should we learn?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 1 as const, label: "Level 1 — page & menu", hint: "Up to 20 linked pages" },
                      { value: 2 as const, label: "Level 2 — add submenus", hint: "Up to 40 linked pages" },
                    ].map((opt) => (
                      <Button variant="outline"
                        key={opt.value}
                        type="button"
                        onClick={() => setCrawlDepth(opt.value)}
                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                          crawlDepth === opt.value
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card/60 hover:border-primary/50"
                        }`}
                      >
                        <span className="block text-[11px] font-semibold text-foreground leading-tight">{opt.label}</span>
                        <span className="block text-[10px] text-muted-foreground">{opt.hint}</span>
                      </Button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Learning is limited to readable pages and available time. A specific listing stays in its own section, never other listings.
                  </p>
                </div>

                {/* Documents */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.md,.csv,.doc,.docx"
                    onChange={handleFileAdd}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || files.length >= MAX_FILES}
                    className="h-9 text-xs gap-1.5 rounded-xl"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload PDF / doc / text (max {MAX_FILES}, 10 MB each)
                  </Button>
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5"
                        >
                          <span className="truncate text-[11px] text-foreground/90">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting || !url.trim() || !fullName.trim()}
            className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_40px_-5px_hsl(var(--primary)/0.6)] transition-all"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              t("tryDemo.submit")
            )}
          </Button>
        </motion.form>

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
            <span>~90 seconds</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default TryDemo;
