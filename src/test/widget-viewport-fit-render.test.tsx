import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';

// Rendered-structure companion to widget-viewport-fit.test.ts (which pins
// the stylesheet): the open frame must place its children in the flex
// squeeze/scroll region, while the portrait and the Voice/Type toggle stay
// OUTSIDE that region as pinned shell children — in that DOM order.
const baseProps = { mode: 'chat' as const, onOpen: vi.fn(), onClose: vi.fn(), onMinimize: vi.fn(), onMode: vi.fn() };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('widget viewport fit — rendered shell structure', () => {
  it('open chat: portrait and toggle are pinned siblings; the panel lives in the flex scroll region', () => {
    const { container } = render(<FloatingPersonFrame {...baseProps} open><div>panel body</div></FloatingPersonFrame>);
    const shell = container.querySelector('.aspen-person-shell');
    expect(shell?.classList.contains('aspen-person-expanded')).toBe(true);

    const region = screen.getByText('panel body').parentElement;
    expect(region?.className).toContain('flex');
    expect(region?.className).toContain('min-h-0');
    expect(region?.className).toContain('flex-1');
    expect(region?.className).toContain('overflow-y-auto');
    expect(region?.className).toContain('overscroll-contain');

    // Portrait, window-controls row and toggle are NOT inside the scroll
    // region — they cannot be scrolled or squeezed off the top.
    const portrait = screen.getByAltText('Aspen');
    const toggle = screen.getByRole('group', { name: 'Conversation mode' });
    const controls = screen.getByRole('group', { name: 'Window controls' });
    expect(region?.contains(portrait)).toBe(false);
    expect(region?.contains(toggle)).toBe(false);
    expect(region?.contains(controls)).toBe(false);
    // DOM order: portrait → window controls → toggle → region (the
    // controls row is in flow inside the panel since the 2026-11-12
    // panel layout fix — no overlay on the portrait).
    expect(portrait.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(controls.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(region as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('closed frame: no scroll region is rendered (prewarm/hidden branches untouched)', () => {
    const { container } = render(<FloatingPersonFrame {...baseProps} open={false} keepRendered><div>panel body</div></FloatingPersonFrame>);
    const wrapper = screen.getByText('panel body').parentElement;
    expect(wrapper?.className).toContain('aspen-prewarm-offscreen');
    expect(container.querySelector('.overflow-y-auto')).toBeNull();
  });
});
