import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { pendingScanProgress } from "@/lib/demoStartup";
import {
  CheckCircle,
  Globe,
  MessageSquare,
  Mic,
  PhoneCall,
  Sparkles,
  Search,
  CalendarCheck,
  TrendingUp,
  Clock,
  ShieldCheck,
  Headphones,
} from "lucide-react";

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

/** Rotating benefit/sales messages shown while waiting */
const benefitMessages = [
  {
    icon: Clock,
    key: "missCall",
  },
  {
    icon: CalendarCheck,
    key: "appointments",
  },
  {
    icon: TrendingUp,
    key: "moreLeads",
  },
  {
    icon: ShieldCheck,
    key: "liveFast",
  },
  {
    icon: Headphones,
    key: "warmTransfer",
  },
  {
    icon: MessageSquare,
    key: "chatAi",
  },
];

const STEP_DURATION = 2200;
const BENEFIT_DURATION = 4500;

interface ScanningAnimationProps {
  websiteUrl: string;
  businessName?: string;
  callerName?: string;
  onComplete: () => void;
  onCancel?: () => void;
  mode?: "timed" | "continuous";
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
}: ScanningAnimationProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentBenefit, setCurrentBenefit] = useState(0);
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

  // Benefit message rotation
  useEffect(() => {
    setCurrentBenefit(0);
    const id = window.setInterval(() => {
      setCurrentBenefit((prev) => (prev + 1) % benefitMessages.length);
    }, BENEFIT_DURATION);
    return () => window.clearInterval(id);
  }, []);

  const activeStep = scanSteps[currentStep] ?? scanSteps[0];
  const websiteLabel = getWebsiteLabel(websiteUrl);
  const displayName = businessName?.trim() || websiteLabel;
  const firstName = getFirstName(callerName);
  const isComplete = mode === "timed" && progress >= 100;
  const StepIcon = isComplete ? CheckCircle : activeStep.icon;
  const activeBenefit = benefitMessages[currentBenefit];
  const BenefitIcon = activeBenefit.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-5 px-4"
    >
      {/* Personalized greeting */}
      <div className="w-full text-center">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg font-bold text-foreground sm:text-xl"
        >
          {firstName ? t("scan.greetingWithName", { name: firstName }) : t("scan.greeting")}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm"
        >
          {t("scan.buildingPrefix")} {" "}
          <span className="font-semibold text-foreground">{displayName}</span> {t("scan.withAi")}
          {t("scan.buildingSuffix")}
        </motion.p>
      </div>

      {/* Main scanner card */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-card/95 px-4 py-5 shadow-xl sm:rounded-3xl sm:px-6 sm:py-6">
        {/* Glow */}
        <div className="absolute left-1/2 top-0 h-20 w-20 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl" />

        <div className="relative flex flex-col items-center text-center">
          {/* Eyebrow */}
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-primary sm:text-[10px]">
            {t("scan.eyebrow")}
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
                {isComplete ? t("scan.readyTitle") : t(`scan.steps.${activeStep.key}.label`)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {isComplete
                  ? t("scan.readyDetail")
                  : t(`scan.steps.${activeStep.key}.detail`)}
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
              {isComplete ? t("scan.complete") : t("scan.progress", { progress: Math.round(progress) })}
            </p>
          </div>

          {/* Cancel button */}
          {onCancel && !isComplete && (
            <button
              onClick={onCancel}
              className="mt-4 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              {t("scan.stop")}
            </button>
          )}
        </div>
      </div>

      {/* Rotating benefit messages */}
      <div className="w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBenefit}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/70 px-4 py-3 backdrop-blur-sm"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BenefitIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{t(`scan.benefits.${activeBenefit.key}.headline`)}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {t(`scan.benefits.${activeBenefit.key}.body`)}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CTA to talk to sales */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="text-center text-[10px] text-muted-foreground/70 sm:text-xs"
      >
        {t("scan.questionsPrefix")} {" "}
        <span className="font-semibold text-primary">{t("scan.transferSpecialist")}</span>{" "}
        {t("scan.questionsSuffix")}
      </motion.p>
    </motion.div>
  );
};

export default ScanningAnimation;
