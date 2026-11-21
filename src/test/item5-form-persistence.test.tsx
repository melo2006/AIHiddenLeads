import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../i18n/locales/en.json';
import VoiceActionConfirmation, { type VoiceAction } from '@/components/VoiceActionConfirmation';
import DemoStartConfirmation from '@/components/DemoStartConfirmation';
import { normalizeDictatedEmail, normalizeDictatedPhone } from '@/lib/demoVerification';
import { micAudioPasses } from '@/lib/personaSwap';
import {
  normalizeDictatedEmail as serverNormalizeEmail,
  normalizeDictatedPhone as serverNormalizePhone,
  normalizePendingContact,
} from '../../supabase/functions/_shared/contact-normalize';
import { demoStartCardFromArgs } from '../../supabase/functions/_shared/demo-start';

// Homepage-test item 5, FORM half (2026-11-21). The script layer was
// fixed in PR #29; what remained was the form itself:
//   (b) the model's raw tool arguments prefilled the confirmation
//       card untouched — a spelled-out email arrived as garbage
//       ("AXGX…4000") — while a purpose-built cleanup existed and
//       was never used on this path;
//   (c) the card had exactly two states, open or
//       cancelled-and-forgotten: ANY dialog close (Escape, the X,
//       an outside tap, phone keyboard/focus churn) became a
//       decline, the visitor's edits lived in mount-scoped state
//       and died with the unmount, and the mic stayed live while
//       the card was open, so a spoken correction could make
//       Gemini cancel the very tool call the card belonged to.
//
// These tests pin: the dictated-contact cleanup (browser copy and
// Deno port in step), its wiring into the proxy's pending-action
// creation and the demo card's prefill, the card's explicit-only
// dismissal, the edit lift that makes drafts parent-held, and the
// mic silence while a card is open.

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

afterEach(cleanup);

const FOLLOWUP: VoiceAction = {
  id: 'fu-1',
  action: 'request_platform_followup',
  contact: { name: 'Roger Miller', email: 'roger@example.com', phone: '9547706622' },
};

const APPOINTMENT: VoiceAction = {
  id: 'appt-1',
  action: 'request_platform_appointment',
  contact: { name: 'Roger Miller', email: 'roger@example.com', phone: '+1 954 555 0100' },
  slotStart: '2026-11-16T13:30:00.000Z',
};

describe('dictated-contact cleanup — browser copy and Deno port agree', () => {
  const emails: Array<[string, string]> = [
    ['john dot smith at gmail dot com', 'john.smith@gmail.com'],
    ['melo2006 at gmail dot com', 'melo2006@gmail.com'],
    ['jane underscore doe at example dot co dot uk', 'jane_doe@example.co.uk'],
    [' John Smith at Gmail.com ', 'johnsmith@gmail.com'],
    ['jane.doe @ example . com', 'jane.doe@example.com'],
    ['roger@example.com', 'roger@example.com'],
    ['', ''],
  ];
  it('normalizeDictatedEmail assembles spoken addresses identically on both sides', () => {
    for (const [raw, expected] of emails) {
      expect(normalizeDictatedEmail(raw)).toBe(expected);
      expect(serverNormalizeEmail(raw)).toBe(expected);
    }
  });

  const phones: Array<[string, string]> = [
    ['+1 (954) 770-6622', '9547706622'],
    ['954-770-6622', '9547706622'],
    ['nine five four seven seven zero six six two two', '9547706622'],
    ['1 954 770 6622', '9547706622'],
    ['', ''],
    // No digits at all: cleanup must not destroy what the visitor
    // can still correct by hand.
    ['call me', 'call me'],
  ];
  it('normalizeDictatedPhone digit-cleans identically on both sides', () => {
    for (const [raw, expected] of phones) {
      expect(normalizeDictatedPhone(raw)).toBe(expected);
      expect(serverNormalizePhone(raw)).toBe(expected);
    }
  });

  it('normalizePendingContact cleans email + phone and leaves the name alone', () => {
    expect(normalizePendingContact({ name: 'Mel O', email: 'melo2006 at gmail dot com', phone: '+1 (954) 770-6622' }))
      .toEqual({ name: 'Mel O', email: 'melo2006@gmail.com', phone: '9547706622' });
  });

  it('the demo card prefill runs its email through the same cleanup', () => {
    expect(demoStartCardFromArgs({ websiteUrl: 'acme.com', email: 'pat at example dot com' }, null).email).toBe('pat@example.com');
    expect(demoStartCardFromArgs({ websiteUrl: 'acme.com' }, { email: 'sam at example dot com' }).email).toBe('sam@example.com');
  });
});

