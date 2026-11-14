import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Phone, ExternalLink, ShieldAlert } from "lucide-react";
import type { DemoLeadData } from "@/components/landing/demo-results/demoResultsUtils";
import { getImageSrc, getResponsiveScreenshotSrc, getSiteName, withCacheKey } from "@/components/landing/demo-results/demoResultsUtils";
import AspenDemoWidget from "@/components/landing/demo-results/AspenDemoWidget";
import WebsiteShowcase from "@/components/landing/demo-results/WebsiteShowcase";
import GeoGridWidget from "@/components/landing/demo-results/GeoGridWidget";
import RankAuditPanel from "@/components/landing/demo-results/RankAuditPanel";
import DemoWatermark from "@/components/landing/demo-results/DemoWatermark";
import ScanningAnimation from "@/components/landing/ScanningAnimation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { preloadVoiceIdentity } from "@/lib/voicePreload";
import { linkCampaignLead } from "@/lib/campaignTracking";
import { canPresentRawIframe, isCapturedCopyPreview, resolveConsentCoveredRoute, shouldHoldLoadingOverlay, shouldStartLiveView, shouldWaitForFreshLeadData, SCREENSHOT_LOAD_TIMEOUT_MS, LIVE_VIEW_LOAD_TIMEOUT_MS, PINNED_REVEAL_DEADLINE_MS } from "@/lib/demoStartup";
import { pinnedExampleSeedForLeadId } from "@/lib/pinnedExampleSeed";
import DemoVerificationGate from "@/components/landing/demo-results/DemoVerificationGate";
import DemoReassuranceStrip from "@/components/landing/DemoReassuranceStrip";
import {
  getDemoVerificationStatus,
  extractSpokenCode,
  clearDemoResume,
} from "@/lib/demoVerification";
import { rankAuditExamples } from "@/lib/rankAuditExamples";


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

      {/* No embedded Aspen assistant here: the demo's own widget (the
          pinned presenter) is the page's one assistant (FAIL 3 fix). */}
      <WebsiteShowcase leadData={leadData} hideEmbeddedAssistant />
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
  consent_banner_seen: boolean | null;
  consent_banner_dismissed: boolean | null;
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
  // First captured screenshot WINS for the whole session (2026-11-14,
  // Saperstein transient): when a later record merge swapped the base
  // URL, the <img> reset its loaded state and repainted — a black site
  // area plus the "BUILDING YOUR LIVE DEMO" curtain mid-demo. A rescan
  // still fills any variant that has not arrived yet; it just never
  // replaces one already on screen.
  screenshot: current.screenshot || record.website_screenshot || null,
  screenshotTablet: current.screenshotTablet || record.screenshot_tablet || null,
  screenshotMobile: current.screenshotMobile || record.screenshot_mobile || null,
  title: record.website_title || current.title || "",
  description: record.website_description || current.description || "",
  websiteContent: record.website_content || current.websiteContent || "",
  // Scan-time consent verdict (Publish #49 follow-up): sticky-true
  // within a visit — once the stored record says the capture saw a
  // banner, the demo stays on the covered route; a record that does
  // not carry the column yet (pre-migration RPC) simply leaves the
  // current value alone.
  consentBannerSeen: record.consent_banner_seen === true || current.consentBannerSeen || undefined,
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
  // Pinned one-click example: the client pinned maps know this leadId's
  // business name and URL, so seed the page synchronously — the real
  // name is on the first frame instead of a hostname/"Business"
  // placeholder while get_demo_lead is in flight, and the stored lead
  // record merges over this seed when it lands. An unknown leadId gets
  // no seed and follows the normal load path.
  const pinnedExampleSeed = pinnedExampleSeedForLeadId(searchParams.get("leadId"));
  const isPinnedExample = Boolean(pinnedExampleSeed);
  const [leadData, setLeadData] = useState<DemoLeadData | undefined>(
    latestLeadData ||
      (pinnedExampleSeed
        ? {
            ...buildSeedLeadData({
              websiteUrl: pinnedExampleSeed.websiteUrl,
              businessName: pinnedExampleSeed.businessName,
            }),
            // The pinned leadId rides the seed from the FIRST frame
            // (2026-11-14, Saperstein transient): without it the demo
            // widget derives its presenter from a leadId that only
            // arrives when the stored record merges, so the panel,
            // bubble and consent card all open as Aspen and flip to
            // the pinned presenter seconds later.
            leadId: searchParams.get("leadId") ?? undefined,
          }
        : undefined),
  );
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Verified Demo Gate: engaged only when the intake sent gate=1. The gate
  // activates at the reveal moment (scan done, preview about to show); while
  // waiting, the site stays blurred and Aspen runs the Act 1 host phase.
  const gateRequested = searchParams.get("gate") === "1";
  // Cold-email invite arrivals: the personal link already proved the
  // email server-side, so there is no code gate — Aspen runs the invite
  // host phase (greeting + explanation + continue) before the simulation.
  const inviteRequested = searchParams.get("invite") === "1";
  const sampleRequested = searchParams.get("sample") === "1";
  // Invite arrivals carry the lead this tab belongs to: persist it next to
  // the campaign visit so this demo's milestones attribute to the invited
  // lead in the outreach report. Only invite arrivals do this — ordinary
  // demo traffic keeps milestones unattributed, exactly as before.
  useEffect(() => {
    if (inviteRequested) linkCampaignLead(searchParams.get("leadId"));
  }, [inviteRequested, searchParams]);
  const gateChannelParam = (searchParams.get("gateChannel") === "sms" ? "sms" : "email") as "email" | "sms";
  const [gatePhase, setGatePhase] = useState<"inactive" | "waiting" | "verified">("inactive");
  const [gateWaiting, setGateWaiting] = useState(false);
  const [dictatedCode, setDictatedCode] = useState<string | null>(null);
  const gateCheckedRef = useRef<string | null>(null);
  // Website stays behind the progress overlay until Aspen's live session is prepared.
  const [assistantReady, setAssistantReady] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iframeFailureMode, setIframeFailureMode] = useState<"blocked" | "unreachable" | null>(null);
  // Consent verdict from check-iframe-embed (Publish #48 follow-up):
  // the embeddable site's HTML carries a cookie/privacy-banner
  // fingerprint, so the raw iframe's banner could never be dismissed
  // — the live presentation routes through the covered live view.
  // Publish #49 follow-up: this probe verdict is now the SECONDARY
  // signal. The primary witness is the stored scan flag on the lead
  // record (leadData.consentBannerSeen) — the capture pipeline saw
  // the real page even when the probe's datacenter fetch was walled
  // (Martinez). resolveConsentCoveredRoute applies the precedence.
  const [consentDetected, setConsentDetected] = useState(false);
  const [isIframeCheckPending, setIsIframeCheckPending] = useState(false);
  const [resolvedIframeUrl, setResolvedIframeUrl] = useState<string | null>(null);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [isLiveViewLoading, setIsLiveViewLoading] = useState(false);
  const [liveViewFailed, setLiveViewFailed] = useState(false);
  const [hasLiveViewLoaded, setHasLiveViewLoaded] = useState(false);
  const [hasIframeLoaded, setHasIframeLoaded] = useState(false);
  const [hasScreenshotLoaded, setHasScreenshotLoaded] = useState(false);
  // Distinct from "not loaded yet": the stored screenshot URL exists but the
  // image itself failed (e.g. an expired signed URL → 403). A failed
  // screenshot must release the Browserbase live view — see demoStartup.ts.
  const [hasScreenshotFailed, setHasScreenshotFailed] = useState(false);
  const liveViewSessionRef = useRef<string | null>(null);
  const startedScanLeadRef = useRef<string | null>(null);
  // Pinned-reveal deadline (Publish #43 regression round 2): mirrors
  // the derived reveal state so the one-shot deadline timer below can
  // read it at fire time without depending on render-scope values.
  const previewRevealedRef = useRef(false);
  const iframeLoadedRef = useRef(false);
  const pinnedDeadlineRef = useRef<string | null>(null);
  const pinnedDeadlineTimerRef = useRef<number | null>(null);
  const [prospectOwner, setProspectOwner] = useState<{name?: string; email?: string; phone?: string} | null>(null);
  const [showTestOverride, setShowTestOverride] = useState(false);
  const [testPhoneOverride, setTestPhoneOverride] = useState(() => {
    try { return localStorage.getItem("demo_test_phone_override") || ""; } catch { return ""; }
  });
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  const previewBarRef = useRef<HTMLDivElement>(null);
  const [previewBarHeight, setPreviewBarHeight] = useState(80);

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

  // Responsive-variant fallback (Publish #42 regression, 2026-11-14):
  // a stored tablet/mobile variant can be an EMPTY object (the Frank
  // pinned leads carry `…-tablet.undefined` URLs serving 200 text/plain
  // with 0 bytes), so the variant the picker serves at ≤820px errors
  // instantly while the desktop capture is perfectly good. When the
  // picked variant fails, retry ONCE with the desktop screenshot — the
  // canonical capture — before the screenshot counts as failed and the
  // demo surrenders to the live view / scan-content paths.
  const [brokenScreenshotSrc, setBrokenScreenshotSrc] = useState<string | null>(null);
  const pickedScreenshotSrc = getResponsiveScreenshotSrc(
    {
      screenshot: leadData?.screenshot,
      screenshotTablet: leadData?.screenshotTablet,
      screenshotMobile: leadData?.screenshotMobile,
    },
    viewportWidth,
  );
  const desktopScreenshotSrc = leadData?.screenshot ? getImageSrc(leadData.screenshot) : null;
  const responsiveScreenshotSrc =
    brokenScreenshotSrc !== null &&
    brokenScreenshotSrc === pickedScreenshotSrc &&
    desktopScreenshotSrc &&
    desktopScreenshotSrc !== pickedScreenshotSrc
      ? desktopScreenshotSrc
      : pickedScreenshotSrc;
  // True once the variant on screen IS the last resort (the desktop
  // capture, or the only variant stored): only its failure may mark
  // the screenshot failed — a lesser variant's failure just retries.
  const isFinalScreenshotVariant =
    !desktopScreenshotSrc || responsiveScreenshotSrc === desktopScreenshotSrc;
  // Cache key prefers the STABLE leadId over previewVersion
  // (record.updated_at): every poll merge during a scan used to change
  // the version, so the <img> src changed and the browser repainted
  // the preview black while it reloaded (2026-11-14 transient fix).
  const screenshotSrc = withCacheKey(
    responsiveScreenshotSrc,
    leadData?.leadId || leadData?.previewVersion || undefined,
  );

  useEffect(() => {
    setHasScreenshotLoaded(false);
    setHasScreenshotFailed(false);
  }, [responsiveScreenshotSrc]);

  // A stored screenshot that neither loads nor errors (stalled
  // connection) must not pin the loading curtain forever: after the
  // budget it counts as failed, which releases the Browserbase live
  // view and, failing that, the scan-content preview — never blackness.
  // A NON-final variant that stalls only loses its turn: the desktop
  // capture is tried next (see the variant fallback above).
  useEffect(() => {
    if (!responsiveScreenshotSrc || responsiveScreenshotSrc.startsWith("data:")) return;
    if (hasScreenshotLoaded || hasScreenshotFailed) return;
    const timer = window.setTimeout(() => {
      if (isFinalScreenshotVariant) {
        setHasScreenshotFailed(true);
      } else {
        setBrokenScreenshotSrc(responsiveScreenshotSrc);
      }
    }, SCREENSHOT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [responsiveScreenshotSrc, hasScreenshotLoaded, hasScreenshotFailed, isFinalScreenshotVariant]);

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
          // No name param: store the same host-derived name the seed
          // above displays (buildSeedLeadData → getSiteName) so the
          // stored lead matches what the visitor sees — never the bare
          // word "Business".
          _business_name: nameParam || getSiteName(urlParam),
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

  // Verified Demo Gate activation: once the scan settles, ask the backend
  // whether this lead still needs its code. Verified leads skip the gate.
  useEffect(() => {
    if (!gateRequested || !leadData?.leadId || isScanning || gatePhase !== "inactive") return;
    if (gateCheckedRef.current === leadData.leadId) return;
    gateCheckedRef.current = leadData.leadId;
    let cancelled = false;
    void getDemoVerificationStatus(leadData.leadId).then((status) => {
      if (cancelled) return;
      if (status.ok === true && status.verified) {
        setGatePhase("verified");
        clearDemoResume();
      } else {
        setGatePhase("waiting");
      }
    });
    return () => { cancelled = true; };
  }, [gateRequested, leadData?.leadId, isScanning, gatePhase]);

  // While the gate waits, a spoken 4-digit code in the visitor's transcript
  // fills the on-screen boxes (the gate component handles visual confirm).
  const handleGateTranscript = useCallback((text: string) => {
    if (gatePhase !== "waiting") return;
    const code = extractSpokenCode(text);
    if (code) setDictatedCode(code);
  }, [gatePhase]);

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
    setConsentDetected(false);
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

        setConsentDetected(data?.consentDetected === true);
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

  // When iframe is blocked, start a Browserbase live view session.
  // The same effect also serves the consent-covered route: an
  // embeddable site with a detected consent banner starts the covered
  // session so its banner is dismissed before the visitor sees the
  // page (Publish #48 follow-up, 2026-11-14).
  //
  // Publish #42 regression fix (2026-11-14): the previous shape set
  // isLiveViewLoading(true) inside the effect while ALSO listing it in
  // the effect's dependency array. The state flip re-ran the effect,
  // its cleanup set `cancelled = true`, and the in-flight session
  // result — an HTTP 200 answer, i.e. a success OR the quota body —
  // was silently discarded; the finally then refused to clear the
  // loading flag, so it wedged true forever and no retry could ever
  // start. Blocked-site demos whose screenshot also failed (the Frank
  // pinned demos at tablet/mobile widths, via their empty stored
  // variants) hung at the 88% curtain indefinitely.
  //
  // The attempt is now guarded by a ref keyed on the homepage URL: an
  // in-flight attempt is never cancelled by state flips or unrelated
  // dep changes, a settled attempt is never duplicated, and a result
  // is applied only while its site is still the current one
  // (liveViewSiteRef, kept fresh by the effect below).
  const liveViewInFlightRef = useRef<string | null>(null);
  const liveViewSiteRef = useRef<string | null>(null);
  useEffect(() => {
    liveViewSiteRef.current = leadData?.websiteUrl ? getHomepageUrl(leadData.websiteUrl) : null;
  }, [leadData?.websiteUrl]);

  useEffect(() => {
    if (!leadData?.websiteUrl) return;

    const homepageUrl = getHomepageUrl(leadData.websiteUrl);
    const embedOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const previewUrl = resolvedIframeUrl || homepageUrl;
    const requiresBrowserFallback =
      iframeFailureMode !== "unreachable" &&
      (iframeBlocked || isMixedContentPreview(previewUrl, embedOrigin));
    // Consent-covered route (Publish #48 follow-up): an embeddable
    // site whose HTML carries a consent banner starts the covered
    // live view even though the raw iframe would have worked — the
    // iframe's banner cannot be dismissed cross-origin. The stored
    // screenshot does NOT gate this start (it is only the interim
    // visual); see shouldStartLiveView in demoStartup.ts.
    // Publish #49 follow-up: the stored scan flag
    // (leadData.consentBannerSeen) is the primary witness and
    // outranks the probe — a TRUE flag starts the covered view even
    // when the probe calls the site unreachable, and when the flag
    // arrives mid-visit (this visit's own scan completing) this
    // effect re-runs on the flag dep and starts it then.
    const consentCoveredRoute = resolveConsentCoveredRoute(
      leadData?.consentBannerSeen === true,
      consentDetected,
      requiresBrowserFallback,
      iframeFailureMode === "unreachable",
    );

    if (!shouldStartLiveView(requiresBrowserFallback, Boolean(screenshotSrc), hasScreenshotFailed, consentCoveredRoute) || liveViewUrl || liveViewFailed) return;
    if (liveViewInFlightRef.current === homepageUrl) return;

    liveViewInFlightRef.current = homepageUrl;
    setIsLiveViewLoading(true);
    setLiveViewFailed(false);

    const startLiveView = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke("create-browser-session", {
            body: { url: homepageUrl },
          }),
          12000,
          "Live preview timed out",
        );

        if (error) throw error;
        // The visitor moved to a different site mid-flight: drop it.
        if (liveViewSiteRef.current !== homepageUrl) return;

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
        if (liveViewSiteRef.current === homepageUrl) {
          setLiveViewFailed(true);
        }
        // Silently fail — screenshot fallback is already showing
      } finally {
        if (liveViewInFlightRef.current === homepageUrl) {
          liveViewInFlightRef.current = null;
        }
        if (liveViewSiteRef.current === homepageUrl) {
          setIsLiveViewLoading(false);
        }
      }
    };

    void startLiveView();
  }, [consentDetected, hasScreenshotFailed, iframeBlocked, iframeFailureMode, leadData?.consentBannerSeen, leadData?.websiteUrl, liveViewFailed, liveViewUrl, resolvedIframeUrl, screenshotSrc]);

  // A live view session that was created but whose iframe never loads
  // (stalled Browserbase page, blocked third-party frame) must not
  // hold the demo curtain either: after the budget it counts as
  // failed, which settles the demo on the screenshot / scan content.
  useEffect(() => {
    if (!liveViewUrl || hasLiveViewLoaded || liveViewFailed) return;
    const timer = window.setTimeout(() => {
      setLiveViewFailed(true);
    }, LIVE_VIEW_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [liveViewUrl, hasLiveViewLoaded, liveViewFailed]);

  // HARD REVEAL DEADLINE for pinned examples (Publish #43 regression
  // round 2, 2026-11-14): armed ONCE per pinned lead, shortly after
  // mount. If the demo still has not revealed when it fires, every
  // preview gate is force-settled — the iframe counts as blocked,
  // the screenshot and the live view count as failed — and the
  // stored record is pulled once more in case the first fetch is
  // the thing that hung. Combined with the stored-content reveal in
  // the derived state below, a pinned demo whose record exists
  // cannot sit behind the building curtain past this deadline, no
  // matter how the scan, the live-view provider, the target site's
  // iframe, or the voice warm-up behave. The timer deliberately has
  // no cleanup on dep changes (a record merge re-runs this effect
  // and must not disarm it); it is cleared on unmount only.
  useEffect(() => {
    if (!isPinnedExample) return;
    const key = leadIdParam || leadData?.leadId;
    if (!key || pinnedDeadlineRef.current === key) return;
    pinnedDeadlineRef.current = key;
    pinnedDeadlineTimerRef.current = window.setTimeout(() => {
      if (previewRevealedRef.current) return;
      setIsIframeCheckPending(false);
      setIsScanning(false);
      if (!iframeLoadedRef.current) {
        setIframeBlocked(true);
        setIframeFailureMode("blocked");
      }
      setHasScreenshotFailed(true);
      setLiveViewFailed(true);
      setIsLiveViewLoading(false);
      void (supabase as any)
        .rpc("get_demo_lead", { _lead_id: key })
        .maybeSingle()
        .then(({ data, error }: { data: DemoLeadRecord | null; error: unknown }) => {
          if (!error && data) {
            setLeadData((current) => (current ? mergeLeadRecordIntoDemoData(data, current) : current));
          }
        })
        .catch(() => {
          // The stored-content reveal fires when any fetch lands;
          // a failed deadline refetch changes nothing on screen.
        });
    }, PINNED_REVEAL_DEADLINE_MS);
  }, [isPinnedExample, leadIdParam, leadData?.leadId]);

  useEffect(() => {
    return () => {
      if (pinnedDeadlineTimerRef.current) {
        window.clearTimeout(pinnedDeadlineTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setHasIframeLoaded(false);
  }, [resolvedIframeUrl]);

  useEffect(() => {
    setHasLiveViewLoaded(false);
  }, [liveViewUrl]);

  // A slow permitted iframe must not hide an already captured website indefinitely.
  // Consent-covered route exempt: there the raw iframe is DELIBERATELY
  // unmounted while the covered live view starts (its own 15s load
  // budget governs), so "iframe never loaded" is the expected state,
  // not a slow iframe — marking the site blocked would kill the
  // covered route mid-start and falsely earn the captured-copy note.
  useEffect(() => {
    if (isScanning || isIframeCheckPending || iframeBlocked || hasIframeLoaded || !resolvedIframeUrl) return;
    // Any consent evidence — the probe's fingerprint OR the stored
    // scan flag — exempts the site: on the covered route the raw
    // iframe is deliberately unmounted while the covered view starts.
    if ((consentDetected || leadData?.consentBannerSeen === true) && iframeFailureMode === null) return;
    const timer = window.setTimeout(() => {
      setIframeBlocked(true);
      setIframeFailureMode("blocked");
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [consentDetected, leadData?.consentBannerSeen, isScanning, isIframeCheckPending, iframeBlocked, iframeFailureMode, hasIframeLoaded, resolvedIframeUrl]);

  const maskGateEmail = (email?: string) => {
    if (!email) return "your email";
    const [user, domain] = email.split("@");
    return domain ? `${(user || "").slice(0, 1)}•••@${domain}` : "your email";
  };

  // Unverified escape hatch: a generic sample demo instead of their own site.
  const startSampleDemo = () => {
    const sample = rankAuditExamples[0];
    if (!sample) return;
    navigate(`/demo-site?url=${encodeURIComponent(sample.website)}&name=${encodeURIComponent(sample.name)}`);
  };

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
  // Pinned examples are exempt from this wait (see shouldWaitForFreshLeadData
  // in demoStartup.ts): their record is keyed by the pinned leadId, so a
  // homepage mismatch is an entry-link alias/vanity host vs the record's
  // canonical host, never the wrong site — and this early return renders
  // ABOVE the pinned reveal machinery, so holding here would hang a pinned
  // demo forever.
  const isWaitingForFreshLeadData = shouldWaitForFreshLeadData(
    requestedDemoHomepage,
    currentLeadHomepage,
    Boolean(latestLeadData),
    isPinnedExample,
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
  // Consent-covered route (Publish #48 follow-up): embeddable site +
  // detected consent banner → the covered live view is the live
  // presentation and the raw iframe is held back as the last resort
  // (canPresentRawIframe releases it only when the covered view has
  // failed). See demoStartup.ts for the routing rationale.
  // Publish #49 follow-up: the stored scan flag is the primary
  // witness — TRUE routes covered even when the probe verdict is
  // "unreachable" (its datacenter fetch was walled; the visitor's
  // browser and the covered view can still load the site).
  const consentCoveredRoute = resolveConsentCoveredRoute(
    leadData?.consentBannerSeen === true,
    consentDetected,
    requiresBrowserFallback,
    isWebsiteUnreachable,
  );
  const canRenderInlineIframe = Boolean(
    resolvedIframeUrl && !isIframeCheckPending && !requiresBrowserFallback && !isWebsiteUnreachable,
  ) && canPresentRawIframe(consentCoveredRoute, liveViewFailed);
  const isGeneratedScreenshot = typeof screenshotSrc === "string" && screenshotSrc.startsWith("data:image/svg+xml");
  const isLivePreviewReady = Boolean(liveViewUrl && hasLiveViewLoaded && !isGeneratedScreenshot);
  // Protected-site note (owner request, 2026-11-09, after the Great Gulf
  // demo): the site forbids embedding, so the demo can only show the
  // captured copy — say so honestly instead of leaving the visitor to
  // wonder why links and pages don't behave like the real site. Only the
  // blocked-verdict + stored-screenshot state earns the note; the SVG
  // placeholder is generated by us, not a capture of their site.
  const showCapturedCopyNote = Boolean(
    !isGeneratedScreenshot &&
    isCapturedCopyPreview(iframeFailureMode, Boolean(screenshotSrc), hasScreenshotFailed, isLivePreviewReady),
  );
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
  // PINNED EXAMPLES are exempt (2026-11-14): their preview + presenter
  // are pre-captured, so a background rescan of the record (e.g. the
  // weekly example refresh landing mid-visit) must never re-raise the
  // curtain or unmount the widget — both were the Saperstein flash.
  const shouldHoldScanningState = isScanning && !isPinnedExample;
  const hasGeneratedPreviewData = Boolean(
    (leadData.websiteContent && leadData.websiteContent.trim().length > 40) ||
    (leadData.description && leadData.description.trim().length > 24) ||
    (leadData.title && leadData.title.trim().length > 3),
  );
  // PINNED FALLBACK REVEAL (Publish #42 regression, 2026-11-14): a
  // pinned example's stored scan content is a real preview the moment
  // the record has merged — the demo must reveal on it rather than
  // wait for the screenshot chain or the Browserbase live view. Both
  // were able to stall indefinitely (empty stored screenshot variants;
  // a live-view session whose result never landed), which held the
  // 88% curtain forever on the Frank pinned demos while this very
  // fallback sat rendered behind it.
  const pinnedFallbackReady =
    isPinnedExample &&
    (requiresBrowserFallback || isWebsiteUnreachable) &&
    hasGeneratedPreviewData;
  // PINNED STORED-CONTENT REVEAL (Publish #43 regression round 2,
  // 2026-11-14): the round-1 fallback reveal above only armed AFTER
  // the demo entered a fallback state — which itself waits on the
  // iframe-embed check or the 8s slow-iframe rescue timer. For an
  // EMBEDDABLE pinned site (both Frank demos' chain in the live
  // re-verify), the reveal stayed chained to the target iframe's
  // load event or a multi-megabyte screenshot download: on a slow
  // network, or in a tab whose timers are throttled, the curtain
  // outlived three minutes with the scan content already rendered
  // behind it. A pinned example's stored content is a complete
  // preview on EVERY path, so once the record has merged the demo
  // reveals on it immediately; the iframe, screenshot and live view
  // still take over when they arrive.
  //
  // The content test deliberately reads ONLY the record-sourced
  // fields (websiteContent / description): the pinned seed's title
  // is the business name, present from the first frame, so the
  // title arm of hasGeneratedPreviewData would make this fire
  // before the stored record has actually arrived.
  const pinnedStoredContentReady =
    isPinnedExample &&
    Boolean(
      (leadData.websiteContent && leadData.websiteContent.trim().length > 40) ||
      (leadData.description && leadData.description.trim().length > 24),
    );
  const isPreviewLoading =
    shouldHoldScanningState ||
    (isInlinePreviewLoading && !pinnedStoredContentReady) ||
    (requiresBrowserFallback && !liveViewFailed && !isStaticPreviewReady && !isLivePreviewReady && !pinnedFallbackReady) ||
    // Consent-covered route: while the covered view spins up, the
    // curtain waits on the same surfaces as the fallback arm — the
    // stored screenshot or the covered view itself. The pinned
    // stored-content reveal bypasses it exactly like the other arms,
    // so a pinned banner site (Martinez) still reveals instantly on
    // its stored content and the covered view swaps in when ready.
    (consentCoveredRoute && !liveViewFailed && !isStaticPreviewReady && !isLivePreviewReady && !pinnedStoredContentReady);
  const isPreviewAvailable =
    (!requiresBrowserFallback && !isWebsiteUnreachable && hasIframeLoaded) ||
    isLivePreviewReady ||
    isStaticPreviewReady;
  const isScanPreviewReady =
    (!isScanning || pinnedStoredContentReady) && !isPreviewAvailable && hasGeneratedPreviewData;
  const hasAnyPreview = !isPreviewLoading && (isPreviewAvailable || isScanPreviewReady);
  // Mirrors for the pinned reveal deadline (declared with the hooks
  // above, which cannot read these render-scope values at fire time).
  previewRevealedRef.current = hasAnyPreview;
  iframeLoadedRef.current = hasIframeLoaded;
  const isScanFailed = !isScanning && !hasGeneratedPreviewData && !isPreviewAvailable && !isPreviewLoading;

  return (
    <div className="relative min-h-[100dvh] bg-background">
      <header className="relative z-40" aria-label="Business demo header">
        <div ref={previewBarRef} className="border-b border-border bg-card px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => navigate("/")} aria-label="Back to homepage" title="Homepage"><ArrowLeft className="h-4 w-4" /></Button>
            <a href={homepageUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1" title={`Open ${siteName} website`}>
              <span className="block text-[10px] font-semibold text-primary">Simulation preview {isScanning && "· Learning…"}</span>
              <span className="block truncate text-xs font-semibold text-foreground">{siteName}</span>
            </a>
            <LanguageSwitcher variant="full" className="h-8 shrink-0" />
            <Button asChild size="sm" className="h-8 shrink-0 text-xs"><a href="/plans" target="_blank" rel="noopener noreferrer"><span className="sm:hidden">Install</span><span className="hidden sm:inline">Get the install code</span><ExternalLink className="ml-1 h-3 w-3" /></a></Button>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <p className="shrink-0 text-[10px] leading-tight text-muted-foreground"><span className="sm:hidden">Original site unchanged</span><span className="hidden sm:inline">Your real website is not changed.</span></p>
            {/* "Not hacked" reassurance — Dennis's rule (2026-11-09): the
                one-line note on its own is not enough; the strong version
                must be seen before the first tap. Folded into THIS row on
                the owner's slimming ask (2026-11-09): the strip renders
                as one slim pill level with the note, and its full line
                opens as a dropdown anchored under it — the header stays
                two rows tall, not three. */}
            <DemoReassuranceStrip compact />
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <RankAuditPanel businessName={searchParams.get("auditBusiness") || leadData.businessName || siteName} city={searchParams.get("city") || undefined} niche={leadData.niche} websiteUrl={leadData.websiteUrl} initialKeyword={searchParams.get("keyword") || undefined} initialMode={searchParams.get("auditMode") === "nationwide" ? "nationwide" : "maps"} compact />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setShowTestOverride(v => !v)} title="Test phone override" aria-label="Test phone override"><Phone className="h-3 w-3" /></Button>
            </div>
          </div>
          {/* Protected-site note: this site blocks live embedding, so the
              demo runs on the captured copy — honest, one slim line,
              directly under the folded reassurance row. */}
          {showCapturedCopyNote && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-tight text-muted-foreground">
              <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t("tryDemo.capturedCopyNote")}</span>
            </p>
          )}
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
      </header>

      {/* Website — iframe first, screenshot fallback. On the consent-covered
          route the order inverts: covered live view first, raw iframe only
          as the last resort once the covered view has failed. */}
      {hasAnyPreview && <DemoWatermark />}
      <div className="relative" style={{ minHeight: `calc(100dvh - ${previewBarHeight}px)` }}>
        {/* While the verification gate waits, the prospect's site stays visible but blurred and inert behind the bright widget. */}
        <div className={gatePhase === "waiting" ? "pointer-events-none select-none blur-[6px]" : undefined}>
        {canRenderInlineIframe && (
          <iframe
            src={livePreviewUrl}
            className="w-full border-0"
            style={{ height: `calc(100dvh - ${previewBarHeight}px)`, minHeight: 320 }}
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
        {/* Iframe blocked → try Browserbase live view, then screenshot fallback.
            The consent-covered route renders through this same container:
            the banner-free screenshot is the interim visual and the covered
            live view fades in over it. Once the covered view has failed and
            the last-resort raw iframe has loaded, the container steps aside
            (!hasIframeLoaded) so no empty full-height block trails the page. */}
        {(requiresBrowserFallback || shouldShowScreenshotFallback || (consentCoveredRoute && !hasIframeLoaded)) && (
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
                  onLoad={() => {
                    setHasScreenshotLoaded(true);
                    setHasScreenshotFailed(false);
                  }}
                  onError={() => {
                    setHasScreenshotLoaded(false);
                    // A lesser responsive variant failing (e.g. an
                    // empty stored tablet capture) retries with the
                    // desktop screenshot; only the final variant's
                    // failure marks the screenshot failed.
                    if (isFinalScreenshotVariant) {
                      setHasScreenshotFailed(true);
                    } else if (responsiveScreenshotSrc) {
                      setBrokenScreenshotSrc(responsiveScreenshotSrc);
                    }
                  }}
                />
              </div>
            )}

            {(requiresBrowserFallback || consentCoveredRoute) && liveViewUrl && !isGeneratedScreenshot && (consentCoveredRoute || !hasScreenshotAsset || hasScreenshotFailed) && (
              <iframe
                src={liveViewUrl}
                className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${hasLiveViewLoaded ? "opacity-100" : "opacity-0"}`}
                style={{ height: `calc(100dvh - ${previewBarHeight}px)`, minHeight: 320 }}
                title={`${siteName} website (live view)`}
                allow="clipboard-read; clipboard-write"
                onLoad={() => setHasLiveViewLoaded(true)}
                onError={() => setLiveViewFailed(true)}
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

        </div>

        {shouldHoldLoadingOverlay(isPreviewLoading, hasAnyPreview, assistantReady, isPinnedExample) && <DemoLoadingState websiteUrl={homepageUrl} businessName={siteName} overlay />}

        {/* ===== Local Google Maps Geo-Grid Blind-Spot Diagnostic ===== */}
        {hasAnyPreview && (
          <GeoGridWidget
            businessName={siteName}
            websiteUrl={homepageUrl}
            defaultKeyword={leadData.niche && leadData.niche !== "general" ? `${leadData.niche} near me` : ""}
            onVoiceCall={() => { setVoiceOpen(true); }}
            onBookCall={() => navigate("/#pricing")}
          />
        )}

        {hasAnyPreview && <AspenDemoWidget
          // Keyed on the NORMALIZED homepage URL, not the raw stored
          // websiteUrl: a record merge that only changed the URL's
          // spelling (trailing slash, tracking params) used to remount
          // the whole widget and reset the live session (2026-11-14).
          key={homepageUrl + (gateRequested ? `:${gatePhase}` : "")}
          businessName={siteName}
          businessNiche={leadData.niche || "general"}
          websiteUrl={homepageUrl}
          businessInfo={leadData.websiteContent || leadData.description || ""}
          ownerName={followUpName}
          callerName={knownCallerName}
          callerEmail={knownCallerEmail}
          callerPhone={knownCallerPhone}
          leadId={leadData.leadId || leadIdParam || undefined}
          prospectId={leadData.prospectId || prospectIdParam || undefined}
          voiceRequested={voiceOpen}
          onClosed={() => setVoiceOpen(false)}
          onAssistantReady={() => setAssistantReady(true)}
          verification={gatePhase === "waiting" ? "pending" : gatePhase === "verified" ? "verified" : undefined}
          invite={inviteRequested}
          sample={sampleRequested}
          onUserTranscript={gateRequested ? handleGateTranscript : undefined}
          gateWaiting={gateWaiting}
        />}

        {/* Verified Demo Gate — the reveal-moment code card, bright over the blurred site */}
        {gatePhase === "waiting" && hasAnyPreview && leadData.leadId && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center overflow-y-auto px-3 pt-24 sm:pt-28">
            <div className="pointer-events-auto w-full max-w-md">
              <DemoVerificationGate
                leadId={leadData.leadId}
                businessName={siteName}
                channel={gateChannelParam}
                maskedTarget={searchParams.get("gateTarget") || maskGateEmail(leadData.email)}
                websiteUrl={homepageUrl}
                dictatedCode={dictatedCode}
                onVerified={() => { setGatePhase("verified"); clearDemoResume(); }}
                onSampleDemo={startSampleDemo}
                onWaitingChange={setGateWaiting}
              />
            </div>
          </div>
        )}

      </div>

    </div>
  );
};

export default DemoSite;
