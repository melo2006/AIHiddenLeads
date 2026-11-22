import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';
import fr from '../i18n/locales/fr.json';
import ptBR from '../i18n/locales/pt-BR.json';
import VoiceActionConfirmation, { type VoiceAction } from '@/components/VoiceActionConfirmation';
import { cardCompletesVerbally, detectVerbalFollowupConsent, detectVerbalSendAgreement } from '@/lib/verbalConsent';
import { capturedContactBlock, rePresentableCardFromStamp, type CapturedContact } from '../../supabase/functions/_shared/captured-contact';
import { saveConfirmedFollowup } from '../../supabase/functions/_shared/contact-save';

// Capture/consent fix (2026-11-22) — Ron's Aurelia Perez retest:
//   1. He agreed IN WORDS ("go ahead") and nothing happened — the
//      mic was muted while the card was up and the presenter is
//      blocked on the card's tool call, so the spoken yes reached
//      nobody. Verbal agreement now completes the card itself and
//      the save records the consent source as verbal.
//   2. His correct email was read back 5+ times across the four
//      reconnect segments — resume restored words, not confirmed
//      state. The read-back is now once-per-detail-ever, in the
//      composed policies AND in the ALREADY CAPTURED block.
//   3. The follow-up form vanished in the 04:35 socket drop and
//      begging could not bring it back: the client tore the card
//      down with the socket, and the resumed proxy session had no
//      re-presentable card. Both halves are fixed.
//   4. The card said "As Aspen heard it" in a Monica session — the
//      note now names the actual presenter, in all four locales.
//   5. The demo follow-up email was already real (Hostinger SMTP
//      on every confirmed save, demo sessions included) — the
//      confirm simply never completed in Ron's run. The send is
//      now awaited and the tool result tells the presenter the
//      truth about whether it went out.
//   6. Monica greeted him "Good morning, John" — the sample
//      link's built-in caller name. Sample sessions no longer seed
//      a spoken name server-side, and the client sample names are
//      generic placeholders now.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const value = key.split('.').reduce<unknown>(
        (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
        en as unknown,
      );
      let out = typeof value === 'string' ? value : typeof options?.defaultValue === 'string' ? (options.defaultValue as string) : key;
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          if (k !== 'defaultValue' && (typeof v === 'string' || typeof v === 'number')) out = out.split(`{{${k}}}`).join(String(v));
        }
      }
      return out;
    },
    i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage: async () => undefined },
  }),
}));

afterEach(() => { cleanup(); vi.useRealTimers(); });

const FOLLOWUP: VoiceAction = {
  id: 'fu-verbal',
  action: 'request_platform_followup',
  contact: { name: 'Tony Miller', email: 'tonymiller1401@gmail.com', phone: '9547706622' },
};

describe('verbal consent detector (item 1)', () => {
  it('hears clear short affirmatives in all four session languages', () => {
    for (const line of ['go ahead', 'Yes', 'yes please', "that's right", 'Send it', 'sure, go ahead', 'sí', 'claro', 'sim, pode enviar', 'oui', "d'accord", 'text me']) {
      expect(detectVerbalFollowupConsent(line), line).toBe(true);
    }
  });

  it('never hears consent in a negation, a question about something else, or a long sentence', () => {
    for (const line of ['no', 'no thanks', "don't send it", 'not yet', 'no, wait', 'the listing on Maple Street has three bedrooms and a pool', 'yes I was wondering if the house on Maple Street is still available for a showing tomorrow', '']) {
      expect(detectVerbalFollowupConsent(line), line).toBe(false);
    }
  });

  it('the narrow pre-card detector takes send agreements only — a read-back yes does not complete a card that has not appeared', () => {
    for (const line of ['go ahead', 'send it', 'yes, send it', 'please go ahead']) {
      expect(detectVerbalSendAgreement(line), line).toBe(true);
    }
    for (const line of ['yes', "that's right", 'correct', 'sí', 'the address is right']) {
      expect(detectVerbalSendAgreement(line), line).toBe(false);
    }
  });

  it('only the consent-bearing cards complete verbally', () => {
    expect(cardCompletesVerbally('request_platform_followup')).toBe(true);
    expect(cardCompletesVerbally('request_conversation_copy')).toBe(true);
    expect(cardCompletesVerbally('request_platform_appointment')).toBe(false);
    expect(cardCompletesVerbally('request_demo_start')).toBe(false);
    expect(cardCompletesVerbally(undefined)).toBe(false);
  });
});

