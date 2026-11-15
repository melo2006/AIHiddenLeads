import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { pendingScanProgress } from "@/lib/demoStartup";
import {
  CheckCircle,
  Globe,
  MessageSquare,
  MessagesSquare,
  Mic,
  PhoneCall,
  Sparkles,
  Search,
  CalendarCheck,
  Headphones,
  Video,
  LayoutDashboard,
  Timer,
} from "lucide-react";
import aspenFace from "@/assets/aspen-video-frame-final.webp";
import frankFace from "@/assets/simli/b3f85f7f-57ea-4f24-b1f6-a57229b4fae1.webp";
import saraFace from "@/assets/simli/f735e62c-dce7-4c0b-8e85-1c7e21774c45.webp";

const scanSteps = [
  {
    icon: Search,
    key: "content",
  },
  {
    icon: Globe,
    key: "presence",
  },
  {
    icon: Mic,
    key: "voice",
  },
  {
    icon: MessageSquare,
    key: "chat",
  },
  {
    icon: PhoneCall,
    key: "transfer",
  },
  {
    icon: Sparkles,
    key: "final",
  },
] as const;

/**
 * The six feature cards that sell while the visitor waits (Publish #73,
 * owner's directive 2026-11-15: the ~2-minute scan wait is a captive
 * audience — use it). ALL six are on screen at once in a grid; a soft
 * highlight cycles through them so the eye keeps moving without any
 * card ever being hidden. Order is the agreed selling order: video
 * spokesperson first, the under-two-minutes proof last. Card copy is
 * presenter-neutral — these cards also appear during Frank / Monica /
 * Denise demos — with ONE deliberate exception: the video card's
 * avatar row names the avatar LIBRARY (Aspen / Frank / Sara + more),
 * because "pick your face" is the product feature being sold there,
 * not the current presenter introducing herself.
 */
const featureCards = [
  {
    icon: Video,
    key: "videoAvatar",
  },
  {
    icon: MessagesSquare,
    key: "conversation",
  },
  {
    icon: LayoutDashboard,
    key: "dashboard",
  },
  {
    icon: CalendarCheck,
    key: "appointments",
  },
  {
    icon: Headphones,
    key: "warmTransfer",
  },
  {
    icon: Timer,
    key: "readyFast",
  },
] as const;

/** The avatar-library row on the video card: the current approved
 * Aspen portrait plus the catalog faces for Frank and Sara. */
const AVATAR_ROW = [
  { name: "Aspen", image: aspenFace },
  { name: "Frank", image: frankFace },
  { name: "Sara", image: saraFace },
] as const;

const STEP_DURATION = 2200;
const FEATURE_HIGHLIGHT_DURATION = 4500;

interface ScanningAnimationProps {
  websiteUrl: string;
  businessName?: string;
  callerName?: string;
  onComplete: () => void;
  onCancel?: () => void;
  mode?: "timed" | "continuous";
  /**
   * Detected site language (Publish #66): when the demo's scanned site
   * is published in a language the visitor did NOT explicitly pick with
   * the site switch, the caller passes it here and every scan/build
   * message renders in that language (e.g. "pt-BR" for a Brazilian
   * site). Undefined = render in the UI locale, exactly as before.
   */
  language?: string;
}

const getWebsiteLabel = (websiteUrl: string) => {
  try {
    const normalizedUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    return new URL(normalizedUrl).hostname.replace(/^www\./, "");
  } catch {
    return websiteUrl;
  }
};

const getFirstName = (fullName?: string) => {
  if (!fullName?.trim()) return "";
  return fullName.trim().split(/\s+/)[0];
};

