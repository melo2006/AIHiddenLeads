import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Rocket,
  ArrowRight,
  Globe,
  Phone,
  User,
  Loader2,
  Mail,
  Upload,
  X,
  FileText,
  Link2,
  Building2,
} from "lucide-react";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NicheData } from "@/data/nicheData";
import ScanningAnimation from "./ScanningAnimation";
import type { DemoLeadData } from "./demo-results/demoResultsUtils";
import { formatPhoneNumber, sanitizeUrlInput } from "@/lib/formatters";
import {trackCampaignEvent} from '@/lib/campaignTracking';

type ViewState = "form" | "scanning" | "results";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const LAST_DEMO_STORAGE_KEY = "lastDemoLeadData";
const ALLOWED_TYPES = [
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const optionalEmailSchema = z
  .string()
  .trim()
  .max(255, "Email is too long")
  .refine((value) => value.length === 0 || z.string().email().safeParse(value).success, {
    message: "Please enter a valid email address",
  });

/**
 * Smart URL normalizer: accepts bare domains, www prefixes, http/https,
 * trailing slashes, etc. and resolves to a clean https:// URL.
 */
const normalizeUrl = (raw: string): string => {
  let url = raw.trim();
  if (!url) return url;

  // Strip surrounding quotes / whitespace artifacts
  url = url.replace(/^["']+|["']+$/g, "").trim();

  // Remove any leading protocol so we can re-add https consistently
  url = url.replace(/^(?:https?:\/\/)/i, "");

  // Remove trailing slash(es)
  url = url.replace(/\/+$/, "");

  // If nothing useful remains, return as-is
  if (!url) return raw.trim();

  return `https://${url}`;
};

const looksLikeDomain = (value: string) => {
  const host = value
    .trim()
    .replace(/^(?:https?:\/\/)/i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0];
  // Allow subdomains and labels containing digits/hyphens (e.g. media.p3mediatx.com)
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(host);
};


const leadFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100, "Name is too long"),
  businessName: z.string().trim().max(150, "Business name is too long"),
  email: optionalEmailSchema,
  website: z
    .string()
    .trim()
    .min(1, "Please enter your website URL")
    .max(255, "Website URL is too long")
    .refine((v) => looksLikeDomain(v), { message: "Please enter a valid domain (e.g. bankunited.com)" })
    .transform(normalizeUrl),
  phone: z.string().trim().max(30, "Phone number is too long").optional().or(z.literal("")),
  secondaryUrl: z
    .string()
    .trim()
    .max(255, "URL is too long")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? normalizeUrl(v) : v)),
});

interface LeadCaptureSectionProps {
  selectedNiche: NicheData;
}

