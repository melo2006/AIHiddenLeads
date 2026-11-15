import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { pendingScanProgress } from "@/lib/demoStartup";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
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
 * The six feature cards that sell while the visitor waits. Order is
 * the agreed selling order: video spokesperson first, the
 * under-two-minutes proof last. Card copy is presenter-neutral —
 * these cards also appear during Frank / Monica / Denise demos —
 * with ONE deliberate exception: the video card's avatar row names
 * the avatar LIBRARY (Aspen / Frank / Sara + more), because "pick
 * your face" is the product feature being sold there, not the
 * current presenter introducing herself.
 *
 * Presentation history: the 2026-11-14 deck rotated one small card
 * at a time; Publish #73 (2026-11-15) replaced that with a six-card
 * GRID — all six on screen at once. The owner tested #73 on his
 * phone and rejected the grid the same day: too many cards, too much
 * text, the scan screen ran far past one screen and forced
 * scrolling. Publish #77 is his correction: a ROTATING HERO — one
 * big card on screen at a time, auto-rotating, with dots + arrows
 * to browse — so the whole scan state (greeting + truthful progress
 * + hero) fits ONE screen, phone and desktop, with no scrolling.
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
const FEATURE_ROTATE_DURATION = 4500;
/** After any interaction (tap, dot, arrow, hover, focus) the
 * rotation stays paused this long before it resumes on its own. */
