import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AspenModeToggle, PersonaNameLabel } from '@/components/FloatingPersonFrame';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';

// Type/chat mode fix batch (2026-11-14) — Ron's phone test on the
// Frank/Martinez demo: "I've changed to chat version but I did not ask
// for chat somehow — the buttons are not correct and something is just
// not right." Findings pinned here:
//  * The ONLY code path into Type mode is a click on the toggle's Type
//    segment (no persistence, no restore, no event path — audited).
//    The segments were ~24px tall sitting among the window controls,
//    so the toggle now uses full 40px touch targets and ignores any
//    press that travelled (a brush/drag-over is not a choice), and the
//    speaker popover gained a dismiss layer so a dismiss tap can no
//    longer fall through onto the toggle.
//  * The typed chat on a presenter demo greeted as the presenter but
//    its brain prompt still said "You are Aspen" and it never saw the
//    demo's listings pack. The brain now IS the presenter and carries
//    the pack; every Aspen surface keeps the legacy prompt untouched.

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

afterEach(() => cleanup());
beforeEach(() => { mocks.invoke.mockClear(); });

// jsdom has no PointerEvent constructor, so fireEvent.pointerDown
// reaches React with null coordinates; a native MouseEvent dispatch
// carries the press point the toggle's travel guard reads.
const pressAt = (el: Element, clientX: number, clientY: number) => {
  act(() => { el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX, clientY })); });
};

describe('mode toggle — deliberate taps only', () => {
  it('both segments stay fully visible in both states, as 40px touch targets', () => {
    for (const mode of ['voice', 'chat'] as const) {
      const view = render(<AspenModeToggle mode={mode} onMode={vi.fn()} />);
      const voice = screen.getByRole('button', { name: /voice/i });
      const type = screen.getByRole('button', { name: /type/i });
      expect(voice.getAttribute('aria-pressed')).toBe(String(mode === 'voice'));
      expect(type.getAttribute('aria-pressed')).toBe(String(mode === 'chat'));
      // The fix for the accidental flips: segments are deliberate
      // thumb-sized targets, not the old ~24px px-2.5 py-1 text-[11px].
      expect(type.className).toContain('min-h-10');
      expect(voice.className).toContain('min-h-10');
      view.unmount();
    }
  });

  it('a clean tap on Type switches mode', () => {
    const onMode = vi.fn();
    render(<AspenModeToggle mode="voice" onMode={onMode} />);
    const type = screen.getByRole('button', { name: /type/i });
    pressAt(type, 100, 200);
    fireEvent.click(type, { clientX: 102, clientY: 201 });
    expect(onMode).toHaveBeenCalledTimes(1);
    expect(onMode).toHaveBeenCalledWith('chat');
  });

  it('a brush across the segment (press travels) does NOT switch mode', () => {
    const onMode = vi.fn();
    render(<AspenModeToggle mode="voice" onMode={onMode} />);
    const type = screen.getByRole('button', { name: /type/i });
    pressAt(type, 100, 200);
    fireEvent.click(type, { clientX: 145, clientY: 200 });
    expect(onMode).not.toHaveBeenCalled();
  });

  it('keyboard activation (click with no pointer press) still switches', () => {
    const onMode = vi.fn();
    render(<AspenModeToggle mode="chat" onMode={onMode} />);
    fireEvent.click(screen.getByRole('button', { name: /voice/i }));
    expect(onMode).toHaveBeenCalledWith('voice');
  });
});