const LeadCaptureSection = ({ selectedNiche }: LeadCaptureSectionProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [viewState, setViewState] = useState<ViewState>("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanData, setScanData] = useState<DemoLeadData | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState(() => {
    try {
      const saved = localStorage.getItem("leadFormData");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { name: "", businessName: "", email: "", website: "", phone: "", secondaryUrl: "" };
  });

  // Persist form data to localStorage during dev
  const updateFormData = (update: Partial<typeof formData>) => {
    const next = { ...formData, ...update };
    setFormData(next);
    try { localStorage.setItem("leadFormData", JSON.stringify(next)); } catch {}
  };

  const storeDemoLeadData = useCallback((nextScanData: DemoLeadData) => {
    setScanData(nextScanData);
    try {
      localStorage.setItem(LAST_DEMO_STORAGE_KEY, JSON.stringify(nextScanData));
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (viewState !== "scanning" || !scanData) return;

    const params = new URLSearchParams({
      url: scanData.websiteUrl,
      leadId: scanData.leadId || "",
      name: scanData.businessName || "",
      callerName: scanData.fullName || "",
    });
    if (scanData.email) params.set("callerEmail", scanData.email);
    if (scanData.phone) params.set("callerPhone", scanData.phone);

    navigate(`/demo-site?${params.toString()}`, { state: { leadData: scanData } });
    setViewState("form");
  }, [navigate, scanData, viewState]);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const valid = newFiles.filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast({ title: t("leadForm.invalidFile"), description: t("leadForm.invalidFileDesc", { file: f.name }), variant: "destructive" });
        return false;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: t("leadForm.fileTooLarge"), description: t("leadForm.fileTooLargeDesc", { file: f.name }), variant: "destructive" });
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
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

    const parsed = leadFormSchema.safeParse(formData);
    if (!parsed.success) {
      toast({
        title: t("leadForm.fixForm"),
        description: t("leadForm.reviewDetails"),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setScanData(null);
    try {
      const { data: leadId, error } = await (supabase as any).rpc("create_demo_lead", {
        _business_name: parsed.data.businessName || new URL(parsed.data.website).hostname.replace(/^www\./, ''),
        _full_name: parsed.data.name,
        _phone: parsed.data.phone || null,
        _email: parsed.data.email || null,
        _website_url: parsed.data.website,
        _niche: selectedNiche.id,
        _secondary_url: parsed.data.secondaryUrl || null,
        _scan_status: "pending",
      });

      if (error) throw error;
      if (!leadId) throw new Error("Demo lead was not created");

      let filePaths: string[] = [];
      if (files.length > 0) {
        filePaths = await uploadFiles(leadId);
        if (filePaths.length > 0) {
          await (supabase as any).rpc("set_demo_lead_uploads", { _lead_id: leadId, _uploaded_files: filePaths });
        }
      }

      setViewState("scanning");
      void trackCampaignEvent('scan_started');

      const scanResult = await supabase.functions.invoke("scan-website", {
        body: {
          leadId,
          websiteUrl: parsed.data.website,
          businessName: parsed.data.businessName,
          secondaryUrl: parsed.data.secondaryUrl || null,
          uploadedFiles: filePaths,
          initialNiche: selectedNiche.id,
        },
      });

      if (scanResult.error) {
        console.error("Scan error:", scanResult.error);
        toast({
          title: t("leadForm.loadingBasicDemo"),
          description: t("leadForm.loadingBasicDemoDesc"),
        });
      } else {
        console.log("Scan completed:", scanResult.data);
      }

      const fallbackScanData: DemoLeadData = {
        leadId,
        previewVersion: new Date().toISOString(),
        fullName: parsed.data.name,
        businessName: parsed.data.businessName,
        email: parsed.data.email || undefined,
        websiteUrl: parsed.data.website,
        phone: parsed.data.phone || undefined,
        niche: selectedNiche.id,
        screenshot: undefined,
        screenshotTablet: undefined,
        screenshotMobile: undefined,
        title: parsed.data.businessName,
        description: undefined,
        websiteContent: undefined,
        colors: undefined,
        logo: undefined,
      };

      const { data: updatedLead } = await (supabase as any)
        .rpc("get_demo_lead", { _lead_id: leadId })
        .maybeSingle();

      if (updatedLead) {
        const normalizedColors =
          updatedLead.brand_colors &&
          typeof updatedLead.brand_colors === "object" &&
          !Array.isArray(updatedLead.brand_colors)
            ? (updatedLead.brand_colors as Record<string, string | undefined>)
            : undefined;

        storeDemoLeadData({
          leadId: updatedLead.id,
          previewVersion: updatedLead.updated_at || new Date().toISOString(),
          fullName: updatedLead.full_name,
          businessName: updatedLead.business_name || parsed.data.businessName,
          email: parsed.data.email || undefined,
          websiteUrl: updatedLead.website_url,
          phone: parsed.data.phone || undefined,
          niche: updatedLead.niche || selectedNiche.id,
          screenshot: updatedLead.website_screenshot,
          screenshotTablet: (updatedLead as any).screenshot_tablet || undefined,
          screenshotMobile: (updatedLead as any).screenshot_mobile || undefined,
          title: updatedLead.website_title,
          description: updatedLead.website_description,
          websiteContent: updatedLead.website_content,
          colors: normalizedColors,
          logo: updatedLead.brand_logo,
        });
      } else {
        storeDemoLeadData(fallbackScanData);
      }
    } catch (err) {
      console.error("Error submitting lead:", err);
      toast({ title: t("leadForm.errorTitle"), description: t("leadForm.errorDesc"), variant: "destructive" });
      setViewState("form");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (viewState === "scanning") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center px-4">
        <ScanningAnimation
          websiteUrl={formData.website}
          businessName={formData.businessName}
          callerName={formData.name}
          onComplete={() => {}}
          mode="continuous"
          onCancel={() => setViewState("form")}
        />
      </div>
    );
  }

  return (
    <section id="demo-form" className="py-6 sm:py-12 lg:py-16 relative">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[150px]" />
      </div>
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-4 sm:mb-10"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-primary/20 bg-primary/5 mb-3 sm:mb-6">
              <Rocket className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">{t("leadForm.badge")}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4">
              {t("leadForm.title1")} <span className="text-gradient-primary">{t("leadForm.title2")}</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-lg">
              {t("leadForm.sub")}
            </p>
          </motion.div>

          <motion.form
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            onSubmit={handleSubmit}
            className="rounded-2xl border border-border bg-card p-4 sm:p-6 lg:p-8 glow-border"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                  <User className="w-4 h-4 text-muted-foreground" /> {t("leadForm.name")} <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="Alex Johnson"
                  value={formData.name}
                  onChange={(e) => updateFormData({ name: e.target.value })}
                  className="bg-secondary border-border"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> {t("leadForm.business")} <span className="text-xs text-muted-foreground">{t("leadForm.optional")}</span>
                </label>
                <Input
                  placeholder="Sunrise Dental Studio"
                  value={formData.businessName}
                  onChange={(e) => updateFormData({ businessName: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" /> {t("leadForm.website")} <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="bankunited.com"
                  value={formData.website}
                  onChange={(e) => updateFormData({ website: sanitizeUrlInput(e.target.value) })}
                  onBlur={() => {
                    const normalized = normalizeUrl(formData.website);
                    if (normalized !== formData.website) updateFormData({ website: normalized });
                  }}
                  className="bg-secondary border-border"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" /> {t("leadForm.email")} <span className="text-xs text-muted-foreground">{t("leadForm.optional")}</span>
                </label>
                <Input
                  type="email"
                  placeholder="owner@business.com"
                  value={formData.email}
                  onChange={(e) => updateFormData({ email: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {t("leadForm.phone")} <span className="text-xs text-muted-foreground">{t("leadForm.optional")}</span>
                </label>
                <Input
                  type="tel"
                  placeholder="(954) 555-1234"
                  value={formData.phone}
                  onChange={(e) => updateFormData({ phone: formatPhoneNumber(e.target.value) })}
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground" /> {t("leadForm.altUrl")} <span className="text-xs text-muted-foreground">{t("leadForm.optional")}</span>
                </label>
                <Input
                  placeholder="https://vendor-or-partner-site.com"
                  value={formData.secondaryUrl}
                  onChange={(e) => updateFormData({ secondaryUrl: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>
            </div>

            <div className="mb-4 space-y-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-muted-foreground" /> {t("leadForm.uploadDocs")} <span className="text-xs text-muted-foreground">{t("leadForm.uploadOptional")}</span>
              </label>
              <div
                className="rounded-xl border-2 border-dashed border-border bg-secondary/50 p-2 sm:p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const dt = e.dataTransfer;
                  if (dt?.files) {
                    const fakeEvent = { target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>;
                    handleFileAdd(fakeEvent);
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.txt,.doc,.docx"
                  multiple
                  onChange={handleFileAdd}
                />
                {files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("leadForm.dragDrop")} <span className="text-primary font-medium">{t("leadForm.clickBrowse")}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mb-2">
                    {t("leadForm.filesSelected", { count: files.length, max: MAX_FILES })}
                  </p>
                )}
              </div>
              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1 text-foreground">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full text-base sm:text-lg py-4 sm:py-6 bg-primary text-primary-foreground hover:bg-primary/90 glow-border rounded-xl font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {t("leadForm.submitting")}
                </>
              ) : (
                <>
                  {t("leadForm.submit")}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              {t("leadForm.requiredNote")}
            </p>
          </motion.form>
        </div>
      </div>
    </section>
  );
};

export default LeadCaptureSection;
