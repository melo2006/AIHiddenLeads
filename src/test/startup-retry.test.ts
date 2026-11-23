// @vitest-environment node
// Startup auto-retry (2026-11-23).
//
// Ron's homepage test that morning (~08:33 EST, phone with ~95 tabs
// open) hit the red "Starting the voice assistant took too long.
// Check microphone permission and try again." error: one slow start
// — the 30 s budget covers audio unlock + microphone + the
// gemini-session mint + the proxy socket, and the mint had no retry
// of its own — became a dead end whose copy blamed the microphone.
// The fix (lib/startupRetry + the retryStartup wiring in
// GeminiConversation) retries the first transient failure once,
// silently, behind a calm "still connecting" status; only a second
// failure shows the hard error. Permission denials never retry.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_STARTUP_AUTO_RETRIES,
  STARTUP_READY_TIMEOUT_MS,
  STARTUP_RETRY_DELAY_MS,
  STARTUP_TIMEOUT_MS,
  classifyStartupError,
  startupRetryAllowed,
  tagStartupError,
  type StartupFailureKind,
} from '../lib/startupRetry';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';
import fr from '../i18n/locales/fr.json';
import ptBR from '../i18n/locales/pt-BR.json';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const component = read('src/components/GeminiConversation.tsx');

// The component's sentinel messages (GeminiConversation.tsx module
// constants, not exported). The wiring test below pins the denial
// literal in the source so these copies cannot drift silently.
const SENTINELS = {
  microphoneDenied: 'Microphone permission was denied — allow it in your browser and try again.',
  audioTapNeeded: 'Tap play to enable sound on this phone. Your sign-in and demo allowance are unchanged.',
  soundBlocked: 'Your browser blocked Aspen’s sound. Tap play to try again.',
};

describe('startup budgets (unchanged values, now named)', () => {
  it('keeps the 30 s setup budget and the 15 s ready budget', () => {
    expect(STARTUP_TIMEOUT_MS).toBe(30_000);
    expect(STARTUP_READY_TIMEOUT_MS).toBe(15_000);
  });

  it('grants exactly one silent retry with a short delay', () => {
    expect(MAX_STARTUP_AUTO_RETRIES).toBe(1);
    expect(STARTUP_RETRY_DELAY_MS).toBeGreaterThan(0);
    expect(STARTUP_RETRY_DELAY_MS).toBeLessThan(2_000);
  });
});

describe('startupRetryAllowed', () => {
  const base = { retriesUsed: 0, warm: false, preview: false };

  it('retries the transient kinds on the first failure', () => {
    for (const kind of ['timeout', 'no-response', 'transient'] as StartupFailureKind[]) {
      expect(startupRetryAllowed({ ...base, kind })).toBe(true);
    }
  });

  it('never retries a second failure', () => {
    for (const kind of ['timeout', 'no-response', 'transient'] as StartupFailureKind[]) {
      expect(startupRetryAllowed({ ...base, kind, retriesUsed: 1 })).toBe(false);
    }
  });

  it('never retries permission, tap, face-refusal or unclassified failures', () => {
    for (const kind of ['permission', 'tap', 'face-refusal', 'other'] as StartupFailureKind[]) {
      expect(startupRetryAllowed({ ...base, kind })).toBe(false);
    }
  });

  it('never retries warm (prewarm) or preview starts', () => {
    expect(startupRetryAllowed({ ...base, kind: 'timeout', warm: true })).toBe(false);
    expect(startupRetryAllowed({ ...base, kind: 'timeout', preview: true })).toBe(false);
  });
});

describe('classifyStartupError', () => {
  it('reads the microphone-denied sentinel as a permission failure', () => {
    expect(classifyStartupError(new Error(SENTINELS.microphoneDenied), SENTINELS)).toBe('permission');
  });

  it('reads the tap-for-sound sentinels and a bare NotAllowedError as tap holds', () => {
    expect(classifyStartupError(new Error(SENTINELS.audioTapNeeded), SENTINELS)).toBe('tap');
    expect(classifyStartupError(new Error(SENTINELS.soundBlocked), SENTINELS)).toBe('tap');
    const notAllowed = new Error('play() failed'); notAllowed.name = 'NotAllowedError';
    expect(classifyStartupError(notAllowed, SENTINELS)).toBe('tap');
  });

  it('reads mint transport and busy-device failures as transient', () => {
    const fetchErr = new Error('Failed to send a request to the Edge Function'); fetchErr.name = 'FunctionsFetchError';
    expect(classifyStartupError(fetchErr, SENTINELS)).toBe('transient');
    const busyMic = new Error('could not start audio source'); busyMic.name = 'NotReadableError';
    expect(classifyStartupError(busyMic, SENTINELS)).toBe('transient');
    expect(classifyStartupError(new TypeError('Failed to fetch'), SENTINELS)).toBe('transient');
  });

  it('an explicit tag wins over message and name heuristics', () => {
    const tagged = tagStartupError(new Error(SENTINELS.microphoneDenied), 'transient');
    expect(classifyStartupError(tagged, SENTINELS)).toBe('transient');
    const refusal = tagStartupError(new Error('token refused'), 'face-refusal');
    expect(classifyStartupError(refusal, SENTINELS)).toBe('face-refusal');
  });

  it('leaves non-object throws and unknown errors unclassified', () => {
    expect(tagStartupError('boom', 'transient')).toBe('boom');
    expect(classifyStartupError('boom', SENTINELS)).toBe('other');
    expect(classifyStartupError(new Error('something entirely new'), SENTINELS)).toBe('other');
    expect(classifyStartupError(null, SENTINELS)).toBe('other');
  });
});

