import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Mic, ArrowLeft, Phone } from "lucide-react";
import type { DemoLeadData } from "@/components/landing/demo-results/demoResultsUtils";
import { getResponsiveScreenshotSrc, getSiteName, withCacheKey } from "@/components/landing/demo-results/demoResultsUtils";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";
import ChatWidget from "@/components/landing/demo-results/ChatWidget";
import WebsiteShowcase from "@/components/landing/demo-results/WebsiteShowcase";
import GeoGridWidget from "@/components/landing/demo-results/GeoGridWidget";
import RankAuditPanel from "@/components/landing/demo-results/RankAuditPanel";
import DemoWatermark from "@/components/landing/demo-results/DemoWatermark";
import DraggableFloating from "@/components/landing/demo-results/DraggableFloating";
import ScanningAnimation from "@/components/landing/ScanningAnimation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { preloadVoiceIdentity } from "@/lib/voicePreload";
import { shouldStartRemotePreview } from "@/lib/demoStartup";


const DEFAULT_DEMO_OWNER_NAME = "your dedicated specialist";
const LAST_DEMO_STORAGE_KEY = "lastDemoLeadData";
const TERMINAL_SCAN_STATUSES = new Set(["completed", "enriched", "failed"]);
const ACTIVE_SCAN_REUSE_MS = 5 * 60 * 1000;

const isRecentlyScanning = (record: DemoLeadRecord) => {
  if (record.scan_status !== "scanning" || !record.updated_at) return false;
  const updatedAt = new Date(record.updated_at).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < ACTIVE_SCAN_REUSE_MS;
};

const TRACKING_PARAMS = ["fbclid", "gclid", "msclkid", "igshid", "mc_cid", "mc_eid"];

// Keep the EXACT page the user submitted (deep listing links included) — only strip tracking params.
const getHomepageUrl = (websiteUrl: string) => {
  try {
    const normalizedUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    const url = new URL(normalizedUrl);
    TRACKING_PARAMS.forEach((param) => url.searchParams.delete(param));
    Array.from(url.searchParams.keys())
      .filter((key) => key.toLowerCase().startsWith("utm_"))
      .forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    return url.toString().replace(/\?$/, "");
  } catch {
    return websiteUrl;
  }
};


const isMixedContentPreview = (targetUrl: string, embedOrigin: string) => {
  if (!targetUrl || !embedOrigin) return false;

  try {
    const embedUrl = new URL(embedOrigin);
    const previewUrl = new URL(targetUrl, embedOrigin);

    return embedUrl.protocol === "https:" && previewUrl.protocol !== "https:";
  } catch {
    return false;
  }
};

const normalizePhoneNumber = (value?: string | null) => {
  if (!value) return "";

  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (value.trim().startsWith("+")) return value.trim();
  return "";
};

const isLikelyCallablePhoneNumber = (value?: string | null) => {
  const normalized = normalizePhoneNumber(value);
  if (!/^\+\d{11,15}$/.test(normalized)) return false;

  if (!normalized.startsWith("+1")) return true;

  const digits = normalized.slice(2);
  if (digits.length !== 10) return false;

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  return /^[2-9]\d{2}$/.test(areaCode) && /^[2-9]\d{2}$/.test(exchange);
};

const buildSeedLeadData = ({
  websiteUrl,
  businessName,
  niche,
  prospectId,
  callerPhone,
}: {
  websiteUrl: string;
  businessName?: string;
  niche?: string;
  prospectId?: string;
  callerPhone?: string;
}): DemoLeadData => ({
  prospectId,
  fullName: "CRM Prospect",
  businessName: businessName?.trim() || getSiteName(websiteUrl),
  websiteUrl,
  phone: callerPhone,
  niche: niche?.trim() || "general",
  screenshot: null,
  title: businessName?.trim() || "",
  description: "",
  websiteContent: "",
  colors: {},
  logo: "",
});

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

interface DemoLoadingStateProps {
  websiteUrl: string;
  businessName?: string;
  overlay?: boolean;
}

const DemoLoadingState = ({ websiteUrl, businessName, overlay = false }: DemoLoadingStateProps) => (
  <div
    className={`flex w-full items-center justify-center overflow-hidden px-4 py-4 text-center ${
      overlay ? "absolute inset-0 bg-background/92 backdrop-blur-sm" : "h-[100dvh] bg-background"
    }`}
  >
    <ScanningAnimation
      websiteUrl={websiteUrl || "website"}
      businessName={businessName}
      onComplete={() => {}}
      mode="continuous"
    />
  </div>
);

interface ScanFallbackPreviewProps {
  leadData: DemoLeadData;
  siteName: string;
  homepageUrl: string;
}