describe('VoiceActionConfirmation — verbal consent completes the card (item 1)', () => {
  it('ticks the box itself and auto-submits, marking the consent source verbal', async () => {
    vi.useFakeTimers();
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={onAnswer} verbalConsent />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(screen.getByText("You agreed by voice, so I've ticked this for you — saving now.")).toBeTruthy();
    expect(onAnswer).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const [approved, payload] = onAnswer.mock.calls[0] as [boolean, Record<string, unknown>];
    expect(approved).toBe(true);
    expect(payload).toMatchObject({ consent: true, consentSource: 'verbal', email: 'tonymiller1401@gmail.com' });
  });

  it('stands down when the visitor starts editing instead (box stays ticked, no auto-submit)', async () => {
    vi.useFakeTimers();
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={onAnswer} verbalConsent />);
    fireEvent.change(screen.getByLabelText('Confirmed email'), { target: { value: 'tony@corrected.com' } });
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(onAnswer).not.toHaveBeenCalled();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('an invalid spoken email keeps the card open with the error showing — nothing is saved on a bad address', async () => {
    vi.useFakeTimers();
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={{ ...FOLLOWUP, contact: { name: 'Tony Miller', email: 'not-an-email', phone: '' } }} onAnswer={onAnswer} verbalConsent />);
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('without verbal consent the card behaves exactly as before: unticked, no auto-answer', async () => {
    vi.useFakeTimers();
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={onAnswer} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('VoiceActionConfirmation — the card names the actual presenter (item 4)', () => {
  it('renders the session presenter in the as-heard note', () => {
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={vi.fn()} presenterName="Monica" />);
    expect(screen.getByText("As Monica heard it — please correct anything that's off.")).toBeTruthy();
  });

  it('every locale carries the interpolated note and the verbal-consent note', () => {
    for (const locale of [en, es, fr, ptBR]) {
      expect(locale.card.asHeardNote).toContain('{{name}}');
      expect(locale.card.asHeardNote).not.toContain('Aspen');
      expect(typeof locale.card.verbalConsentNote).toBe('string');
      expect(locale.card.verbalConsentNote.length).toBeGreaterThan(10);
    }
  });
});

describe('read-back once, resume-aware (item 2)', () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('the composed policies state the once-only rule and the verbal-completes rule', () => {
    const followup = read('supabase/functions/_shared/visitor-followup.ts');
    expect(followup).toContain('READ EACH DETAIL BACK EXACTLY ONCE');
    expect(followup).toContain('VERBAL AGREEMENT COMPLETES THE FORM');
    expect(followup).toContain('never ask the texting question before a mobile number has actually been given');
    // The superseded rule Ron's run suffered under is gone.
    expect(followup).not.toContain('Verbal approval alone never saves details');
  });

  it('the ALREADY CAPTURED block tells a resumed session the read-back is DONE', () => {
    const stamp: CapturedContact = { name: 'Tony Miller', email: 'tonymiller1401@gmail.com', phone: '9547706622', confirmed: false, updatedAt: 1 };
    const block = capturedContactBlock(stamp);
    expect(block).toContain('READ-BACK STATE');
    expect(block).toContain('the read-back is DONE');
    expect(block).toContain('never re-run the capture ritual for a detail listed here');
  });
});

describe('card survival across reconnects (item 3)', () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('the resumed proxy session seeds its re-presentable card from the durable stamp', () => {
    const stamp: CapturedContact = { name: 'Tony Miller', email: 'tonymiller1401@gmail.com', phone: '9547706622', confirmed: false, updatedAt: 1 };
    expect(rePresentableCardFromStamp(stamp, true)).toEqual({
      name: 'request_platform_followup',
      contact: { name: 'Tony Miller', email: 'tonymiller1401@gmail.com', phone: '9547706622' },
    });
    // A confirmed stamp is finished business — never re-issued.
    expect(rePresentableCardFromStamp({ ...stamp, confirmed: true }, true)).toBeNull();
    // Platform follow-up off, or no emailable capture yet: nothing to re-issue.
    expect(rePresentableCardFromStamp(stamp, false)).toBeNull();
    expect(rePresentableCardFromStamp({ ...stamp, email: '' }, true)).toBeNull();
    expect(rePresentableCardFromStamp(null, true)).toBeNull();
    const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
    expect(proxy).toContain('lastCardAction = rePresentableCardFromStamp(capturedContact, config.platformFollowup) ?? lastCardAction');
  });

  it('the client preserves the open card through recovery teardowns and re-opens it at go-live', () => {
    const conversation = read('src/components/GeminiConversation.tsx');
    expect(conversation).toContain('const preserveCard = sessionRecoveringRef.current || cardDropRecoveryRef.current;');
    expect(conversation).toContain('cardPreservedRef.current = true;');
    expect(conversation).toContain("wsRef.current?.send(JSON.stringify({ type: 'reopen_action' }))");
    // The socket-close path flags the recovery BEFORE the teardown.
    expect(conversation).toContain('if ((event.code === 1006 || event.code === 1011) && reconnectRef.current.count < 3) cardDropRecoveryRef.current = true;');
  });
});

describe('consent source is recorded honestly (item 1, save half)', () => {
  const writers = (rows: Array<Record<string, unknown>>) => ({
    readLead: async () => ({ data: null, error: null }),
    updateLead: async () => ({ error: null }),
    upsertHistory: async (row: Record<string, unknown>) => { rows.push(row); return { error: null }; },
  });

  it('a verbal completion stores followup_consent_source: verbal', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const saved = await saveConfirmedFollowup(writers(rows), {
      sessionId: 'sess-1', leadId: null, prospectId: 'prosp-1', businessName: 'Aurelia Perez',
      contact: { name: 'Tony Miller', email: 'tonymiller1401@gmail.com', phone: '9547706622' },
      consentSource: 'verbal',
    });
    expect(saved.ok).toBe(true);
    expect((rows[0].metadata as Record<string, unknown>).followup_consent_source).toBe('verbal');
  });

  it('an ordinary tap stores followup_consent_source: card', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const saved = await saveConfirmedFollowup(writers(rows), {
      sessionId: 'sess-2', leadId: null, prospectId: null, businessName: 'Homepage',
      contact: { name: 'Tony Miller', email: 'tonymiller1401@gmail.com', phone: '' },
    });
    expect(saved.ok).toBe(true);
    expect((rows[0].metadata as Record<string, unknown>).followup_consent_source).toBe('card');
  });
});

describe('demo sends + sample greeting name (items 5 & 6)', () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('the follow-up confirm awaits the real visitor email and reports it honestly to the model', () => {
    const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
    expect(proxy).toContain('const emailSent=await trySend(visitorFollowup(');
    expect(proxy).toContain('emailSent,instruction: emailSent');
    expect(proxy).toContain('Do NOT claim an email or a text was sent');
    // The consent source rides the same confirm into the save.
    expect(proxy).toContain("?.consentSource === 'verbal' ? 'verbal' as const : 'card' as const");
  });

  it('sample sessions never seed the link-supplied name into the greeting or the presenter prompt', () => {
    const mint = read('supabase/functions/gemini-session/index.ts');
    expect(mint.split("(b.sample === true ? '' : b.visitorName)").length - 1).toBe(2);
    // The record-keeping caller_name stamp is untouched.
    expect(mint).toContain('caller_name:b.visitorName||null');
  });

  it('sample links carry a generic placeholder name, never a plausible person', () => {
    expect(en.examplesGallery.visitorName).toBe('Visitor');
    expect(es.examplesGallery.visitorName).toBe('Visitante');
    expect(fr.examplesGallery.visitorName).toBe('Visiteur');
    expect(ptBR.examplesGallery.visitorName).toBe('Visitante');
  });

  it('the client wires the detector, the presenter name and the verbal flag into the card', () => {
    const conversation = read('src/components/GeminiConversation.tsx');
    expect(conversation).toContain("from \"@/lib/verbalConsent\"");
    expect(conversation).toContain('schedulePartialConsentCheck();');
    expect(conversation).toContain('presenterName={cardPresenterName}');
    expect(conversation).toContain('verbalConsent={verbalConsentActionId === pendingAction.id}');
    expect(conversation).toContain('detectVerbalSendAgreement(last.text)');
  });
});
