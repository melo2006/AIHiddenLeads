import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame, { AspenWindowControls, type Stage3Controls } from '@/components/FloatingPersonFrame';

// Three-stage widget chrome (Ron, 2026-11-08 — reverses the 2026-11-03
// controls-v2 ruling): Stage 1 is ONE small bubble with a single "Tap to
// talk" label and no stacked bars; Stage 2 (open) keeps the recording
// disclosure as small print inside the open view and gathers the window
// controls into ONE row INSIDE the panel: drag handle + dash = minimize
// (session preserved) + X = END the conversation, exactly one each. The
// Voice/Type segmented toggle sits directly under that row, between the
// controls and the chat / captions box. Panel layout fix (2026-11-12,
// Ron's circled screenshot): the controls row used to be a "chest
// cluster" absolutely positioned across the portrait's bottom edge,
// slicing her torso — it is now in flow inside the panel, so NO control
// ever overlaps the portrait; Stage 3 (minimized while talking) is her
// bubble head with a pulsing live ring + one slim control bar — no
// thread, no captions.
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
  it('stage 2: the Voice/Type segmented toggle renders BELOW the portrait, above the chat box', () => {
    render(<FloatingPersonFrame {...baseProps} open mode="chat"><div>panel</div></FloatingPersonFrame>);
    const toggle = screen.getByRole('group', { name: 'Conversation mode' });
    const portrait = screen.getByAltText('Aspen');
    // In flow under the portrait: portrait first in DOM order, then the
    // window-controls row, then the toggle, then the chat thread box —
    // never above her, never over her.
    expectBefore(portrait, toggle);
    expectBefore(toggle, screen.getByText('panel'));
    const voice = screen.getByRole('button', { name: /Voice/ });
    const type = screen.getByRole('button', { name: /Type/ });
    expect(voice.getAttribute('aria-pressed')).toBe('false');
    expect(type.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(voice);
    expect(baseProps.onMode).toHaveBeenCalledWith('voice');
  });

  it('stage 2 (chat): exactly one Minimize and one End, with the drag handle, in ONE in-flow row between the portrait and the toggle', () => {
    render(<FloatingPersonFrame {...baseProps} open mode="chat"><div>chat panel</div></FloatingPersonFrame>);
    // Exactly one of each window control in the whole open shell.
    expect(screen.getAllByRole('button', { name: 'Minimize' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'End conversation' })).toHaveLength(1);
    const dash = screen.getByRole('button', { name: 'Minimize' });
    const x = screen.getByRole('button', { name: 'End conversation' });
    // All three controls live in the single window-controls row; the drag
    // handle is the shell's [data-drag-handle] for DraggableFloating.
    const cluster = dash.closest('.aspen-person-chest-cluster');
    expect(cluster).toBeTruthy();
    expect(cluster?.contains(x)).toBe(true);
    const drag = cluster?.querySelector('[data-drag-handle]');
    expect(drag).toBeTruthy();
    expect(drag?.getAttribute('aria-label')).toBe('Drag widget');
    // In flow inside the panel: the portrait ends first, then the row,
    // then the toggle, then the chat box — the row is a shell child in
    // normal flow, NOT an overlay straddling the portrait.
    const portrait = screen.getByAltText('Aspen');
    const toggle = screen.getByRole('group', { name: 'Conversation mode' });
    expectBefore(portrait, cluster as Element);
    expectBefore(cluster as Element, toggle);
    expect(screen.queryByRole('group', { name: 'Window controls' })?.className).toContain('aspen-person-chest-cluster');
    // No face overlay remains: the old portrait-overlay X class is gone.
    expect(x.className).not.toContain('aspen-person-x-overlay');
    expectNoLegacyControls();
    fireEvent.click(dash);
    expect(baseProps.onMinimize).toHaveBeenCalledTimes(1);
    expect(baseProps.onClose).not.toHaveBeenCalled();
    fireEvent.click(x);
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    expect(baseProps.onMinimize).toHaveBeenCalledTimes(1);
  });

  it('stage 2 (voice): the shell renders NO window controls itself — the conversation places the row inside its panel via the windowControls slot', () => {
    // Mirrors the real composition: the widget hands AspenWindowControls
    // to GeminiConversation, which renders it as the first row inside the
    // voice panel card. The stand-in child plays that consumer role.
    render(<FloatingPersonFrame {...baseProps} open mode="voice">
      <div className="aspen-voice-panel"><AspenWindowControls onMinimize={baseProps.onMinimize} onClose={baseProps.onClose} /><div>captions</div></div>
    </FloatingPersonFrame>);
    expect(screen.getAllByRole('button', { name: 'Minimize' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'End conversation' })).toHaveLength(1);
    const dash = screen.getByRole('button', { name: 'Minimize' });
    const cluster = dash.closest('.aspen-person-chest-cluster');
    // The row sits INSIDE the panel element, ahead of the panel content.
    const panel = dash.closest('.aspen-voice-panel');
    expect(panel).toBeTruthy();
    expectBefore(cluster as Element, screen.getByText('captions'));
    fireEvent.click(dash);
    expect(baseProps.onMinimize).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'End conversation' }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
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
