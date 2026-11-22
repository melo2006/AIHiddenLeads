import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from "../i18n/locales/en.json";
import VoiceActionConfirmation, { type VoiceAction } from '@/components/VoiceActionConfirmation';

// Publish #71: components on the demo path read their copy from
// i18next; resolve keys against the real en locale (the pattern from
// demo-reassurance-strip.test.tsx), with interpolation + defaultValue.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const value = key.split(".").reduce<unknown>(
        (acc, part) =>
          acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
        en as unknown,
      );
      let out =
        typeof value === "string"
          ? value
          : typeof options?.defaultValue === "string"
            ? (options.defaultValue as string)
            : key;
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          if (k !== "defaultValue" && (typeof v === "string" || typeof v === "number"))
            out = out.split(`{{${k}}}`).join(String(v));
        }
      }
      return out;
    },
    i18n: { language: "en", resolvedLanguage: "en", changeLanguage: async () => undefined },
  }),
}));


// Publish #65 — the voice-action confirmation card + the card booking
// route's SMS consent.
//
// The owner's phone report: on the appointment card he could not see
// any close control (the built-in Radix close is a 16px glyph) and the
// action buttons fell below the fold — the only way out was tapping
// outside the card. And the bookings completed on that card never sent
// their confirmation text: the proxy's confirmed-action appointment
// route called sendBookingConfirmations with NO smsConsent, so the
// shared engine landed every card booking on 'not_consented' (NULL
// stamp, zero delivery-log rows — the three Nov 16 test bookings; full
// diagnosis in ~/workspace/booking-sms-investigation-2026-11-15.md).
//
// These tests pin: (1) the card's own finger-sized close button,
// wired to the same decline as Not now; (2) the flex layout — a
// scrolling body and a sticky footer that never leaves the screen;
// (3) the appointment card's UNTICKED "Text me this confirmation"
// opt-in and its smsConsent payload; (4) the proxy card route
// resolving consent (card payload first, stored lead answer second)
// and booking with the card-submitted contact.

const APPOINTMENT: VoiceAction = {
  id: 'appt-1',
  action: 'request_platform_appointment',
  contact: { name: 'Roger Miller', email: 'roger@example.com', phone: '+1 954 555 0100' },
  slotStart: '2026-11-16T13:30:00.000Z',
};

const APPOINTMENT_NO_PHONE: VoiceAction = {
  ...APPOINTMENT,
  id: 'appt-2',
  contact: { name: 'Roger Miller', email: 'roger@example.com', phone: '' },
};

const FOLLOWUP: VoiceAction = {
  id: 'fu-1',
  action: 'request_platform_followup',
  contact: { name: 'Roger Miller', email: 'roger@example.com', phone: '+1 954 555 0100' },
};

afterEach(cleanup);

