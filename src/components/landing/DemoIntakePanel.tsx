import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Loader2,
  Mail,
  User,
  Phone,
  ChevronDown,
  FileText,
  Upload,
  X,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneNumber, sanitizeUrlInput } from "@/lib/formatters";
import { PersonPortrait } from "@/components/FloatingPersonFrame";
import type { DemoLeadData } from "@/components/landing/demo-results/demoResultsUtils";
import {
  DEMO_CONSENT_DISCLOSURE,
  SMS_VERIFICATION_ENABLED,
  requestDemoCode,
} from "@/lib/demoVerification";
import { trackCampaignEvent } from "@/lib/campaignTracking";

/**
 * Demo-mode intake: the chat-widget-style form that replaces the heavy /demo
 * page form (Verified Demo Gate, phase 1). Aspen's portrait heads the card;
 * the fields are name / email / phone / website URL, the consent disclosure
 * sits directly at the action, and submitting creates the lead, sends the
 * 4-digit verification code (email — the live channel) and hands the parent
 * everything it needs to navigate into the gated demo. Advanced teaching
 * options (extra page, crawl depth, documents) stay available collapsed —
 * they are page-level extras, not part of the in-widget intake.
 */

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

export const normalizeDemoUrl = (raw: string): string => {
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

export const extractBusinessName = (url: string): string => {
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
  email: z.string().trim().email("Enter a valid email"),
  url: z
    .string()
    .trim()
    .min(1, "Enter your website URL")
    .max(255)
    .refine((v) => looksLikeDomain(v), { message: "Enter a valid domain (e.g. mybusiness.com)" })
    .transform(normalizeDemoUrl),
});

export interface DemoIntakeReady {
  leadData: DemoLeadData;
  gateChannel: "email" | "sms";
  maskedTarget: string;
}

interface Props {
  url: string;
  onUrlChange: (value: string) => void;
  auditBusinessName?: string;
  onReady: (ready: DemoIntakeReady) => void;
}