describe('VoiceActionConfirmation — explicit-only dismissal (item 5c)', () => {
  it('Escape does not answer: the card stays open and unanswered', () => {
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={onAnswer} />);
    fireEvent.keyDown(screen.getByLabelText('Confirmed email'), { key: 'Escape' });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText('Confirm your follow-up details')).toBeTruthy();
  });

  it('editing a field answers nothing and lifts the draft to the parent', () => {
    const onAnswer = vi.fn();
    const onDraftChange = vi.fn();
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={onAnswer} onDraftChange={onDraftChange} />);
    fireEvent.change(screen.getByLabelText('Confirmed email'), { target: { value: 'roger@corrected.com' } });
    // Backspace-style editing included: partial values lift too.
    fireEvent.change(screen.getByLabelText('Confirmed email'), { target: { value: 'roger@corrected.co' } });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ email: 'roger@corrected.co' }));
    expect(screen.getByText('Confirm your follow-up details')).toBeTruthy();
  });

  it('labels the prefill as heard, not as a record — and the appointment card does not', () => {
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={vi.fn()} />);
    expect(screen.getByText("As Aspen heard it — please correct anything that's off.")).toBeTruthy();
    cleanup();
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={vi.fn()} />);
    expect(screen.queryByText("As Aspen heard it — please correct anything that's off.")).toBeNull();
  });

  it('the appointment card never lifts a draft (its fields are the confirmed store)', () => {
    const onDraftChange = vi.fn();
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={vi.fn()} onDraftChange={onDraftChange} />);
    expect(onDraftChange).not.toHaveBeenCalled();
  });
});

describe('DemoStartConfirmation — edits lift to the parent draft (item 5c)', () => {
  const action: VoiceAction = {
    id: 'demo-1',
    action: 'request_demo_start',
    demo: { websiteUrl: 'acme-plumbing.com', name: 'Pat Lee', email: 'pat@example.com' },
  };

  it('correcting the heard address lifts the full values, answers nothing', () => {
    const onAnswer = vi.fn();
    const onDraftChange = vi.fn();
    render(<DemoStartConfirmation action={action} onAnswer={onAnswer} onDraftChange={onDraftChange} />);
    fireEvent.change(screen.getByLabelText('Your website address'), { target: { value: 'acme-plumbing-fl.com' } });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onDraftChange).toHaveBeenCalledWith({ websiteUrl: 'acme-plumbing-fl.com', name: 'Pat Lee', email: 'pat@example.com' });
  });
});

describe('mic silence while a confirmation card is open (item 5c)', () => {
  it('the confirmation hold silences hands-free AND hold-to-talk frames', () => {
    expect(micAudioPasses({ swapHold: false, openingGate: false, noiseGateOpen: true, holdToTalk: false, confirmationHold: true })).toBe(false);
    expect(micAudioPasses({ swapHold: false, openingGate: false, noiseGateOpen: true, holdToTalk: true, confirmationHold: true })).toBe(false);
  });

  it('without the hold the pre-existing semantics are unchanged', () => {
    expect(micAudioPasses({ swapHold: false, openingGate: false, noiseGateOpen: true, holdToTalk: false })).toBe(true);
    expect(micAudioPasses({ swapHold: false, openingGate: false, noiseGateOpen: true, holdToTalk: false, confirmationHold: false })).toBe(true);
    expect(micAudioPasses({ swapHold: false, openingGate: true, noiseGateOpen: true, holdToTalk: false, confirmationHold: false })).toBe(false);
  });
});

describe('item 5 form fix — source pins', () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
  const cardSource = read('src/components/VoiceActionConfirmation.tsx');
  const conversationSource = read('src/components/GeminiConversation.tsx');
  const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');
  const deploySource = read('voice-proxy-server/deploy.sh');

  it('the card swallows non-explicit dismissals instead of converting them to a decline', () => {
    expect(cardSource).not.toContain('if (!open) onAnswer(false)');
    expect(cardSource).toContain('onEscapeKeyDown={(e) => e.preventDefault()}');
    expect(cardSource).toContain('onPointerDownOutside={(e) => e.preventDefault()}');
    expect(cardSource).toContain('onInteractOutside={(e) => e.preventDefault()}');
    // The card and its footer track the visible viewport (keyboard).
    expect(cardSource).toContain('window.visualViewport');
  });

  it('the client normalizes at the single pending-action choke point', () => {
    expect(conversationSource).toContain('email: normalizeDictatedEmail(next.contact.email), phone: normalizeDictatedPhone(next.contact.phone)');
    expect(conversationSource).toContain("if (action.action === 'request_platform_appointment') return action;");
    // Drafts are parent-held, keyed by action type, and die with the session.
    expect(conversationSource).toContain('contactDraftsRef');
    expect(conversationSource).toContain('demoDraftRef');
  });

  it('both mic loops hold for an open card, read from the pending-action ref', () => {
    expect(conversationSource.split('confirmationHold: pendingActionRef.current !== null').length - 1).toBe(2);
  });

  it('the proxy normalizes the pending contact before the card is created', () => {
    expect(proxySource).toContain("from '../_shared/contact-normalize.ts'");
    expect(proxySource).toContain('normalizePendingContact({name:');
    // The appointment branch keeps the confirmed store untouched.
    expect(proxySource).toContain(": confirmedContact;");
  });

  it('the VPS proxy closure carries the new shared module', () => {
    expect(deploySource).toContain('contact-normalize.ts');
  });
});
