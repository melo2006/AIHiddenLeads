import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';
import { AspenModeToggle, PersonaNameLabel } from '@/components/FloatingPersonFrame';

// Chat-fix4 (Ron, 2026-11-16 — his redesign after the chat-fix3 phone
// retest, incl. the unfolded/Fold screenshots):
//  * the composer gets TWO layouts — idle single row; typing layout
//    (focused or holding text) with the field at FULL width and the
//    controls on a row below — and the dictation mic renders in both,
//    always, even with text present (Send appears alongside it);
//  * the suggestion chips are ONE horizontal sideways-scroll row
//    pinned above the composer (never stacked inside the thread);
//  * while typing, the chips row hides (display-only) and returns
//    on blur (the "Email transcript" line shared that behaviour in
//    fix4; chat-fix5 removed the line from the panel entirely — the
//    absence is pinned below and the pop-up in chat-fix5's suite);
//  * the Voice/Type toggle gains an icon-only compact form for the
//    merged one-line control row, and the presenter name becomes the
//    seam pill straddling the voice panel's top-left edge.

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (name: string) => (
    name === 'retell-web-call'
      ? { data: { content: 'Happy to help with that!' }, error: null }
      : { data: null, error: null }
  )),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

const chatProps = {
  businessName: 'AI Hidden Leads',
  businessNiche: 'general',
  websiteUrl: 'https://aihiddenleads.com',
  businessInfo: 'AI voice and chat assistants.',
  embedded: true,
  active: true,
};

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeRecognition.instances.push(this); }
  start() { /* no-op */ }
  stop() { this.onend?.(); }
  abort() { /* no-op */ }
}

beforeEach(() => {
  mocks.invoke.mockClear();
  FakeRecognition.instances = [];
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

const openChat = (ui: React.ReactElement) => {
  const view = render(ui);
  fireEvent.click(screen.getByText('Start chat & agree'));
  return view;
};

describe('chat-fix4 composer — typing layout + mic always visible', () => {
  it('idle is the single row; focus switches to the typing layout (full-width field); the mic stays rendered beside Send once text exists', async () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    openChat(<ChatWidget {...chatProps} onVoiceMode={vi.fn()} />);
    const composer = screen.getByTestId('chat-composer');
    const field = screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement;

    // IDLE: single row — the field flexes between the buttons.
    expect(composer.getAttribute('data-layout')).toBe('idle');
    expect(field.className).toContain('flex-1');
    expect(field.className).not.toContain('basis-full');
    // The mic is there from the start.
    expect(screen.getByTestId('chat-dictate-button')).toBeTruthy();

    // TYPING: focus alone switches the layout; the field takes the
    // full composer width and grows a two-line minimum.
    fireEvent.focus(field);
    expect(composer.getAttribute('data-layout')).toBe('typing');
    expect(field.className).toContain('basis-full');
    expect(field.className).toContain('min-h-[3.25rem]');

    // With text present, Send appears ALONGSIDE the mic — the mic
    // never unmounts (Ron's explicit contrast with other apps).
    fireEvent.change(field, { target: { value: 'How much does it cost?' } });
    expect(screen.getByRole('button', { name: /send message/i })).toBeTruthy();
    expect(screen.getByTestId('chat-dictate-button')).toBeTruthy();

    // Clearing the text and blurring returns the idle row.
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(composer.getAttribute('data-layout')).toBe('idle');
  });
});

describe('chat-fix4 chips + space reclamation while typing', () => {
  it('the chips form ONE horizontal scroll row above the composer and hide while typing', async () => {
    openChat(<ChatWidget {...chatProps} onVoiceMode={vi.fn()} />);
    const chips = screen.getByTestId('chat-chips');
    const scroll = chips.querySelector('[data-chips-scroll]');
    expect(scroll).toBeTruthy();
    expect(scroll!.className).toContain('flex-nowrap');
    expect(scroll!.className).toContain('overflow-x-auto');
    const buttons = scroll!.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    buttons.forEach((b) => {
      expect(b.className).toContain('shrink-0');
      expect(b.className).toContain('whitespace-nowrap');
    });
    // The chips no longer live inside the message list.
    const list = screen.getByTestId('chat-message-list');
    expect(list.querySelector('[data-testid="chat-chips"]')).toBeNull();

    const field = screen.getByLabelText(/message aspen/i);
    fireEvent.focus(field);
    expect(chips.className).toContain('hidden');
    fireEvent.blur(field);
    expect(chips.className).not.toContain('hidden');
  });

  it('chat-fix5: NO inline email-transcript block exists in the panel in any state (it moved to the end-of-chat pop-up)', async () => {
    openChat(<ChatWidget {...chatProps} onVoiceMode={vi.fn()} />);
    const field = screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Tell me about pricing' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    // The exchange completes (the mocked reply fully types out)…
    await screen.findByText('Happy to help with that!');
    // …and no inline email block appears — not idle, not typing.
    expect(screen.queryByTestId('chat-email-transcript')).toBeNull();
    fireEvent.focus(field);
    expect(screen.queryByTestId('chat-email-transcript')).toBeNull();
    fireEvent.blur(field);
    expect(screen.queryByTestId('chat-email-transcript')).toBeNull();
  });
});

describe('chat-fix4 frame pieces — compact toggle + seam name pill', () => {
  it('the compact Voice/Type toggle is icon-only with localized aria-labels and tooltips', () => {
    render(<AspenModeToggle compact mode="voice" onMode={vi.fn()} />);
    const group = screen.getByTestId('aspen-mode-toggle');
    const voice = within(group).getByRole('button', { name: 'Voice' });
    const type = within(group).getByRole('button', { name: 'Type' });
    expect(voice.textContent).toBe('');
    expect(type.textContent).toBe('');
    expect(voice.getAttribute('aria-pressed')).toBe('true');
    expect(type.getAttribute('aria-pressed')).toBe('false');
    expect(type.getAttribute('title')).toBe('Type');
  });

  it('the seam name pill floats at the panel top-left, straddling the seam', () => {
    render(<PersonaNameLabel name="Aspen" variant="seam" />);
    const pill = screen.getByTestId('persona-name-label');
    expect(pill.textContent).toBe('Aspen');
    expect(pill.className).toContain('absolute');
    expect(pill.className).toContain('left-2');
    expect(pill.className).toContain('top-0');
    expect(pill.className).toContain('-translate-y-1/2');
    expect(pill.className).toContain('pointer-events-none');
  });
});

describe('chat-fix4 — keyboard-fit CSS is keyed to the VISUAL viewport', () => {
  it('the vv-short rules relax the chat floor, the voice floor and the livebox', () => {
    const css = read('index.css');
    expect(css).toContain('.aspen-vv-short .aspen-chat-dock .aspen-panel { min-height: 0; }');
    expect(css).toContain('.aspen-vv-short .aspen-voice-panel { min-height: 0; }');
    expect(css).toContain('.aspen-vv-short .aspen-person-livebox { width: 150px; height: 120px; }');
    expect(css).toContain('.aspen-vv-short .aspen-person-shell.aspen-person-focus .aspen-person-livebox { width: 187px; height: 150px; }');
  });
});
