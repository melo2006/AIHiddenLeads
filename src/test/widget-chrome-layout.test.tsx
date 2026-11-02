import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';

// Owner-directed widget chrome: the window controls (minimize / expand /
// close) render BELOW her portrait instead of above her head, the static
// state carries a clear "Talk to Aspen" label under the photo, and the
// minimized launcher is a bigger bubble whose label opens her too.
const baseProps = { mode: 'voice' as const, onOpen: vi.fn(), onClose: vi.fn(), onMinimize: vi.fn(), onMode: vi.fn() };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function expectBefore(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('widget chrome layout', () => {
  it('renders the window controls below her portrait in the open chat state', () => {
    render(<FloatingPersonFrame {...baseProps} open mode="chat"><div>panel</div></FloatingPersonFrame>);
    const portrait = screen.getByAltText('Aspen');
    const close = screen.getByRole('button', { name: 'Close assistant' });
    const minimize = screen.getByRole('button', { name: 'Minimize assistant' });
    expectBefore(portrait, minimize);
    expectBefore(portrait, close);
  });

  it('renders the window controls below the conversation panel in the open voice state', () => {
    render(<FloatingPersonFrame {...baseProps} open><div>conversation panel</div></FloatingPersonFrame>);
    const panel = screen.getByText('conversation panel');
    const close = screen.getByRole('button', { name: 'Close assistant' });
    expectBefore(panel, close);
  });

  it('shows the Talk to Aspen label under her photo when sitting static, keeping the recording notice', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} />);
    const portrait = screen.getByAltText('Aspen');
    const label = screen.getByText('Talk to Aspen', { selector: 'p' });
    expectBefore(portrait, label);
    expect(screen.getByText(/calls are recorded/)).toBeTruthy();
    // Controls sit below the static portrait too.
    expectBefore(portrait, screen.getByRole('button', { name: 'Close assistant' }));
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

  it('keeps the mic-icon fallback for a tenant record with no photo', () => {
    render(<FloatingPersonFrame {...baseProps} open={false} minimized name="Maria Lopez" avatarUrl="" />);
    const launcher = screen.getByRole('button', { name: 'Talk to Maria' });
    expect(launcher.querySelector('img')).toBeNull();
  });
});