describe('VoiceActionConfirmation — close control and phone layout (Publish #65)', () => {
  it('renders our own finger-sized close button, and clicking it declines exactly like Not now', () => {
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={onAnswer} />);
    // Two buttons answer to "Close": the built-in Radix glyph and ours.
    // Ours is the 40px target (h-10 w-10).
    const closes = screen.getAllByRole('button', { name: 'Close' });
    const ours = closes.find(b => b.className.includes('h-10') && b.className.includes('w-10'));
    expect(ours).toBeTruthy();
    fireEvent.click(ours!);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  it('hides the built-in Radix close so exactly one close control shows', () => {
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    // The sidebar pattern: direct-child buttons of DialogContent (the
    // built-in close is one) are hidden; our close lives one level
    // down inside a wrapper and stays visible.
    expect(dialog.className).toContain('[&>button]:hidden');
  });

  it('fits a phone screen: capped height, scrolling body, sticky footer outside the scroll region', () => {
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-[85dvh]');
    expect(dialog.className).toContain('w-[calc(100vw-24px)]');
    expect(dialog.className).toContain('max-w-sm');
    expect(dialog.className).toContain('flex-col');
    expect(dialog.className).toContain('overflow-hidden');
    // The dialog renders in a Radix portal on document.body.
    const scroller = document.querySelector('.overflow-y-auto');
    expect(scroller).toBeTruthy();
    expect(scroller!.contains(screen.getByLabelText('Confirmed full name'))).toBe(true);
    const confirmBtn = screen.getByRole('button', { name: 'Confirm appointment' });
    // The footer is NOT inside the scrolling body, and it is sticky.
    expect(scroller!.contains(confirmBtn)).toBe(false);
    const footer = confirmBtn.parentElement!;
    expect(footer.className).toContain('sticky');
    expect(footer.className).toContain('bottom-0');
    expect(footer.className).toContain('border-t');
    expect(footer.contains(screen.getByRole('button', { name: 'Not now' }))).toBe(true);
  });

  it('Not now declines without any contact payload', () => {
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(false);
  });
});

describe('VoiceActionConfirmation — SMS opt-in on the appointment card (Publish #65)', () => {
  it('shows an UNTICKED "Text me this confirmation" box when a phone number exists', () => {
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={vi.fn()} />);
    const box = screen.getByLabelText('Text me this confirmation') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
  });

  it('carries smsConsent=true in the confirm payload when the box is ticked', () => {
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByLabelText(/I confirm this appointment/));
    fireEvent.click(screen.getByLabelText('Text me this confirmation'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm appointment' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const [approved, payload] = onAnswer.mock.calls[0] as [boolean, Record<string, unknown>];
    expect(approved).toBe(true);
    expect(payload).toMatchObject({
      name: 'Roger Miller',
      email: 'roger@example.com',
      phone: '+1 954 555 0100',
      consent: true,
      smsConsent: true,
    });
  });

  it('carries smsConsent=false when the box is left unticked', () => {
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={APPOINTMENT} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByLabelText(/I confirm this appointment/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm appointment' }));
    const [, payload] = onAnswer.mock.calls[0] as [boolean, Record<string, unknown>];
    expect(payload.smsConsent).toBe(false);
    expect(payload.consent).toBe(true);
  });

  it('shows no SMS box when the appointment has no phone number', () => {
    render(<VoiceActionConfirmation action={APPOINTMENT_NO_PHONE} onAnswer={vi.fn()} />);
    expect(screen.queryByLabelText('Text me this confirmation')).toBeNull();
  });

  it('keeps the follow-up card free of SMS semantics: payload carries consent only, no smsConsent key', () => {
    const onAnswer = vi.fn();
    render(<VoiceActionConfirmation action={FOLLOWUP} onAnswer={onAnswer} />);
    expect(screen.queryByLabelText('Text me this confirmation')).toBeNull();
    fireEvent.click(screen.getByLabelText(/These details are correct/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const [approved, payload] = onAnswer.mock.calls[0] as [boolean, Record<string, unknown>];
    expect(approved).toBe(true);
    expect(payload.consent).toBe(true);
    expect('smsConsent' in payload).toBe(false);
  });
});

describe('card + proxy source pins (Publish #65)', () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
  const cardSource = read('src/components/VoiceActionConfirmation.tsx');
  const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');

  it('the appointment payload gains smsConsent; the other cards keep the old shape', () => {
    // 2026-11-22 (capture/consent fix, item 1): both payload shapes
    // now also spread `...source` — empty for a tap, and
    // { consentSource: 'verbal' } when the card completed itself on
    // the visitor's spoken yes. smsConsent still rides ONLY the
    // appointment payload, exactly as this pin has always required.
    expect(cardSource).toContain("onAnswer(true, appointment ? { ...valid, consent: true, smsConsent, ...source } : { ...valid, consent: true, ...source });");
    expect(cardSource).toContain("const source = voiceDrivenRef.current ? { consentSource: 'verbal' as const } : {};");
    expect(cardSource).toContain('Text me this confirmation');
    // The opt-in starts unticked and only shows with a phone present.
    expect(cardSource).toContain('const [smsConsent, setSmsConsent] = useState(false);');
    expect(cardSource).toContain('const showSmsOptIn = appointment && contact.phone.trim().length > 0;');
    // The appointment-confirmation box itself is untouched.
    expect(cardSource).toContain("'I confirm this appointment with AI Hidden Leads.'");
  });

  // The appointment branch is the tail of the confirm_action handler:
  // slice from the follow-up branch to the audio branch that follows
  // the handler, so every assertion below is scoped to the card route.
  const followupAt = proxySource.indexOf("action.call.name === 'request_platform_followup'");
  const audioAt = proxySource.indexOf("msg.type === 'audio'", followupAt);
  const cardRoute = proxySource.slice(followupAt, audioAt);

  it('the card route books with the card-submitted contact, not the session snapshot', () => {
    expect(followupAt).toBeGreaterThan(-1);
    expect(audioAt).toBeGreaterThan(followupAt);
    expect(cardRoute).toContain('const cardContact = msg.contact ? confirmedVisitorContact(msg.contact) : confirmedContact;');
    expect(cardRoute).toContain('bookPlatformCall(db,{...cardContact,businessName:String(config.businessName),slotStart:action.slotStart,smsConsent:smsConsent === true})');
    expect(cardRoute).not.toContain('bookPlatformCall(db,{...confirmedContact,businessName:String(config.businessName),slotStart:action.slotStart})');
  });

  it('the card route resolves smsConsent: card payload first, stored lead answer as fallback', () => {
    expect(cardRoute).toContain("let smsConsent = typeof msg.contact?.smsConsent === 'boolean' ? msg.contact.smsConsent : undefined;");
    expect(cardRoute).toContain('if (smsConsent === undefined && session.lead_id) {');
    expect(cardRoute).toContain("db.from('leads').select('sms_consent').eq('id', session.lead_id).maybeSingle()");
    // The fallback runs only after the payload read.
    expect(cardRoute.indexOf('msg.contact?.smsConsent')).toBeLessThan(cardRoute.indexOf("select('sms_consent')"));
  });

  it('the card route passes smsConsent into the shared confirmation engine', () => {
    expect(cardRoute).toContain('sendBookingConfirmations(db, booked, {...cardContact');
    expect(cardRoute).toContain('slotStart:action.slotStart,smsConsent:smsConsent === true}); }');
    expect(cardRoute).not.toContain('sendBookingConfirmations(db, booked, {...confirmedContact');
  });

  it('the book_call route keeps its own consent resolution (parity, not replacement)', () => {
    expect(proxySource).toContain("let smsConsent = typeof call.args?.smsConsent === 'boolean' ? call.args.smsConsent : undefined;");
    // Exactly two routes read the stored lead answer: book_call + card.
    expect(proxySource.split("select('sms_consent')").length - 1).toBe(2);
  });
});