// A faithful miniature of startConversation's failure handling: a
// failed attempt consults the policy; a granted retry starts a
// fresh attempt carrying the spent budget; going live clears it.
type AttemptOutcome = 'live' | StartupFailureKind;
function runStartSequence(outcomes: AttemptOutcome[], opts: { warm?: boolean; preview?: boolean } = {}) {
  let retriesUsed = 0;
  let attempts = 0;
  let errorShown: StartupFailureKind | null = null;
  let live = false;
  for (const outcome of outcomes) {
    attempts += 1;
    if (outcome === 'live') { live = true; retriesUsed = 0; break; }
    if (startupRetryAllowed({ kind: outcome, retriesUsed, warm: opts.warm ?? false, preview: opts.preview ?? false })) {
      retriesUsed += 1;
      continue;
    }
    errorShown = outcome;
    break;
  }
  return { attempts, retriesUsed, errorShown, live };
}

describe('start sequences (the three visitor-visible scenarios)', () => {
  it('first-attempt timeout → silent retry → success shows no error', () => {
    const r = runStartSequence(['timeout', 'live']);
    expect(r.attempts).toBe(2);
    expect(r.live).toBe(true);
    expect(r.errorShown).toBeNull();
  });

  it('a no-response first attempt also recovers silently', () => {
    const r = runStartSequence(['no-response', 'live']);
    expect(r.live).toBe(true);
    expect(r.errorShown).toBeNull();
  });

  it('permission denial → no retry, the denial error shows on the first failure', () => {
    const r = runStartSequence(['permission', 'live']);
    expect(r.attempts).toBe(1);
    expect(r.live).toBe(false);
    expect(r.errorShown).toBe('permission');
  });

  it('retry also fails → the hard error shows after the second attempt', () => {
    const r = runStartSequence(['timeout', 'timeout', 'live']);
    expect(r.attempts).toBe(2);
    expect(r.live).toBe(false);
    expect(r.errorShown).toBe('timeout');
  });

  it('a definitive face refusal is never softened into a retry', () => {
    const r = runStartSequence(['face-refusal', 'live']);
    expect(r.attempts).toBe(1);
    expect(r.errorShown).toBe('face-refusal');
  });

  it('warm and preview starts keep their existing failure handling', () => {
    expect(runStartSequence(['timeout', 'live'], { warm: true }).attempts).toBe(1);
    expect(runStartSequence(['timeout', 'live'], { preview: true }).attempts).toBe(1);
  });
});

describe('GeminiConversation wiring', () => {
  it('imports the policy from lib/startupRetry', () => {
    expect(component).toContain("from '@/lib/startupRetry'");
    expect(component).toContain('startupRetriesRef');
    expect(component).toContain('startupAutoRetryRef');
  });

  it('the 30 s startup timer consults the retry before showing startTimeout', () => {
    const start = component.indexOf('const startupTimeout = window.setTimeout');
    expect(start).toBeGreaterThan(-1);
    const slice = component.slice(start, component.indexOf('STARTUP_TIMEOUT_MS);', start));
    expect(slice).toContain("retryStartup('timeout')");
    expect(slice.indexOf("retryStartup('timeout')")).toBeLessThan(slice.indexOf('setError(t("panel.startTimeout"))'));
  });

  it('the ready timer consults the retry before the no-response error', () => {
    const start = component.indexOf('const readyTimeout = setTimeout');
    expect(start).toBeGreaterThan(-1);
    const slice = component.slice(start, component.indexOf('STARTUP_READY_TIMEOUT_MS);', start));
    expect(slice).toContain("retryStartup('no-response')");
    expect(slice.indexOf("retryStartup('no-response')")).toBeLessThan(slice.indexOf('setError("The voice service did not respond in time.'));
  });

  it('the catch block classifies before the generic error, with the real sentinels', () => {
    expect(component).toContain('classifyStartupError(e, { microphoneDenied: MICROPHONE_DENIED, audioTapNeeded: AUDIO_TAP_NEEDED, soundBlocked: SOUND_BLOCKED })');
    // The denial literal the classifier tests rely on.
    expect(component).toContain(`const MICROPHONE_DENIED = "${SENTINELS.microphoneDenied}"`);
    const hook = component.indexOf('classifyStartupError(e,');
    const generic = component.indexOf('"Could not start. Check your microphone and try again."', hook);
    expect(hook).toBeGreaterThan(-1);
    expect(generic).toBeGreaterThan(hook);
  });

  it('face-gate failures and mint HTTP failures carry their tags', () => {
    expect(component).toContain("tagStartupError(faceSettlement.error, 'face-refusal')");
    expect(component).toContain("tagStartupError(new Error(detail?.error || authError.message), 'transient')");
  });

  it('going live resets the retry budget', () => {
    const goLive = component.indexOf('const goLive = () => {');
    expect(goLive).toBeGreaterThan(-1);
    expect(component.slice(goLive, goLive + 400)).toContain('startupRetriesRef.current = 0;');
  });

  it('the retry keeps the visitor informed with the calm status, never an error', () => {
    const helper = component.indexOf('const retryStartup = ');
    expect(helper).toBeGreaterThan(-1);
    const slice = component.slice(helper, component.indexOf('const startupTimeout', helper));
    expect(slice).toContain('setStatus(t("panel.stillConnecting"))');
    expect(slice).toContain('setError(null)');
    expect(slice).toContain('STARTUP_RETRY_DELAY_MS');
  });
});

describe('still-connecting copy', () => {
  it('exists in every locale (parity is pinned by locale-coverage)', () => {
    for (const locale of [en, es, fr, ptBR]) {
      expect(locale.panel.stillConnecting).toBeTruthy();
      expect(locale.panel.stillConnecting).not.toBe(locale.panel.startTimeout);
    }
    expect(en.panel.stillConnecting).toContain('Still connecting');
  });
});