const FEATURE_RESUME_DELAY = 10000;

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
  const [direction, setDirection] = useState(1);
  const [rotationPaused, setRotationPaused] = useState(false);
  const resumeTimerRef = useRef<number | undefined>(undefined);
  const onCompleteRef = useRef(onComplete);
  const reduceMotion = useReducedMotion();

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

  // Rotating hero (Publish #77): exactly ONE feature card is on
  // screen at a time. It auto-rotates every FEATURE_ROTATE_DURATION;
  // any interaction pauses the rotation, which resumes after
  // FEATURE_RESUME_DELAY. A visitor who prefers reduced motion gets
  // no auto-rotation at all — the dots and arrows still work.
  const pauseRotation = useCallback(() => {
    setRotationPaused(true);
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(
      () => setRotationPaused(false),
      FEATURE_RESUME_DELAY,
    );
  }, []);

  useEffect(() => () => window.clearTimeout(resumeTimerRef.current), []);

  useEffect(() => {
    if (rotationPaused || reduceMotion) return;
    const id = window.setInterval(() => {
      setDirection(1);
      setActiveFeature((prev) => (prev + 1) % featureCards.length);
    }, FEATURE_ROTATE_DURATION);
    return () => window.clearInterval(id);
  }, [rotationPaused, reduceMotion]);

  const goToFeature = (index: number) => {
    const next =
      ((index % featureCards.length) + featureCards.length) % featureCards.length;
    setDirection(next >= activeFeature ? 1 : -1);
    setActiveFeature(next);
    pauseRotation();
  };

  const stepFeature = (delta: 1 | -1) => {
    setDirection(delta);
    setActiveFeature(
      (prev) => (prev + delta + featureCards.length) % featureCards.length,
    );
    pauseRotation();
  };

  const handleHoverStart = () => {
    window.clearTimeout(resumeTimerRef.current);
    setRotationPaused(true);
  };

  const handleHoverEnd = () => {
    setRotationPaused(false);
  };

  const activeStep = scanSteps[currentStep] ?? scanSteps[0];
  const activeCard = featureCards[activeFeature] ?? featureCards[0];
  const ActiveCardIcon = activeCard.icon;
  const websiteLabel = getWebsiteLabel(websiteUrl);
  const displayName = businessName?.trim() || websiteLabel;
  const firstName = getFirstName(callerName);
  const isComplete = mode === "timed" && progress >= 100;
  const StepIcon = isComplete ? CheckCircle : activeStep.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-3 px-4 sm:gap-4"
    >
      {/* Personalized greeting */}
      <div className="w-full text-center">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base font-bold text-foreground sm:text-lg"
        >
          {firstName ? tt("scan.greetingWithName", { name: firstName }) : tt("scan.greeting")}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm"
        >
          {tt("scan.buildingPrefix")} {" "}
          <span className="font-semibold text-foreground">{displayName}</span> {tt("scan.withAi")}
          {tt("scan.buildingSuffix")}
        </motion.p>
      </div>

      {/* Slim progress strip — the TRUTHFUL progress block (real scan
          steps + real progress), kept visually distinct from the hero
          card below: this strip reports, the hero sells. Publish #77
          slimmed the old full scanner card down to this strip so the
          scan state fits one screen; the step logic and progress math
          above are untouched. */}
      <div
        data-testid="scan-progress"
        className="relative w-full overflow-hidden rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl sm:px-5"
      >
        {/* Glow */}
        <div className="absolute left-1/2 top-0 h-16 w-16 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl" />

        <div className="relative flex items-center gap-3 text-left">
          {/* Animated step icon */}
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.12, 1], opacity: [0.2, 0.45, 0.2] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-primary/10 blur-md"
            />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-background/90 shadow-md">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-center"
                >
                  <StepIcon className="h-5 w-5 text-primary" />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Step label + detail */}
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <p className="truncate text-sm font-semibold text-foreground">
                  {isComplete ? tt("scan.readyTitle") : tt(`scan.steps.${activeStep.key}.label`)}
                </p>
                <p className="line-clamp-2 h-8 text-xs leading-4 text-muted-foreground">
                  {isComplete
                    ? tt("scan.readyDetail")
                    : tt(`scan.steps.${activeStep.key}.detail`)}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Progress bar + status line */}
        <div className="relative mt-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[10px] font-medium text-muted-foreground">
              {isComplete ? tt("scan.complete") : tt("scan.progress", { progress: Math.round(progress) })}
            </p>
            {onCancel && !isComplete && (
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 text-[11px] font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
              >
                {tt("scan.stop")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rotating feature hero — the captive-wait sell (Publish #77):
          ONE big card at a time, auto-rotating, with dots + arrows.
          The shell keeps a fixed height so the controls never jump
          and the whole scan state stays on one screen. */}
      <div className="w-full">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
          {tt("scan.featuresTitle")}
        </p>
        <div
          data-testid="scan-feature-rotator"
          className="mt-2.5"
          onPointerDown={pauseRotation}
          onMouseEnter={handleHoverStart}
          onMouseLeave={handleHoverEnd}
          onFocus={pauseRotation}
        >
          <div className="relative h-[320px] overflow-hidden rounded-3xl border border-primary/25 bg-card/80 shadow-xl shadow-primary/5 backdrop-blur-sm min-[480px]:h-[330px] sm:h-[340px]">
            {/* Glow */}
            <div className="absolute left-1/2 top-0 h-24 w-40 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl" />
            <motion.div
              key={activeFeature}
              data-testid="scan-feature-card"
              data-feature={activeCard.key}
              initial={{ opacity: 0, x: direction * 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative flex h-full flex-col items-center justify-center px-5 py-5 text-center sm:px-8 sm:py-6"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 sm:h-16 sm:w-16">
                <ActiveCardIcon className="h-8 w-8 text-primary sm:h-9 sm:w-9" />
              </div>
              <p className="mt-3 text-lg font-bold leading-snug text-foreground sm:mt-4 sm:text-2xl">
                {tt(`scan.benefits.${activeCard.key}.headline`)}
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                {tt(`scan.benefits.${activeCard.key}.body`)}
              </p>
              {activeCard.key === "videoAvatar" && (
                <div className="mt-4 flex items-center justify-center gap-2.5">
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
                        className="h-10 w-10 rounded-full object-cover object-top ring-2 ring-background"
                      />
                    ))}
                  </div>
                  <p className="text-left text-xs font-medium leading-tight text-foreground/80">
                    {tt("scan.benefits.videoAvatar.avatarsNote")}
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Rotator controls: prev / dots / next + position counter */}
          <div className="mt-3 flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => stepFeature(-1)}
              aria-label={tt("scan.previousFeature")}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card/70 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              {featureCards.map((card, i) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => goToFeature(i)}
                  aria-label={tt(`scan.benefits.${card.key}.headline`)}
                  aria-current={i === activeFeature || undefined}
                  data-testid="scan-feature-dot"
                  data-feature={card.key}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === activeFeature
                      ? "w-6 bg-primary"
                      : "w-2 bg-muted-foreground/35 hover:bg-muted-foreground/60"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => stepFeature(1)}
              aria-label={tt("scan.nextFeature")}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card/70 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {activeFeature + 1} / {featureCards.length}
            </span>
          </div>
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
