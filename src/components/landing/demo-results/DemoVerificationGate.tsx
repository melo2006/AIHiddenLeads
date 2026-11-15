import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock3, KeyRound, Mail, MessageSquareText, Play, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { displayNumbers } from '@/lib/displayNumbers';
import {
  DEMO_CONSENT_DISCLOSURE,
  GATE_LINES,
  SMS_VERIFICATION_ENABLED,
  abandonDemoVerification,
  extractSpokenCode,
  ladderStageForElapsed,
  requestDemoCode,
  saveDemoResume,
  verifyDemoCode,
  type DemoVerificationChannel,
} from '@/lib/demoVerification';

export interface DemoVerificationGateProps {
  leadId: string;
  businessName: string;
  channel: 'email' | 'sms';
  maskedTarget: string;
  websiteUrl?: string;
  /** Latest code Aspen heard the visitor say (a 4-digit string, or a transcript extractSpokenCode can read). */
  dictatedCode?: string | null;
  onVerified: () => void;
  onSampleDemo: () => void;
  /** true while Aspen should pause her live video to the static portrait and wait; the session itself stays alive. */
  onWaitingChange?: (waiting: boolean) => void;
  onExit?: () => void;
}

type GatePanel = 'entry' | 'success' | 'expired' | 'locked' | 'exit';

const EMPTY_DIGITS = ['', '', '', ''];