const ScanningAnimation = ({
  websiteUrl,
  businessName,
  callerName,
  onComplete,
  onCancel,
  mode = "timed",
  language,
}: ScanningAnimationProps) => {
  const { t } = useTranslation();
  // Every message goes through tt so the optional detected language
  // applies uniformly; with language undefined, lng is ignored and the
  // rendering is the UI locale, byte-identical to before Publish #66.
  const tt = (key: string, options?: Record<string, unknown>) =>
    t(key, { ...options, lng: language });
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Scan step progression
  useEffect(() => {
    setCurrentStep(0);
    setProgress(0);

    if (mode === "continuous") {
      const startedAt = Date.now();
      const intervalId = window.setInterval(() => {
        setCurrentStep((prev) => (prev + 1) % scanSteps.length);
      }, STEP_DURATION);
      const progressId = window.setInterval(() => {
        setProgress(pendingScanProgress(Date.now() - startedAt));
      }, 120);

      return () => {
        window.clearInterval(intervalId);
        window.clearInterval(progressId);
      };
    }

    let stepTimeout: number | undefined;
    let progressInterval: number | undefined;
    let elapsed = 0;
    const totalDuration = scanSteps.length * STEP_DURATION;

    progressInterval = window.setInterval(() => {
      elapsed += 50;
      setProgress(Math.min((elapsed / totalDuration) * 100, 100));
    }, 50);

    const advanceSteps = (stepIndex: number) => {
      if (stepIndex >= scanSteps.length) {
        if (progressInterval) window.clearInterval(progressInterval);
        setProgress(100);
        window.setTimeout(() => onCompleteRef.current(), 400);
        return;
      }
      setCurrentStep(stepIndex);
      stepTimeout = window.setTimeout(() => advanceSteps(stepIndex + 1), STEP_DURATION);
    };

    advanceSteps(0);

    return () => {
      if (stepTimeout) window.clearTimeout(stepTimeout);
      if (progressInterval) window.clearInterval(progressInterval);
    };
  }, [businessName, mode, websiteUrl]);

  // Feature-card highlight cycle: all six cards stay visible; only the
  // highlight moves, so nothing a visitor is mid-read on ever vanishes.
  useEffect(() => {
    setActiveFeature(0);
    const id = window.setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % featureCards.length);
    }, FEATURE_HIGHLIGHT_DURATION);
    return () => window.clearInterval(id);
  }, []);

  const activeStep = scanSteps[currentStep] ?? scanSteps[0];
  const websiteLabel = getWebsiteLabel(websiteUrl);
  const displayName = businessName?.trim() || websiteLabel;
  const firstName = getFirstName(callerName);
  const isComplete = mode === "timed" && progress >= 100;
  const StepIcon = isComplete ? CheckCircle : activeStep.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 sm:gap-5"
    >
      {/* Personalized greeting */}
      <div className="w-full text-center">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg font-bold text-foreground sm:text-xl"
        >
          {firstName ? tt("scan.greetingWithName", { name: firstName }) : tt("scan.greeting")}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm"
        >
          {tt("scan.buildingPrefix")} {" "}
          <span className="font-semibold text-foreground">{displayName}</span> {tt("scan.withAi")}
          {tt("scan.buildingSuffix")}
        </motion.p>
      </div>

      {/* Main scanner card — the TRUTHFUL progress block (real scan
          steps + real progress), kept visually distinct from the
          feature grid below: this card reports, the grid sells. */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card/95 px-4 py-5 shadow-xl sm:rounded-3xl sm:px-6 sm:py-6">
        {/* Glow */}
        <div className="absolute left-1/2 top-0 h-20 w-20 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl" />

        <div className="relative flex flex-col items-center text-center">
          {/* Eyebrow */}
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-primary sm:text-[10px]">
            {tt("scan.eyebrow")}
          </p>

          {/* Business name */}
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {displayName}
          </h2>
          {displayName.toLowerCase() !== websiteLabel.toLowerCase() && (
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              {websiteLabel}
            </p>
          )}

          {/* Animated icon */}
          <div className="relative mt-4 flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
            <motion.div
              animate={{ scale: [1, 1.12, 1], opacity: [0.2, 0.45, 0.2] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-primary/10 blur-xl"
            />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-dashed border-primary/20"
            />
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="relative flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-background/90 shadow-md sm:h-14 sm:w-14"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <StepIcon className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Step label + detail */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-3"
            >
              <p className="text-sm font-semibold text-foreground sm:text-base">
                {isComplete ? tt("scan.readyTitle") : tt(`scan.steps.${activeStep.key}.label`)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {isComplete
                  ? tt("scan.readyDetail")
                  : tt(`scan.steps.${activeStep.key}.detail`)}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Progress bar */}
          <div className="mt-4 w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: "0%" }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">
              {isComplete ? tt("scan.complete") : tt("scan.progress", { progress: Math.round(progress) })}
            </p>
          </div>

          {/* Cancel button */}
          {onCancel && !isComplete && (
            <button
              onClick={onCancel}
              className="mt-4 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              {tt("scan.stop")}
            </button>
          )}
        </div>
      </div>

      {/* Feature grid — the captive-wait sell (Publish #73): all six
          cards on screen at once, bigger icons, real visual weight.
          A soft highlight cycles through them; no card is ever hidden. */}
      <div className="w-full">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
          {tt("scan.featuresTitle")}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {featureCards.map(({ key, icon: Icon }, i) => {
            const highlighted = i === activeFeature;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15 + i * 0.08 }}
                className={`rounded-2xl border px-4 py-3.5 text-left backdrop-blur-sm transition-all duration-500 ${
                  highlighted
                    ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/10"
                    : "border-border/60 bg-card/70"
                }`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <p className="mt-2.5 text-sm font-bold leading-snug text-foreground">
                  {tt(`scan.benefits.${key}.headline`)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {tt(`scan.benefits.${key}.body`)}
                </p>
                {key === "videoAvatar" && (
                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="flex -space-x-2.5">
                      {AVATAR_ROW.map(({ name, image }) => (
                        <img
                          key={name}
                          src={image}
                          alt={name}
                          width={72}
                          height={72}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="h-9 w-9 rounded-full object-cover object-top ring-2 ring-background"
                        />
                      ))}
                    </div>
                    <p className="text-[11px] font-medium leading-tight text-foreground/80">
                      {tt("scan.benefits.videoAvatar.avatarsNote")}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* CTA to talk to sales */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="text-center text-[10px] text-muted-foreground/70 sm:text-xs"
      >
        {tt("scan.questionsPrefix")} {" "}
        <span className="font-semibold text-primary">{tt("scan.transferSpecialist")}</span>{" "}
        {tt("scan.questionsSuffix")}
      </motion.p>
    </motion.div>
  );
};

export default ScanningAnimation;