const ScanFallbackPreview = ({ leadData, siteName, homepageUrl }: ScanFallbackPreviewProps) => (
  <div className="min-h-[100dvh] bg-background px-3 pb-28 pt-28 sm:px-6 sm:pt-32">
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-[1.75rem] border border-border bg-card/95 p-5 shadow-xl backdrop-blur-xl sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Scan-based preview</p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
          We couldn&apos;t load the live website, so this demo now uses the scan result instead.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Aspen can still use the captured services, messaging, and business details here without dropping you on a blank page.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
          <span className="rounded-full border border-border bg-background px-3 py-1.5">{siteName}</span>
          <span className="max-w-full break-all rounded-full border border-border bg-background px-3 py-1.5">{homepageUrl}</span>
        </div>
      </div>

      <WebsiteShowcase leadData={leadData} />
    </div>
  </div>
);

type DemoLeadRecord = Partial<{
  id: string;
  updated_at: string;
  scan_status: string;
  full_name: string;
  business_name: string;
  email: string;
  phone: string;
  website_url: string;
  niche: string;
  website_screenshot: string;
  screenshot_tablet: string;
  screenshot_mobile: string;
  website_title: string;
  website_description: string;
  website_content: string;
  brand_colors: unknown;
  brand_logo: string;
}>;

const asBrandColors = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string | undefined>)
    : undefined;

const mergeLeadRecordIntoDemoData = (record: DemoLeadRecord, current: DemoLeadData): DemoLeadData => ({
  ...current,
  leadId: record.id || current.leadId,
  previewVersion: record.updated_at || current.previewVersion,
  scanStatus: record.scan_status || current.scanStatus,
  fullName: record.full_name || current.fullName,
  businessName: record.business_name || current.businessName,
  email: record.email || current.email,
  websiteUrl: record.website_url || current.websiteUrl,
  phone: record.phone || current.phone,
  niche: record.niche || current.niche,
  screenshot: record.website_screenshot || current.screenshot || null,
  screenshotTablet: record.screenshot_tablet || current.screenshotTablet || null,
  screenshotMobile: record.screenshot_mobile || current.screenshotMobile || null,
  title: record.website_title || current.title || "",
  description: record.website_description || current.description || "",
  websiteContent: record.website_content || current.websiteContent || "",
  colors: asBrandColors(record.brand_colors) || current.colors || {},
  logo: record.brand_logo || current.logo || "",
});