describe('presenter typed chat — the brain is the presenter', () => {
  const chatProps = {
    businessName: 'Michael Martinez Group',
    businessNiche: 'realtors',
    websiteUrl: 'https://michaelmartinezrealtor.com',
    businessInfo: 'A Miami real estate team.',
    callerName: 'John Doe',
    embedded: true,
    active: true,
  };
  const listingsDigest = '- the Coral Ridge Isles house on NE 49th Street (3 bed, 2 bath, $925,000) — Pool home in a quiet, boater-friendly neighborhood.';

  const chatCompletionPrompt = () => {
    const call = mocks.invoke.mock.calls.find(([name]) => name === 'retell-web-call');
    expect(call).toBeTruthy();
    return (call as unknown as [string, { body: { systemPrompt: string } }])[1].body.systemPrompt;
  };

  it('Frank demo: prompt names Frank, never Aspen, and carries the listings pack', async () => {
    render(<ChatWidget {...chatProps} presenterName="Frank" presenterKnowledge={listingsDigest} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    fireEvent.click(screen.getByText('What services do you offer for buyers and sellers?'));
    await waitFor(() => expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(true));
    const prompt = chatCompletionPrompt();
    expect(prompt).toContain('You are Frank, the AI chat assistant for Michael Martinez Group');
    expect(prompt).toContain('PRESENTER DEMO');
    expect(prompt).toContain('never call yourself Aspen');
    expect(prompt).not.toContain('You are Aspen');
    expect(prompt).toContain('the Coral Ridge Isles house on NE 49th Street');
    expect(prompt).toContain('$925,000');
    // The reply streams in on real timers (350ms pause + per-chunk
    // delays); under parallel-suite CPU load that outlasts waitFor's
    // 1s default, so this end-to-end wait gets an explicit budget.
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
  });

  it('presenter starter questions name the presenter, not Aspen', async () => {
    render(<ChatWidget {...chatProps} businessNiche="general" presenterName="Frank" />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    await waitFor(() => expect(screen.getByText('What can Frank do for my business?')).toBeTruthy());
    expect(screen.queryByText('What can Aspen do for my business?')).toBeNull();
  });

  it('no presenter: the legacy Aspen prompt is sent unchanged', async () => {
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    fireEvent.click(screen.getByText('What services do you offer for buyers and sellers?'));
    await waitFor(() => expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(true));
    const prompt = chatCompletionPrompt();
    expect(prompt).toContain('You are Aspen, the AI chat assistant for Michael Martinez Group');
    expect(prompt).not.toContain('PRESENTER DEMO');
    expect(prompt).not.toContain('CURRENT LISTINGS FOR THIS BUSINESS');
    // The reply streams in on real timers (350ms pause + per-chunk
    // delays); under parallel-suite CPU load that outlasts waitFor's
    // 1s default, so this end-to-end wait gets an explicit budget.
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
  });
});

describe('name badge — left and bold on the chest (Ron, 2026-11-14)', () => {
  it('the overlay badge sits at the left of the chest in bold', () => {
    const view = render(<PersonaNameLabel name="Frank" />);
    const badge = view.getByTestId('persona-name-label');
    expect(badge.className).toContain('left-2');
    expect(badge.className).not.toContain('left-1/2');
    expect(badge.className).not.toContain('-translate-x-1/2');
    expect(badge.querySelector('span')?.className).toContain('font-bold');
  });

  it('the focus-view dock pill is NOT moved or re-weighted by that order', () => {
    const view = render(<PersonaNameLabel name="Frank" variant="dock" />);
    const badge = view.getByTestId('persona-name-label');
    expect(badge.className).not.toContain('absolute');
    expect(badge.querySelector('span')?.className).toContain('font-semibold');
  });
});

describe('control row containment + focus view — source pins', () => {
  it('the transport row is constrained to its slot so it can never spill over the toggle', () => {
    const source = read('components/GeminiConversation.tsx');
    expect(source).toContain('voice-controls flex w-full min-w-0 flex-nowrap');
  });

  it('the landscape centre slot has a floor, so a narrow panel wraps the transport instead of crushing it', () => {
    const source = read('components/GeminiConversation.tsx');
    expect(source).toContain('min-w-[12.5rem] flex-1 justify-center');
  });

  it('focus view hides (never unmounts) the toggle/Manager row, per the approved mockup', () => {
    const source = read('components/GeminiConversation.tsx');
    expect(source).toContain("focusView ? 'hidden' : 'contents'");
  });

  it('the demo panel rhythm is tightened without touching the caption space', () => {
    const source = read('components/GeminiConversation.tsx');
    expect(source).toContain('aspen-voice-panel relative z-10 flex min-h-0 flex-1 flex-col space-y-1.5');
    const css = read('index.css');
    expect(css).toContain('.aspen-caption-space { height: 86px;');
  });
});

describe('mode-switch hardening — source pins', () => {
  it('the speaker popover has a dismiss layer that closes it and swallows the tap', () => {
    const source = read('components/GeminiConversation.tsx');
    expect(source).toContain('data-testid="speaker-menu-backdrop"');
    expect(source).toContain('setSpeakerMenuOpen(false)');
  });

  it('the demo widget gates the voice-only focus layout to voice mode and feeds the chat the presenter knowledge', () => {
    const source = read('components/landing/demo-results/AspenDemoWidget.tsx');
    // Focus view is a voice layout (captions-off widened livebox); the
    // stale shell snapshot must not widen the Type-mode shell.
    expect(source).toContain("focus={mode === 'voice' ? (shellState?.focus ?? false) : false}");
    expect(source).toContain('presenterKnowledge={presenterKnowledge}');
    expect(source).toContain('examplePackForSiteUrl');
  });

  it('no mode persistence exists in the shell: a reload always lands on voice', () => {
    for (const rel of ['components/FloatingPersonFrame.tsx', 'components/landing/demo-results/AspenDemoWidget.tsx', 'components/landing/demo-results/DraggableFloating.tsx']) {
      const source = read(rel);
      expect(source).not.toMatch(/(localStorage|sessionStorage)[^\n]*mode/i);
    }
    const widget = read('components/landing/demo-results/AspenDemoWidget.tsx');
    expect(widget).toContain("useState<'voice' | 'chat'>('voice')");
  });
});