export default function DemoIntakePanel({ url, onUrlChange, auditBusinessName, onReady }: Props) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [crawlDepth, setCrawlDepth] = useState<1 | 2>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = formSchema.safeParse({ fullName, phone, email, url });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast({
        title: "Almost there",
        description: first?.message || "Please check the highlighted fields.",
        variant: "destructive",
      });
      return;
    }

    const { fullName: name, phone: ph, email: em, url: websiteUrl } = parsed.data;
    const businessName = auditBusinessName?.trim() || extractBusinessName(websiteUrl);

    setIsSubmitting(true);
    try {
      void trackCampaignEvent("scan_started");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped RPC (same cast the original TryDemo used)
      const { data: leadId, error } = await (supabase as any).rpc("create_demo_lead", {
        _business_name: businessName,
        _full_name: name,
        _phone: ph,
        _email: em,
        _website_url: websiteUrl,
        _niche: "general",
        _secondary_url: secondaryUrl.trim() ? normalizeDemoUrl(secondaryUrl) : null,
      });
      if (error) throw error;
      if (!leadId) throw new Error("Demo lead was not created");

      let filePaths: string[] = [];
      if (files.length > 0) {
        filePaths = await uploadFiles(leadId);
        if (filePaths.length > 0) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped RPC (same cast the original TryDemo used)
            await (supabase as any).rpc("set_demo_lead_uploads", { _lead_id: leadId, _uploaded_files: filePaths });
          } catch (uploadErr) {
            console.error("Could not attach uploads:", uploadErr);
          }
        }
      }

      // Verified Demo Gate: send the 4-digit code now (email is the live
      // channel in phase 1) so it lands while the demo builds.
      const codeResult = await requestDemoCode(leadId, "email", em);
      // NOTE: tsconfig strict:false disables discriminant narrowing on the
      // result union — compare `ok` explicitly instead of relying on `!ok`.
      if (codeResult.ok === false) {
        throw new Error(
          codeResult.error === "resend_cooldown"
            ? "A code was just sent — check your inbox in a moment."
            : "We could not send your verification code. Please check the email address and try again.",
        );
      }
      const sentMaskedTarget = codeResult.ok === true ? codeResult.maskedTarget : null;

      const leadData: DemoLeadData = {
        leadId,
        previewVersion: new Date().toISOString(),
        fullName: name,
        phone: ph,
        email: em,
        businessName,
        websiteUrl,
        niche: "general",
        secondaryUrls: secondaryUrl.trim() ? [normalizeDemoUrl(secondaryUrl)] : [],
        uploadedFiles: filePaths,
        crawlDepth,
      };

      onReady({ leadData, gateChannel: "email", maskedTarget: sentMaskedTarget || em });
    } catch (err) {
      console.error("Demo intake error:", err);
      toast({
        title: "Something went wrong",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      onSubmit={handleSubmit}
      className="w-full space-y-3 rounded-[1.75rem] border border-border bg-card/80 p-4 shadow-xl backdrop-blur-sm sm:p-5"
      aria-label="Start your live demo"
    >
      {/* Aspen heads the intake, like the expanded widget */}
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-primary/50 bg-primary/10">
          <PersonPortrait animated={false} />
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold text-foreground">Hi, I&rsquo;m Aspen</p>
          <p className="text-xs leading-snug text-muted-foreground">
            Tell me where to look and I&rsquo;ll bring your website to life — then prove it&rsquo;s really you with a quick 4-digit code.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Your name *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-12 rounded-xl border-border bg-card pl-9 text-sm focus-visible:ring-primary"
            disabled={isSubmitting}
            aria-label="Your name"
          />
        </div>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="(954) 555-1234 (optional)"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
            className="h-12 rounded-xl border-border bg-card pl-9 text-sm focus-visible:ring-primary"
            disabled={isSubmitting}
            aria-label="Phone (optional)"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="mybusiness.com *"
            value={url}
            onChange={(e) => onUrlChange(sanitizeUrlInput(e.target.value))}
            onBlur={() => {
              if (url.trim()) {
                const normalized = normalizeDemoUrl(url);
                if (normalized !== url) onUrlChange(normalized);
              }
            }}
            className="h-12 rounded-xl border-border bg-card pl-9 text-sm focus-visible:ring-primary"
            disabled={isSubmitting}
            aria-label="Your website"
          />
        </div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Email for your demo code *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border-border bg-card pl-9 text-sm focus-visible:ring-primary"
            disabled={isSubmitting}
            aria-label="Email for your verification code"
          />
        </div>
      </div>

      {/* Verification channel choice — one channel only */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How should we send your code?">
        <button
          type="button"
          role="radio"
          aria-checked={channel === "email"}
          onClick={() => setChannel("email")}
          className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
            channel === "email" ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/50"
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Mail className="h-3.5 w-3.5 text-primary" /> Email me a code
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">Fast — check spam just in case</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={channel === "sms"}
          disabled={!SMS_VERIFICATION_ENABLED}
          onClick={() => SMS_VERIFICATION_ENABLED && setChannel("sms")}
          className="rounded-xl border border-border bg-card/40 px-3 py-2.5 text-left opacity-70"
          title={SMS_VERIFICATION_ENABLED ? undefined : "Text codes are coming soon"}
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MessageSquareText className="h-3.5 w-3.5 text-primary" /> Text me a code
            {!SMS_VERIFICATION_ENABLED && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Soon</span>
            )}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {SMS_VERIFICATION_ENABLED ? "Sent to your mobile" : "Coming soon — email works today"}
          </span>
        </button>
      </div>

      {/* Advanced teaching options (page-level extras, collapsed) */}
      <div className="rounded-xl border border-border bg-card/40 text-left">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-foreground/90"
        >
          <span className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary" />
            Teach Aspen more (optional): extra page, deeper crawl, documents
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>
        {showAdvanced && (
          <div className="space-y-3 px-4 pb-4">
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Additional page or second website (optional)"
                value={secondaryUrl}
                onChange={(e) => setSecondaryUrl(sanitizeUrlInput(e.target.value))}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm focus-visible:ring-primary"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-foreground/80">How deep should we learn?</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 1 as const, label: "Level 1 — page & menu", hint: "Up to 20 linked pages" },
                  { value: 2 as const, label: "Level 2 — add submenus", hint: "Up to 40 linked pages" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCrawlDepth(opt.value)}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      crawlDepth === opt.value ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/50"
                    }`}
                  >
                    <span className="block text-[11px] font-semibold leading-tight text-foreground">{opt.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.csv,.doc,.docx" onChange={handleFileAdd} className="hidden" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || files.length >= MAX_FILES}
                className="h-9 gap-1.5 rounded-xl text-xs"
              >
                <Upload className="h-3.5 w-3.5" /> Upload PDF / doc / text (max {MAX_FILES}, 10 MB each)
              </Button>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5">
                      <span className="truncate text-[11px] text-foreground/90">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
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
        disabled={isSubmitting || !url.trim() || !fullName.trim() || !email.trim()}
        className="h-14 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)] transition-all hover:bg-primary/90 hover:shadow-[0_0_40px_-5px_hsl(var(--primary)/0.6)]"
      >
        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Start my demo"}
      </Button>

      {/* Consent disclosure — directly at the action, no separate checkbox */}
      <p className="flex items-start gap-1.5 px-1 text-left text-[10px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        <span>{DEMO_CONSENT_DISCLOSURE}</span>
      </p>
    </motion.form>
  );
}
