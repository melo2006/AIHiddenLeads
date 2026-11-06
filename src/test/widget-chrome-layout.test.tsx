import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';

// Owner-directed widget chrome ("controls v2", built in AI Studio): there is
// no dash/minimize button and no separate close button. A single X — labelled
// "Minimize" — collapses the widget into the round bubble, and CSS overlays
// that X (with the drag handle) on her chest instead of in a header bar. The
// static state carries a clear "Talk to Aspen" label under the photo, and the
// minimized launcher is a bigger bubble whose label opens her too.
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

describe('widget chrome layout', () => {
  it('renders the single X below her portrait in the open chat state, overlaid on her chest', () => {
    render(<FloatingPersonFrame {...baseProps} open mode="chat"><div>panel</div></FloatingPersonFrame>);
    const portrait = screen.getByAltText('Aspen');
    const x = screen.getByRole('button', { name: 'Minimize' });
    expectBefore(portrait, x);
    // The X is not a header button: it carries the overlay positioning class
    // that places it on her chest, next to the drag handle.
    expect(x.className).toContain('aspen-person-x-overlay');
    expectNoLegacyControls();
    // The X minimizes; it never closes/ends the assistant.
    fireEvent.click(x);
    expect(baseProps.onMinimize).toHaveBeenCalledTimes(1);
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it('renders the single X below the conversation panel in the open voice state', () => {
    render(<FloatingPersonFrame {...baseProps} open><div>conversation panel</div></FloatingPersonFrame>);
    const panel = screen.getByText('conversation panel');
    const x = screen.getByRole('button', { name: 'Minimize' });
    expectBefore(panel, x);
    expect(x.className).toContain('aspen-person-x-overlay');
    expectNoLegacyControls();
  });

  it('shows the Talk to Aspen label under her photo when sitting static, keeping the recording notice', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} />);
    const portrait = screen.getByAltText('Aspen');
    const label = screen.getByText('Talk to Aspen', { selector: 'p' });
    expectBefore(portrait, label);
    expect(screen.getByText(/calls are recorded/)).toBeTruthy();
    // The X is present in the static state too, after the portrait in the DOM
    // (CSS lifts it onto her chest).
    expectBefore(portrait, screen.getByRole('button', { name: 'Minimize' }));
    expectNoLegacyControls();
  });

  it('uses the agent first name for the static label on tenant surfaces', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} name="Maria Lopez" avatarUrl="https://example.com/maria.jpg" />);
    expect(screen.getByText('Talk to Maria', { selector: 'p' })).toBeTruthy();
  });

  it('enlarges the minimized launcher bubble and opens when its label is clicked', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} minimized />);
    const launcher = screen.getByRole('button', { name: 'Talk to Aspen' });
    const bubble = launcher.querySelector('span');
    expect(bubble?.className).toContain('h-[72px]');
    expect(bubble?.className).toContain('w-[72px]');
    // The label lives inside the same button, so tapping the words opens her.
    fireEvent.click(screen.getByText('Talk to Aspen', { selector: 'span' }));
    expect(baseProps.onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows no X or other window control on the minimized bubble', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} minimized />);
    expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull();
    expectNoLegacyControls();
    expect(screen.getByRole('button', { name: 'Talk to Aspen' })).toBeTruthy();
  });

  it('keeps the mic-icon fallback for a tenant record with no photo', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} minimized name="Maria Lopez" avatarUrl="" />);
    const launcher = screen.getByRole('button', { name: 'Talk to Maria' });
    expect(launcher.querySelector('img')).toBeNull();
  });
});