const DemoSite = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [isScanning, setIsScanning] = useState(false);


  const latestLeadData = location.state?.leadData as DemoLeadData | undefined;
  const [leadData, setLeadData] = useState<DemoLeadData | undefined>(latestLeadData);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iframeFailureMode, setIframeFailureMode] = useState<"blocked" | "unreachable" | null>(null);
  const [isIframeCheckPending, setIsIframeCheckPending] = useState(false);
  const [resolvedIframeUrl, setResolvedIframeUrl] = useState<string | null>(null);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [isLiveViewLoading, setIsLiveViewLoading] = useState(false);
  const [liveViewFailed, setLiveViewFailed] = useState(false);
  const [hasLiveViewLoaded, setHasLiveViewLoaded] = useState(false);
  const [hasIframeLoaded, setHasIframeLoaded] = useState(false);
  const [hasScreenshotLoaded, setHasScreenshotLoaded] = useState(false);
  const liveViewSessionRef = useRef<string | null>(null);
  const startedScanLeadRef = useRef<string | null>(null);
  const [prospectOwner, setProspectOwner] = useState<{name?: string; email?: string; phone?: string} | null>(null);
  const [showTestOverride, setShowTestOverride] = useState(false);
  const [testPhoneOverride, setTestPhoneOverride] = useState(() => {
    try { return localStorage.getItem("demo_test_phone_override") || ""; } catch { return ""; }
  });
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  const previewBarRef = useRef<HTMLDivElement>(null);
  const [previewBarHeight, setPreviewBarHeight] = useState(112);

  useEffect(() => { void preloadVoiceIdentity(); }, []);

  useEffect(() => {
    const bar = previewBarRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => setPreviewBarHeight(bar.getBoundingClientRect().height));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [Boolean(leadData)]);

  useEffect(() => {
    if (latestLeadData || leadData) return;

    try {
      const stored = localStorage.getItem(LAST_DEMO_STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as DemoLeadData;
      if (!parsed?.websiteUrl) return;

      const requestedUrl = searchParams.get("url");
      const requestedHomepage = requestedUrl ? getHomepageUrl(requestedUrl) : null;
      const parsedHomepage = getHomepageUrl(parsed.websiteUrl);

      if (requestedHomepage && requestedHomepage !== parsedHomepage) return;
      setLeadData(parsed);
    } catch {
      // ignore bad local cache
    }
  }, [latestLeadData, leadData, searchParams]);

  useEffect(() => {
    try {
      if (testPhoneOverride) localStorage.setItem("demo_test_phone_override", testPhoneOverride);
      else localStorage.removeItem("demo_test_phone_override");
    } catch {}
  }, [testPhoneOverride]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const responsiveScreenshotSrc = getResponsiveScreenshotSrc(
    {
      screenshot: leadData?.screenshot,
      screenshotTablet: leadData?.screenshotTablet,
      screenshotMobile: leadData?.screenshotMobile,
    },
    viewportWidth,
  );
  const screenshotSrc = withCacheKey(
    responsiveScreenshotSrc,
    leadData?.previewVersion || leadData?.leadId || undefined,
  );

  useEffect(() => {
    setHasScreenshotLoaded(false);
  }, [responsiveScreenshotSrc]);

  const returnTo = searchParams.get("returnTo");
  const leadIdParam = searchParams.get("leadId");
  const prospectIdParam = searchParams.get("prospectId");
  const callerNameParam = searchParams.get("callerName") || undefined;
  const callerEmailParam = searchParams.get("callerEmail") || undefined;
  const callerPhoneParam = (() => {
    const rawPhone = searchParams.get("callerPhone");
    return isLikelyCallablePhoneNumber(rawPhone) ? normalizePhoneNumber(rawPhone) : undefined;
  })();

  useEffect(() => {
    const requestedLang = searchParams.get("lang");
    if (requestedLang && requestedLang !== i18n.language) {
      void i18n.changeLanguage(requestedLang);
    }
  }, [i18n, searchParams]);

  useEffect(() => {
    if (searchParams.get("scan") !== "1" || !leadData?.leadId || !leadData.websiteUrl) return;
    if (startedScanLeadRef.current === leadData.leadId) return;

    startedScanLeadRef.current = leadData.leadId;
    let cancelled = false;

    const runScan = async () => {
      setIsScanning(true);
      try {
        const { data: existingLead, error: existingError } = await (supabase as any)
          .rpc("get_demo_lead", { _lead_id: leadData.leadId })
          .maybeSingle();

        if (!cancelled && !existingError && existingLead) {
          setLeadData((current) => (current ? mergeLeadRecordIntoDemoData(existingLead, current) : current));
          if (TERMINAL_SCAN_STATUSES.has(existingLead.scan_status || "")) {
            setIsScanning(false);
            return;
          }
          if (isRecentlyScanning(existingLead)) {
            return;
          }
        }

        const { error } = await supabase.functions.invoke("scan-website", {
          body: {
            leadId: leadData.leadId,
            websiteUrl: leadData.websiteUrl,
            businessName: leadData.businessName || getSiteName(leadData.websiteUrl),
            initialNiche: leadData.niche || "general",
            language: i18n.resolvedLanguage || i18n.language || "en",
            secondaryUrls: leadData.secondaryUrls || [],
            uploadedFiles: leadData.uploadedFiles || [],
            crawlDepth: leadData.crawlDepth || 1,
          },
        });
        if (error) throw error;

        const { data: fullLead, error: fetchError } = await (supabase as any)
          .rpc("get_demo_lead", { _lead_id: leadData.leadId })
          .maybeSingle();

        if (!cancelled && !fetchError && fullLead) {
          setLeadData((current) => (current ? mergeLeadRecordIntoDemoData(fullLead, current) : current));
          if (TERMINAL_SCAN_STATUSES.has(fullLead.scan_status || "")) {
            setIsScanning(false);
          }
        }
      } catch (err) {
        console.error("Scan error:", err);
        if (!cancelled) {
          toast.error("The live demo opened, but the site scan is still gathering details in the background.");
          setIsScanning(false);
        }
      }
    };

    void runScan();

    return () => {
      cancelled = true;
    };
  }, [i18n.language, i18n.resolvedLanguage, leadData?.businessName, leadData?.leadId, leadData?.niche, leadData?.websiteUrl, searchParams]);

  // Handle URL params from CRM (e.g. /demo?url=...&name=...&niche=...)
  useEffect(() => {
    const urlParam = searchParams.get("url");
    const nameParam = searchParams.get("name");
    const nicheParam = searchParams.get("niche");

    if (!urlParam || latestLeadData || leadIdParam) return;

    let cancelled = false;
    const seededLeadData = buildSeedLeadData({
      websiteUrl: urlParam,
      businessName: nameParam || undefined,
      niche: nicheParam || undefined,
      prospectId: prospectIdParam || undefined,
      callerPhone: callerPhoneParam,
    });

    setLeadData(seededLeadData);
    setIsScanning(true);
    setChatOpen(false);
    setVoiceOpen(false);
    setIframeBlocked(false);
    setIframeFailureMode(null);
    setIsIframeCheckPending(false);
    setResolvedIframeUrl(null);
    setLiveViewUrl(null);
    setIsLiveViewLoading(false);
    setLiveViewFailed(false);
    setHasLiveViewLoaded(false);
    setHasIframeLoaded(false);
    setProspectOwner(null);

    const scanWebsite = async () => {
      try {
        const { data: insertedLeadId, error: insertError } = await (supabase as any).rpc("create_demo_lead", {
          _business_name: nameParam || "Business",
          _full_name: "CRM Prospect",
          _phone: null,
          _email: null,
          _website_url: urlParam,
          _niche: nicheParam || "general",
          _secondary_url: null,
          _scan_status: "pending",
        });

        if (insertError) throw insertError;
        if (!insertedLeadId) throw new Error("Demo lead was not created");

        if (cancelled) return;

        setLeadData((current) => ({
          ...(current || seededLeadData),
          leadId: insertedLeadId,
        }));

        const syncLeadRecord = async () => {
          const { data: fullLead, error: fetchError } = await (supabase as any)
            .rpc("get_demo_lead", { _lead_id: insertedLeadId })
            .maybeSingle();

          if (fetchError || !fullLead || cancelled) return;

          setLeadData((current) => (current ? mergeLeadRecordIntoDemoData(fullLead, current) : current));

          if (TERMINAL_SCAN_STATUSES.has(fullLead.scan_status || "")) {
            setIsScanning(false);
          }
        };

        void supabase.functions.invoke("scan-website", {
          body: {
            websiteUrl: urlParam,
            leadId: insertedLeadId,
            initialNiche: nicheParam || "general",
            businessName: nameParam || "",
          },
        }).then(async ({ error }) => {
          if (error) throw error;
          await syncLeadRecord();
        }).catch((err: any) => {
          console.error("Scan error:", err);
          if (!cancelled) {
            toast.error("The live website is loading, but Aspen is still gathering the business details.");
            setIsScanning(false);
          }
        });
      } catch (err: any) {
        console.error("Scan error:", err);
        if (!cancelled) {
          toast.error("The live website is loading, but Aspen is still gathering the business details.");
          setIsScanning(false);
        }
      }
    };

    void scanWebsite();

    return () => {
      cancelled = true;
    };
  }, [callerPhoneParam, latestLeadData, leadIdParam, prospectIdParam, searchParams.toString()]);

  useEffect(() => {
    if (latestLeadData || !leadIdParam) return;

    let cancelled = false;

    const loadExistingLead = async () => {
      const { data, error } = await (supabase as any)
        .rpc("get_demo_lead", { _lead_id: leadIdParam })
        .maybeSingle();

      if (error || !data || cancelled) return;

      setLeadData((current) => mergeLeadRecordIntoDemoData(data, current || buildSeedLeadData({
        websiteUrl: data.website_url,
        businessName: data.business_name,
        niche: data.niche,
        prospectId: prospectIdParam || undefined,
        callerPhone: callerPhoneParam,
      })));

      if (!TERMINAL_SCAN_STATUSES.has(data.scan_status || "")) {
        setIsScanning(true);
      }
    };

    void loadExistingLead();

    return () => {
      cancelled = true;
    };
  }, [callerPhoneParam, latestLeadData, leadIdParam, prospectIdParam]);

  useEffect(() => {
    if (!latestLeadData) return;
    setLeadData(latestLeadData);
    setChatOpen(false);
    setVoiceOpen(false);
    setIframeBlocked(false);
    setIframeFailureMode(null);
    setIsIframeCheckPending(false);
    setResolvedIframeUrl(null);
    setLiveViewUrl(null);
    setIsLiveViewLoading(false);
    setLiveViewFailed(false);
    setHasLiveViewLoaded(false);
    setHasIframeLoaded(false);
    setProspectOwner(null);
    setIsScanning(searchParams.get("scan") === "1");
  }, [latestLeadData, searchParams]);

  useEffect(() => {
    const leadId = leadData?.leadId;
    if (!leadId || !isScanning) return;

    let cancelled = false;

    const syncLeadRecord = async () => {
      const { data, error } = await (supabase as any)
        .rpc("get_demo_lead", { _lead_id: leadId })
        .maybeSingle();

      if (error || !data || cancelled) return;

      setLeadData((current) => (current ? mergeLeadRecordIntoDemoData(data, current) : current));

      if (TERMINAL_SCAN_STATUSES.has(data.scan_status || "")) {
        setIsScanning(false);
      }
    };

    void syncLeadRecord();
    const intervalId = window.setInterval(() => {
      void syncLeadRecord();
    }, 1800);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isScanning, leadData?.leadId]);

  // Fetch prospect owner data when prospectId is available
  useEffect(() => {
    const pid = leadData?.prospectId || prospectIdParam;
    if (!pid) return;
    supabase.rpc('get_demo_prospect_owner', { _id: pid })
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setProspectOwner({
            name: row.owner_name || undefined,
            email: row.owner_email || undefined,
            phone: row.owner_phone || undefined,
          });
        }
      });
  }, [leadData?.prospectId, prospectIdParam]);

  // Check whether the target site permits iframe embedding before rendering
  useEffect(() => {
    if (!leadData?.websiteUrl) return;

    let cancelled = false;
    const homepageUrl = getHomepageUrl(leadData.websiteUrl);

    setIframeBlocked(false);
    setIframeFailureMode(null);
    setIsIframeCheckPending(true);
    setResolvedIframeUrl(homepageUrl);

    const checkIframeEmbeddability = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke("check-iframe-embed", {
            body: {
              url: homepageUrl,
              embedOrigin: window.location.origin,
            },
          }),
          5000,
          "Iframe check timed out",
        );

        if (error) throw error;
        if (cancelled) return;

        const embeddable = data?.embeddable !== false;
        const unreachable = data?.unreachable === true;
        const finalUrl = typeof data?.finalUrl === "string" && data.finalUrl ? data.finalUrl : homepageUrl;

        setResolvedIframeUrl(finalUrl);
        const nextFailureMode = unreachable ? "unreachable" : embeddable ? null : "blocked";
        setIframeBlocked(Boolean(nextFailureMode));
        setIframeFailureMode(nextFailureMode);
      } catch (error) {
        console.error("Iframe embeddability check failed:", error);
        if (cancelled) return;

        setResolvedIframeUrl(homepageUrl);
        setIframeBlocked(false);
        setIframeFailureMode(null);
      } finally {
        if (!cancelled) {
          setIsIframeCheckPending(false);
        }
      }
    };

    void checkIframeEmbeddability();

    return () => {
      cancelled = true;
    };
  }, [leadData?.websiteUrl]);

  // When iframe is blocked, start a Browserbase live view session
  useEffect(() => {
    if (!leadData?.websiteUrl) return;

    const homepageUrl = getHomepageUrl(leadData.websiteUrl);
    const embedOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const previewUrl = resolvedIframeUrl || homepageUrl;
    const requiresBrowserFallback =
      iframeFailureMode !== "unreachable" &&
      (iframeBlocked || isMixedContentPreview(previewUrl, embedOrigin));

    if (!shouldStartRemotePreview(requiresBrowserFallback, Boolean(screenshotSrc)) || liveViewUrl || isLiveViewLoading || liveViewFailed) return;

    let cancelled = false;

    const startLiveView = async () => {
      setIsLiveViewLoading(true);
      setLiveViewFailed(false);
      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke("create-browser-session", {
            body: { url: homepageUrl },
          }),
          12000,
          "Live preview timed out",
        );

        if (error) throw error;
        if (cancelled) return;

        if (data?.liveViewUrl && data?.navigated !== false) {
          setLiveViewUrl(data.liveViewUrl);
          liveViewSessionRef.current = data.sessionId;
          console.log("Browserbase live view started:", data.sessionId, "navigated:", data.navigated);
        } else if (data?.navigated === false) {
          console.warn("Skipping Browserbase live view because navigation never completed");
          setLiveViewFailed(true);
        } else {
          console.warn("No live view URL returned");
          setLiveViewFailed(true);
        }
      } catch (err) {
        console.error("Failed to start Browserbase session:", err);
        setLiveViewFailed(true);
        // Silently fail — screenshot fallback is already showing
      } finally {
        if (!cancelled) setIsLiveViewLoading(false);
      }
    };

    startLiveView();
    return () => { cancelled = true; };
  }, [iframeBlocked, iframeFailureMode, isLiveViewLoading, leadData?.websiteUrl, liveViewFailed, liveViewUrl, resolvedIframeUrl, screenshotSrc]);

  useEffect(() => {
    setHasIframeLoaded(false);
  }, [resolvedIframeUrl]);

  useEffect(() => {
    setHasLiveViewLoaded(false);
  }, [liveViewUrl]);

  // A slow permitted iframe must not hide an already captured website indefinitely.
  useEffect(() => {
    if (isScanning || isIframeCheckPending || iframeBlocked || hasIframeLoaded || !resolvedIframeUrl) return;
    const timer = window.setTimeout(() => {
      setIframeBlocked(true);
      setIframeFailureMode("blocked");
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [isScanning, isIframeCheckPending, iframeBlocked, hasIframeLoaded, resolvedIframeUrl]);

  const handleBack = () => {
    if (returnTo && returnTo.startsWith("/")) {
      navigate(returnTo);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    // Default to homepage instead of prospects
    navigate("/");
  };

  const requestedDemoUrl = searchParams.get("url");
  const requestedDemoHomepage = requestedDemoUrl ? getHomepageUrl(requestedDemoUrl) : null;
  const currentLeadHomepage = leadData?.websiteUrl ? getHomepageUrl(leadData.websiteUrl) : null;
  const isWaitingForFreshLeadData = Boolean(
    requestedDemoHomepage && !latestLeadData && currentLeadHomepage && currentLeadHomepage !== requestedDemoHomepage,
  );

  if (isWaitingForFreshLeadData) {
    return <DemoLoadingState websiteUrl={requestedDemoUrl || "website"} businessName={searchParams.get("name") || undefined} />;
  }

  if (!leadData) {
    if (!searchParams.get("url")) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 text-center shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Demo Preview</p>
            <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
              Select a lead to open the live demo
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This page is meant to preview a specific business website with the Aspen voice and chat widgets overlaid on top.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => navigate("/prospects")}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Go to Prospects
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <DemoLoadingState websiteUrl={searchParams.get("url") || "website"} businessName={searchParams.get("name") || undefined} />;
  }

  const homepageUrl = getHomepageUrl(leadData.websiteUrl);
  const livePreviewUrl = resolvedIframeUrl || homepageUrl;
  const embedOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const isWebsiteUnreachable = iframeFailureMode === "unreachable";
  const requiresBrowserFallback =
    !isWebsiteUnreachable && (iframeBlocked || isMixedContentPreview(livePreviewUrl, embedOrigin));
  const hasCrmContext = Boolean(leadData.prospectId || prospectIdParam);
  // When coming from TryDemo form (not CRM), the form submitter IS the caller, not the business owner.
  // The owner should default to a generic specialist title in that case.
  const isFormSubmitter = !hasCrmContext && leadData.fullName && leadData.fullName !== "CRM Prospect";
  const knownCallerName = callerNameParam || (isFormSubmitter ? leadData.fullName : undefined);
  const knownCallerEmail = callerEmailParam || (isFormSubmitter ? leadData.email : undefined);
  const knownCallerPhone = callerPhoneParam || (isFormSubmitter && isLikelyCallablePhoneNumber(leadData.phone) ? normalizePhoneNumber(leadData.phone) : undefined);

  // Owner info comes from CRM prospect data, NOT the form submitter
  const fallbackOwnerName = undefined; // Owner should always be DEFAULT_DEMO_OWNER_NAME unless CRM provides it
  const fallbackOwnerEmail = !hasCrmContext ? undefined : undefined;
  const fallbackOwnerPhone = undefined;

  const followUpName = prospectOwner?.name || fallbackOwnerName || DEFAULT_DEMO_OWNER_NAME;
  const followUpEmail = prospectOwner?.email || fallbackOwnerEmail || undefined;
  const rawFollowUpPhone = prospectOwner?.phone || fallbackOwnerPhone || undefined;
  const followUpPhone = (testPhoneOverride && isLikelyCallablePhoneNumber(testPhoneOverride))
    ? normalizePhoneNumber(testPhoneOverride)
    : rawFollowUpPhone;
  const siteName = leadData.businessName?.trim() || getSiteName(homepageUrl, leadData.title);
  const canRenderInlineIframe = Boolean(
    resolvedIframeUrl && !isIframeCheckPending && !requiresBrowserFallback && !isWebsiteUnreachable,
  );
  const isGeneratedScreenshot = typeof screenshotSrc === "string" && screenshotSrc.startsWith("data:image/svg+xml");
  const isLivePreviewReady = Boolean(liveViewUrl && hasLiveViewLoaded && !isGeneratedScreenshot);
  const hasScreenshotAsset = Boolean(screenshotSrc);
  const isStaticPreviewReady = hasScreenshotAsset && hasScreenshotLoaded;
  const shouldShowScreenshotFallback = hasScreenshotAsset && (isWebsiteUnreachable || requiresBrowserFallback || !hasIframeLoaded);
  const isInlinePreviewLoading =
    !requiresBrowserFallback &&
    !isWebsiteUnreachable &&
    (isIframeCheckPending || !hasIframeLoaded) && !isStaticPreviewReady;
  // Keep the scanning overlay visible while the backend scan is in progress, regardless of
  // the iframe's onLoad (which fires for the initial blank document and would otherwise
  // dismiss the overlay too early, leaving a black screen).
  const shouldHoldScanningState = isScanning;
  const isPreviewLoading =
    shouldHoldScanningState ||
    isInlinePreviewLoading ||
    (requiresBrowserFallback && !liveViewFailed && !isStaticPreviewReady && !isLivePreviewReady);
  const isPreviewAvailable =
    (!requiresBrowserFallback && !isWebsiteUnreachable && hasIframeLoaded) ||
    isLivePreviewReady ||
    isStaticPreviewReady;
  const hasGeneratedPreviewData = Boolean(
    (leadData.websiteContent && leadData.websiteContent.trim().length > 40) ||
    (leadData.description && leadData.description.trim().length > 24) ||
    (leadData.title && leadData.title.trim().length > 3),
  );
  const isScanPreviewReady = !isScanning && !isPreviewAvailable && hasGeneratedPreviewData;
  const hasAnyPreview = !isPreviewLoading && (isPreviewAvailable || isScanPreviewReady);
  const isScanFailed = !isScanning && !hasGeneratedPreviewData && !isPreviewAvailable && !isPreviewLoading;

  return (
    <div className="relative min-h-[100dvh] bg-background">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40">
        <div ref={previewBarRef} className="pointer-events-auto flex min-h-16 w-full flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-xl sm:min-h-[4.5rem] sm:gap-3 sm:px-5">
          {/* Left: Back to Homepage */}
          <button
            onClick={() => navigate("/")}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border/50 bg-background/60 px-2.5 py-1.5 text-left transition-all hover:border-primary/40 hover:bg-primary/10 sm:px-3 sm:py-2"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary" />
            <span className="text-[10px] font-semibold leading-tight text-muted-foreground group-hover:text-foreground sm:text-xs">{t("demo.homepage")}</span>
          </button>

          {/* Center: Demo info + admin controls */}
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <div className="min-w-0 text-center">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-[10px]">
                {t("demo.liveDemo")}
              </p>
              <p className="truncate text-xs font-semibold text-foreground sm:text-sm">{siteName}</p>
            </div>

            {isScanning && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {t("demo.building")}
              </span>
            )}

            <button
              onClick={() => setShowTestOverride((v) => !v)}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${showTestOverride ? "border-primary bg-primary/10 text-primary" : "border-transparent text-muted-foreground/40 hover:text-muted-foreground hover:border-border"}`}
              title="Test phone override"
            >
              <Phone className="h-3 w-3" />
            </button>

            <button
              onClick={() => navigate("/prospects")}
              className="rounded-full border border-transparent bg-transparent px-1 py-0.5 text-[8px] text-muted-foreground/20 hover:text-muted-foreground hover:border-border transition-colors inline-flex"
              title="Go to Prospects"
            >
              •
            </button>
          </div>

          {/* Right: language + CTA */}
          <div className="flex shrink-0 items-center gap-1.5">
            <LanguageSwitcher variant="full" className="h-9 border border-border/50 bg-background/60" />
            <button
              onClick={() => navigate("/#pricing")}
              className="group relative hidden overflow-hidden rounded-xl border border-primary/50 bg-primary px-3 py-1.5 text-left text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 sm:block sm:px-4 sm:py-2"
            >
              <p className="text-[10px] font-extrabold uppercase leading-tight tracking-wide sm:text-xs">
                {t("demo.getMoreInfo")}
              </p>
              <p className="text-[8px] font-medium leading-tight text-primary-foreground/80 sm:text-[9px]">
                {t("demo.brandTag")}
              </p>
            </button>
          </div>

          <div className="basis-full">
            <RankAuditPanel businessName={siteName} city={searchParams.get("city") || undefined} niche={leadData.niche} />
          </div>
        </div>

        {/* Test phone override panel */}
        {showTestOverride && (
          <div className="pointer-events-auto absolute left-1/2 top-full mt-2 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur-xl">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Transfer test to different number
            </label>
            <input
              type="tel"
              value={testPhoneOverride}
              onChange={(e) => setTestPhoneOverride(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {testPhoneOverride && isLikelyCallablePhoneNumber(testPhoneOverride)
                ? `✅ Transfers will go to ${normalizePhoneNumber(testPhoneOverride)}`
                : testPhoneOverride
                  ? "⚠️ Invalid number — using default"
                  : `Using default: ${rawFollowUpPhone || "none"}`}
            </p>
          </div>
        )}
      </div>

      {/* Website — iframe first, screenshot fallback */}
      {hasAnyPreview && <DemoWatermark />}
      <div className="relative min-h-[100dvh]" style={{ paddingTop: previewBarHeight }}>
        {canRenderInlineIframe && (
          <iframe
            src={livePreviewUrl}
            className="w-full border-0"
            style={{ minHeight: 'calc(100dvh - 4.5rem)' }}
            title={`${siteName} website`}
            onLoad={() => {
              setHasIframeLoaded(true);
            }}
            onError={() => {
              setIframeBlocked(true);
              setIframeFailureMode("blocked");
            }}
          />
        )}
        {/* Iframe blocked → try Browserbase live view, then screenshot fallback */}
        {(requiresBrowserFallback || shouldShowScreenshotFallback) && (
          <div className="relative min-h-[calc(100dvh-4.5rem)]">
            {shouldShowScreenshotFallback && screenshotSrc && (
              <div className="relative mx-auto w-full max-w-[1600px]">
                <img
                  src={screenshotSrc}
                  alt={`${siteName} website`}
                  className="block h-auto w-full"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  draggable={false}
                  onLoad={() => setHasScreenshotLoaded(true)}
                  onError={() => setHasScreenshotLoaded(false)}
                />
              </div>
            )}

            {requiresBrowserFallback && liveViewUrl && !isGeneratedScreenshot && !hasScreenshotAsset && (
              <iframe
                src={liveViewUrl}
                className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${hasLiveViewLoaded ? "opacity-100" : "opacity-0"}`}
                style={{ minHeight: 'calc(100dvh - 4.5rem)' }}
                title={`${siteName} website (live view)`}
                allow="clipboard-read; clipboard-write"
                onLoad={() => setHasLiveViewLoaded(true)}
              />
            )}
          </div>
        )}

        {isScanPreviewReady && (
          <ScanFallbackPreview leadData={leadData} siteName={siteName} homepageUrl={homepageUrl} />
        )}

        {!isPreviewLoading && !isPreviewAvailable && !isScanPreviewReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40 px-4 text-center">
            <div className="w-full max-w-lg rounded-[1.75rem] border border-border bg-card/95 p-6 shadow-xl sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                {isWebsiteUnreachable ? "Website unavailable" : isScanFailed ? "Website could not be read" : "Preview unavailable"}
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
                {isWebsiteUnreachable
                  ? "This website did not respond"
                  : isScanFailed
                    ? "We couldn't access this website's content"
                    : "We couldn't render this website here"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {isScanFailed ? (
                  <>
                    Hi, we tried to read and learn from <strong>{homepageUrl}</strong>, but it appears the website
                    is either blocking automated access, using a technology we couldn't parse, or the URL may have a typo.
                    <br /><br />
                    For this demo, Aspen won't be able to simulate your website's actual content because we couldn't
                    access it. However, on the <strong>real implementation</strong>, we go behind the scenes to manually
                    deploy an accurate knowledge base so the voice AI talks correctly based on your products and services.
                    <br /><br />
                    This quick demo is designed to work in under two minutes — but it needs website access to shine.
                    You're welcome to try another URL that you know of, and we can simulate the same experience with a different website!
                  </>
                ) : isWebsiteUnreachable ? (
                  "We gathered business details, but this website address appears offline, broken, or incorrect right now, so there was no live page to render."
                ) : (
                  "This site blocked the live preview and the backup browser session did not load correctly, so we switched to a safe fallback."
                )}
              </p>
              <div className="mt-4 rounded-2xl border border-border bg-background/80 p-4 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Website URL</p>
                <p className="mt-2 break-all text-sm font-medium text-foreground">{homepageUrl}</p>
              </div>
              {(leadData.title || leadData.description) && (
                <div className="mt-4 rounded-2xl border border-border bg-background/80 p-4 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Scan result</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{leadData.title || siteName}</p>
                  {leadData.description && (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{leadData.description}</p>
                  )}
                </div>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={() => navigate("/try-demo")}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Try Another Website
                </button>
                <button
                  onClick={handleBack}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  Back
                </button>
                <a
                  href={homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  {isWebsiteUnreachable ? "Try site anyway" : "Open site"}
                </a>
              </div>
            </div>
          </div>
        )}

        {isPreviewLoading && <DemoLoadingState websiteUrl={homepageUrl} businessName={siteName} overlay />}

        {/* ===== Local Google Maps Geo-Grid Blind-Spot Diagnostic ===== */}
        {hasAnyPreview && (
          <GeoGridWidget
            businessName={siteName}
            websiteUrl={homepageUrl}
            defaultKeyword={leadData.niche && leadData.niche !== "general" ? `${leadData.niche} near me` : ""}
            onVoiceCall={() => { setVoiceOpen(true); setChatOpen(false); }}
            onBookCall={() => navigate("/#pricing")}
          />
        )}

        {/* ===== AI Widget buttons — draggable floating ===== */}

        {hasAnyPreview && (
          <>
            <DraggableFloating initialX={24} initialY={window.innerHeight - 100} anchorRight={false}>
              {chatOpen ? (
                <div className="w-[min(20rem,calc(100vw-3rem))] max-h-[60vh] overflow-y-auto animate-in slide-in-from-bottom-4 fade-in duration-300">
                  <ChatWidget
                    key={`chat-${leadData.websiteUrl}`}
                    businessName={siteName}
                    businessNiche={leadData.niche || "general"}
                    websiteUrl={homepageUrl}
                    businessInfo={leadData.websiteContent || leadData.description || ""}
                    ownerName={followUpName}
                    callerName={knownCallerName}
                    callerEmail={knownCallerEmail}
                    callerPhone={knownCallerPhone}
                    leadId={leadData.leadId}
                    prospectId={leadData.prospectId}
                    onClose={() => setChatOpen(false)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => { setChatOpen(true); setVoiceOpen(false); }}
                  className="group flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-accent-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:px-4 sm:py-2.5"
                >
                  <div className="relative">
                    <MessageSquare className="h-4 w-4" />
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-accent" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold leading-tight sm:text-sm">{t("demo.chatWithAspen")}</p>
                    <p className="hidden text-[9px] opacity-80 sm:block">{t("demo.aiChat")}</p>
                  </div>
                </button>
              )}
            </DraggableFloating>

            <DraggableFloating initialX={24} initialY={window.innerHeight - 100} anchorRight={true}>
              {voiceOpen ? (
                <div className="w-[min(20rem,calc(100vw-3rem))] max-h-[60vh] overflow-y-auto animate-in slide-in-from-bottom-4 fade-in duration-300">
                  <GeminiAgentWidget autoStart leadId={leadData.leadId} prospectId={leadData.prospectId || prospectIdParam || undefined} businessName={siteName} callerName={knownCallerName} onClose={() => setVoiceOpen(false)} />
                </div>
              ) : (
                <button
                  onClick={() => { setVoiceOpen(true); setChatOpen(false); }}
                  className="group flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:px-4 sm:py-2.5"
                >
                  <div className="relative">
                    <Mic className="h-4 w-4" />
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold leading-tight sm:text-sm">{t("demo.talkToAspen")}</p>
                    <p className="hidden text-[9px] opacity-80 sm:block">{t("demo.aiVoice")}</p>
                  </div>
                </button>
              )}
            </DraggableFloating>
          </>
        )}

      </div>

    </div>
  );
};

export default DemoSite;
