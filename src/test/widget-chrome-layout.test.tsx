import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame, { type Stage3Controls } from '@/components/FloatingPersonFrame';

// Three-stage widget chrome (Ron, 2026-11-08 — reverses the 2026-11-03
// controls-v2 ruling): Stage 1 is ONE small bubble with a single "Tap to
// talk" label and no stacked bars; Stage 2 (open) pins a Voice/Type
// segmented toggle at the top, keeps the recording disclosure as small print
// inside the open view, and splits window controls into dash = minimize
// (session preserved) and X = END the conversation; Stage 3 (minimized
// while talking) is her bubble head with a pulsing live ring + one slim
// control bar — no thread, no captions.
const baseProps = { mode: 'voice' as const, onOpen: vi.fn(), onClose: vi.fn(), onMinimize: vi.fn(), onMode: vi.fn() };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function expectBefore(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

function expectNoLegacyControls() {
  expect(screen.queryByRole('button', { name: 'Close assistant' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Minimize assistant' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Expand assistant' })).toBeNull();
}

const stage3: Stage3Controls = {
  suspended: false, muted: false, speakerMuted: false, hasReplay: true, replaying: false,
  onToggleSuspend: vi.fn(), onEnd: vi.fn(), onToggleMic: vi.fn(), onToggleSpeaker: vi.fn(), onReplay: vi.fn(),
};

describe('widget chrome layout — three stages', () => {
  it('stage 2: the Voice/Type segmented toggle is pinned at the top of the open panel', () => {
    render(<FloatingPersonFrame {...baseProps} open mode="chat"><div>panel</div></FloatingPersonFrame>);
    const toggle = screen.getByRole('group', { name: 'Conversation mode' });
    const portrait = screen.getByAltText('Aspen');
    expectBefore(toggle, portrait);
    const voice = screen.getByRole('button', { name: /Voice/ });
    const type = screen.getByRole('button', { name: /Type/ });
    expect(voice.getAttribute('aria-pressed')).toBe('false');
    expect(type.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(voice);
    expect(baseProps.onMode).toHaveBeenCalledWith('voice');
  });

  it('stage 2: dash minimizes without ending; X ends the conversation', () => {
    render(<FloatingPersonFrame {...baseProps} open><div>conversation panel</div></FloatingPersonFrame>);
    const panel = screen.getByText('conversation panel');
    const dash = screen.getByRole('button', { name: 'Minimize' });
    const x = screen.getByRole('button', { name: 'End conversation' });
    expectBefore(panel, dash);
    expectBefore(panel, x);
    // The X keeps the chest-overlay positioning on her portrait.
    expect(x.className).toContain('aspen-person-x-overlay');
    expectNoLegacyControls();
    fireEvent.click(dash);
    expect(baseProps.onMinimize).toHaveBeenCalledTimes(1);
    expect(baseProps.onClose).not.toHaveBeenCalled();
    fireEvent.click(x);
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    expect(baseProps.onMinimize).toHaveBeenCalledTimes(1);
  });

  it('stage 2: the recording disclosure is small print inside the open view only', () => {
    render(<FloatingPersonFrame {...baseProps} open><div>panel</div></FloatingPersonFrame>);
    expect(screen.getByText(/calls are recorded/i)).toBeTruthy();
    cleanup();
    render(<FloatingPersonFrame {...baseProps} open={false} />);
    expect(screen.queryByText(/calls are recorded/i)).toBeNull();
  });

  it('stage 1: one small bubble and the single "Tap to talk" label — no stacked bars, no window controls', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} />);
    expect(screen.getByText('Tap to talk', { selector: 'span' })).toBeTruthy();
    // No second label bar from the old stack.
    expect(screen.queryByText('Talk to Aspen', { selector: 'p' })).toBeNull();
    expect(screen.queryByText(/Tap to talk ·/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'End conversation' })).toBeNull();
    expectNoLegacyControls();
    // Clicking the bubble opens Stage 2.
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Aspen' }));
    expect(baseProps.onOpen).toHaveBeenCalledTimes(1);
  });

  it('stage 1: the bubble face crop class keeps the raised hand out of the small circle', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} />);
    const bubble = screen.getByRole('button', { name: 'Talk to Aspen' });
    const img = bubble.querySelector('img');
    expect(img?.className).toContain('aspen-bubble-face');
    const circle = img?.closest('span');
    expect(circle?.className).toContain('rounded-full');
    expect(circle?.className).toContain('h-20');
  });

  it('stage 1: keeps the mic-icon fallback for a tenant record with no photo', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} name="Maria Lopez" avatarUrl="" />);
    const bubble = screen.getByRole('button', { name: 'Talk to Maria' });
    expect(bubble.querySelector('img')).toBeNull();
    expect(screen.getByText('Tap to talk', { selector: 'span' })).toBeTruthy();
  });

  it('stage 3: bubble head with a live ring and one slim bar — pause, disconnect, mic, speaker, replay, maximize', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} minimized stage3={stage3}><div>conversation</div></FloatingPersonFrame>);
    const bar = screen.getByRole('group', { name: 'Call controls' });
    expect(bar).toBeTruthy();
    expect(screen.getByText('Call live')).toBeTruthy();
    const head = screen.getByRole('button', { name: 'Open Aspen' });
    expect(head.querySelector('.aspen-live-ring')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause conversation' }));
    expect(stage3.onToggleSuspend).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(stage3.onEnd).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    expect(stage3.onToggleMic).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Silence speaker' }));
    expect(stage3.onToggleSpeaker).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Replay last message' }));
    expect(stage3.onReplay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    expect(baseProps.onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(head);
    expect(baseProps.onOpen).toHaveBeenCalledTimes(2);
    expectNoLegacyControls();
  });

  it('stage 3: a suspended call shows Resume and a paused ring state', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} minimized stage3={{ ...stage3, suspended: true }}><div>conversation</div></FloatingPersonFrame>);
    expect(screen.getByText('Call paused')).toBeTruthy();
    const head = screen.getByRole('button', { name: 'Open Aspen' });
    expect(head.querySelector('.aspen-live-ring-paused')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume conversation' }));
    expect(stage3.onToggleSuspend).toHaveBeenCalledTimes(1);
  });

  it('minimized without a live session keeps the legacy reopen launcher', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} minimized />);
    const launcher = screen.getByRole('button', { name: 'Talk to Aspen' });
    const bubble = launcher.querySelector('span');
    expect(bubble?.className).toContain('h-[72px]');
    expect(bubble?.className).toContain('w-[72px]');
    expect(screen.queryByRole('group', { name: 'Call controls' })).toBeNull();
    fireEvent.click(screen.getByText('Talk to Aspen', { selector: 'span' }));
    expect(baseProps.onOpen).toHaveBeenCalledTimes(1);
  });
});