export default function DemoVerificationGate({
  leadId,
  businessName,
  channel,
  maskedTarget,
  websiteUrl,
  dictatedCode,
  onVerified,
  onSampleDemo,
  onWaitingChange,
  onExit,
}: DemoVerificationGateProps) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<GatePanel>('entry');
  const [digits, setDigits] = useState<string[]>(EMPTY_DIGITS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [currentChannel, setCurrentChannel] = useState<DemoVerificationChannel>(channel);
  const [currentMaskedTarget, setCurrentMaskedTarget] = useState(maskedTarget);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const waitingRef = useRef<boolean | null>(null);
  const submitInFlightRef = useRef(false);
  const exitHandledRef = useRef(false);
  const handledDictatedRef = useRef<string | null>(null);
  const dictatedTimerRef = useRef<number | null>(null);
  const verifiedTimerRef = useRef<number | null>(null);

  const stage = ladderStageForElapsed(elapsedMs);
  const codeValue = digits.join('');
  const codeComplete = digits.every((digit) => digit !== '');

  const notifyWaiting = useCallback(
    (waiting: boolean) => {
      if (waitingRef.current === waiting) return;
      waitingRef.current = waiting;
      onWaitingChange?.(waiting);
    },
    [onWaitingChange],
  );

  // On mount Aspen goes quiet: signal the parent to pause her live video to
  // the static portrait. The session stays alive; this only flips the flag.
  useEffect(() => {
    notifyWaiting(true);
  }, [notifyWaiting]);

  // Waiting ladder clock. Pauses on the success / exit panels.
  useEffect(() => {
    if (panel === 'success' || panel === 'exit') return;
    const interval = window.setInterval(() => setElapsedMs((previous) => previous + 1_000), 1_000);
    return () => window.clearInterval(interval);
  }, [panel]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(
    () => () => {
      if (dictatedTimerRef.current !== null) window.clearTimeout(dictatedTimerRef.current);
      if (verifiedTimerRef.current !== null) window.clearTimeout(verifiedTimerRef.current);
    },
    [],
  );

  const focusInput = (index: number) => {
    const clamped = Math.max(0, Math.min(3, index));
    inputRefs.current[clamped]?.focus();
    inputRefs.current[clamped]?.select();
  };

  const clearBoxes = useCallback(() => {
    setDigits(EMPTY_DIGITS);
    focusInput(0);
  }, []);

  const submitCode = useCallback(
    async (code: string) => {
      if (submitInFlightRef.current || code.length !== 4) return;
      submitInFlightRef.current = true;
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        const result = await verifyDemoCode(leadId, code);
        // NOTE: explicit `=== false` / `=== true` comparisons — this repo
        // compiles with strict:false, where boolean-literal discriminant
        // narrowing via truthiness does not apply.
        if (result.ok === true && result.verified) {
          setPanel('success');
          notifyWaiting(false);
          verifiedTimerRef.current = window.setTimeout(() => onVerified(), 900);
          return;
        }
        if (result.ok === true) {
          // A 2xx without a verified flag is not an unlock; treat it like a mismatch.
          setErrorMessage(t('gate.errMismatch'));
          clearBoxes();
          return;
        }
        switch (result.error) {
          case 'code_mismatch':
            setErrorMessage(
              typeof result.attemptsRemaining === 'number'
                ? t('gate.errMismatchTries', { count: result.attemptsRemaining })
                : t('gate.errMismatch'),
            );
            clearBoxes();
            break;
          case 'code_expired':
          case 'no_pending_code':
            setPanel('expired');
            break;
          case 'too_many_attempts':
            setPanel('locked');
            break;
          default:
            setErrorMessage(t('gate.errCheckFailed'));
            break;
        }
      } finally {
        submitInFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [clearBoxes, leadId, notifyWaiting, onVerified],
  );

  const submitCodeRef = useRef(submitCode);
  submitCodeRef.current = submitCode;

  // Voice entry: when Aspen hears a complete code, fill the boxes first so
  // the visitor SEES what she heard, then submit after a short beat.
  useEffect(() => {
    if (!dictatedCode || panel !== 'entry') return;
    const heard = /^\d{4}$/.test(dictatedCode.trim()) ? dictatedCode.trim() : extractSpokenCode(dictatedCode);
    if (!heard) return;
    if (handledDictatedRef.current === heard) return;
    handledDictatedRef.current = heard;
    setDigits(heard.split(''));
    setErrorMessage(null);
    if (dictatedTimerRef.current !== null) window.clearTimeout(dictatedTimerRef.current);
    dictatedTimerRef.current = window.setTimeout(() => {
      void submitCodeRef.current(heard);
    }, 600);
  }, [dictatedCode, panel]);

  // Exit stage of the ladder: abandon once (guarded against strict-mode
  // double effects), persist the resume record, and leave waiting.
  useEffect(() => {
    if (stage !== 'exit' || panel !== 'entry' || exitHandledRef.current) return;
    exitHandledRef.current = true;
    setPanel('exit');
    notifyWaiting(false);
    saveDemoResume({ leadId, websiteUrl: websiteUrl ?? '', verifyDemo: true });
    void abandonDemoVerification(leadId);
    onExit?.();
  }, [stage, panel, leadId, websiteUrl, notifyWaiting, onExit]);

  const handleResend = async (targetChannel: DemoVerificationChannel = currentChannel) => {
    if (isResending) return;
    if (targetChannel === 'sms' && !SMS_VERIFICATION_ENABLED) {
      setNotice(t('gate.noticeSmsSoon'));
      return;
    }
    setIsResending(true);
    setNotice(null);
    setErrorMessage(null);
    try {
      const result = await requestDemoCode(leadId, targetChannel);
      if (result.ok === true) {
        setCurrentChannel(result.channel);
        if (result.maskedTarget) setCurrentMaskedTarget(result.maskedTarget);
        setDigits(EMPTY_DIGITS);
        setElapsedMs(0);
        setPanel('entry');
        focusInput(0);
        return;
      }
      if (result.error === 'resend_cooldown') {
        setNotice(
          typeof result.retryAfterSeconds === 'number'
            ? t('gate.noticeWaitSeconds', { count: result.retryAfterSeconds })
            : t('gate.noticeWaitResend'),
        );
        return;
      }
      if (result.error === 'sms_verification_not_enabled') {
        setNotice(t('gate.noticeSmsSoon'));
        return;
      }
      setNotice(t('gate.noticeResendFailed'));
    } finally {
      setIsResending(false);
    }
  };

  const handleDigitChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '');
    const next = [...digits];
    if (!cleaned) {
      next[index] = '';
      setDigits(next);
      return;
    }
    setErrorMessage(null);
    if (cleaned.length > 1 && digits.every((digit) => digit === '')) {
      // One-time-code autofill landing in a single box on a fresh gate.
      cleaned
        .slice(0, 4)
        .split('')
        .forEach((digit, offset) => {
          next[offset] = digit;
        });
      setDigits(next);
      if (next.every((digit) => digit !== '')) void submitCode(next.join(''));
      else focusInput(next.findIndex((digit) => digit === ''));
      return;
    }
    const digit = cleaned[cleaned.length - 1];
    next[index] = digit;
    setDigits(next);
    if (next.every((entry) => entry !== '')) {
      void submitCode(next.join(''));
    } else if (index < 3) {
      focusInput(index + 1);
    }
  };

  const handleDigitKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
        setDigits(next);
      } else if (index > 0) {
        next[index - 1] = '';
        setDigits(next);
        focusInput(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusInput(index - 1);
    }
    if (event.key === 'ArrowRight' && index < 3) {
      event.preventDefault();
      focusInput(index + 1);
    }
  };

  const handleDigitPaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    setErrorMessage(null);
    const next = [...digits];
    const start = pasted.length >= 4 ? 0 : index;
    pasted
      .slice(0, 4 - start)
      .split('')
      .forEach((digit, offset) => {
        next[start + offset] = digit;
      });
    setDigits(next);
    if (next.every((digit) => digit !== '')) {
      void submitCode(next.join(''));
    } else {
      focusInput(next.findIndex((digit) => digit === ''));
    }
  };

  const otherChannel: DemoVerificationChannel = currentChannel === 'email' ? 'sms' : 'email';
  const stageLine =
    stage === 'first-nudge'
      ? t('gate.firstNudge', { defaultValue: GATE_LINES.firstNudge })
      : stage === 'final-nudge'
        ? t('gate.finalNudge', { defaultValue: GATE_LINES.finalNudge })
        : currentChannel === 'sms'
          ? t('gate.sentSms', { defaultValue: GATE_LINES.sentSms })
          : t('gate.sentEmail', { defaultValue: GATE_LINES.sentEmail });
  const showLadderActions = panel === 'entry' && stage !== 'waiting';

  const sampleDemoLink = (
    <Button type="button" variant="link" size="sm" className="text-muted-foreground" onClick={onSampleDemo}>
      {t('gate.ratherSample')}
    </Button>
  );

  return (
    <Card className="mx-auto w-full max-w-md rounded-3xl border bg-card shadow-2xl">
      {panel === 'success' ? (
        <CardContent className="space-y-4 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden />
          <p role="status" className="text-base leading-relaxed">
            {displayNumbers(t('gate.verified', { defaultValue: GATE_LINES.verified }))}
          </p>
          <p className="text-sm text-muted-foreground">{t('gate.openingDemo')}</p>
        </CardContent>
      ) : panel === 'exit' ? (
        <CardContent className="space-y-4 p-8 text-center">
          <Clock3 className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
          <p role="status" className="text-base leading-relaxed">
            {displayNumbers(t('gate.exit', { defaultValue: GATE_LINES.exit }))}
          </p>
          <Button type="button" className="w-full" onClick={onSampleDemo}>
            <Play aria-hidden />
            {t('gate.watchSample')}
          </Button>
        </CardContent>
      ) : panel === 'expired' || panel === 'locked' ? (
        <CardContent className="space-y-4 p-8 text-center">
          {panel === 'expired' ? (
            <Clock3 className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
          ) : (
            <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
          )}
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{panel === 'expired' ? t('gate.expiredTitle') : t('gate.lockedTitle')}</h3>
            <p role="status" className="text-sm leading-relaxed text-muted-foreground">
              {panel === 'expired'
                ? displayNumbers(t('gate.expiredBody'))
                : t('gate.lockedBody')}
            </p>
          </div>
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {displayNumbers(notice)}
            </p>
          )}
          <Button type="button" className="w-full" disabled={isResending} onClick={() => void handleResend()}>
            <RefreshCw aria-hidden />
            {isResending ? t('gate.sending') : t('gate.resendFresh')}
          </Button>
          {sampleDemoLink}
        </CardContent>
      ) : (
        <>
          <CardHeader className="space-y-2 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-primary" aria-hidden />
            <CardTitle className="text-2xl">{displayNumbers(t('gate.titleReady', { name: businessName }))}</CardTitle>
            <CardDescription>
              {displayNumbers(t('gate.enterCode', { target: currentMaskedTarget }))}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p role="status" className="text-center text-sm leading-relaxed text-muted-foreground">
              {displayNumbers(stageLine)}
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (codeComplete) void submitCode(codeValue);
              }}
              className="space-y-4"
            >
              <div className="flex items-center justify-center gap-3">
                {digits.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    value={digit}
                    disabled={isSubmitting}
                    onChange={(event) => handleDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handleDigitKeyDown(index, event)}
                    onPaste={(event) => handleDigitPaste(index, event)}
                    onFocus={(event) => event.target.select()}
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    aria-label={t('gate.digitAria', { index: index + 1 })}
                    className="h-14 w-12 rounded-xl text-center text-2xl font-semibold sm:w-14"
                  />
                ))}
              </div>

              {errorMessage && (
                <p role="alert" className="text-center text-sm font-medium text-destructive">
                  {displayNumbers(errorMessage)}
                </p>
              )}
              {notice && (
                <p role="status" className="text-center text-sm text-muted-foreground">
                  {displayNumbers(notice)}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={!codeComplete || isSubmitting}>
                {isSubmitting ? t('gate.checking') : t('gate.verifyButton')}
              </Button>
            </form>

            {showLadderActions && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={isResending} onClick={() => void handleResend()}>
                  <RefreshCw aria-hidden />
                  {isResending ? t('gate.sending') : t('gate.resendCode')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isResending}
                  onClick={() => void handleResend(otherChannel)}
                >
                  {otherChannel === 'sms' ? <MessageSquareText aria-hidden /> : <Mail aria-hidden />}
                  {otherChannel === 'sms' ? t('gate.useText') : t('gate.useEmail')}
                </Button>
              </div>
            )}

            <div className="space-y-2 text-center">
              {sampleDemoLink}
              <p className="text-xs leading-relaxed text-muted-foreground">{t('consent.disclosure', { defaultValue: DEMO_CONSENT_DISCLOSURE })}</p>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
