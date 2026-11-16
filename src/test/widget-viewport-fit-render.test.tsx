import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from "../i18n/locales/en.json";
import FloatingPersonFrame from '@/components/FloatingPersonFrame';

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


// Rendered-structure companion to widget-viewport-fit.test.ts (which pins
// the stylesheet): the open frame must place its children in the flex
// squeeze/scroll region, while the portrait and the Voice/Type toggle stay
// OUTSIDE that region as pinned shell children — in that DOM order.
const baseProps = { mode: 'chat' as const, onOpen: vi.fn(), onClose: vi.fn(), onMinimize: vi.fn(), onMode: vi.fn() };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('widget viewport fit — rendered shell structure', () => {
  it('open chat: slim header strip (small avatar + name), controls and toggle are pinned in the dock; the panel lives in the flex scroll region', () => {
    const { container } = render(<FloatingPersonFrame {...baseProps} open><div>panel body</div></FloatingPersonFrame>);
    const shell = container.querySelector('.aspen-person-shell');
    expect(shell?.classList.contains('aspen-person-expanded')).toBe(true);
    // Chat mode widens the shell (2026-11-16) so text lines run long.
    expect(shell?.classList.contains('aspen-person-chat')).toBe(true);

    const region = screen.getByText('panel body').parentElement;
    expect(region?.className).toContain('flex');
    expect(region?.className).toContain('min-h-0');
    expect(region?.className).toContain('flex-1');
    expect(region?.className).toContain('overflow-y-auto');
    expect(region?.className).toContain('overscroll-contain');

    // CHAT LAYOUT (2026-11-16): the big portrait no longer sits above
    // the dock eating the reading space — she collapses to the small
    // round avatar in the dock's header strip, with her name beside it.
    expect(screen.queryByAltText('Aspen')).toBeNull();
    const strip = screen.getByTestId('aspen-chat-header');
    const avatar = screen.getByTestId('aspen-chat-avatar');
    expect(strip.contains(avatar)).toBe(true);
    expect(strip.textContent).toContain('Aspen');

    // Header strip, window-controls row and toggle are NOT inside the
    // scroll region — they cannot be scrolled or squeezed off the top.
    const toggle = screen.getByRole('group', { name: 'Conversation mode' });
    const controls = screen.getByRole('group', { name: 'Window controls' });
    expect(region?.contains(avatar)).toBe(false);
    expect(region?.contains(toggle)).toBe(false);
    expect(region?.contains(controls)).toBe(false);
    // DOM order: header strip → window controls → toggle → region.
    expect(avatar.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(controls.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(region as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('open chat: tapping the small header avatar returns to the big-avatar (voice) view', () => {
    const onMode = vi.fn();
    render(<FloatingPersonFrame {...baseProps} onMode={onMode} open><div>panel body</div></FloatingPersonFrame>);
    screen.getByTestId('aspen-chat-avatar').click();
    expect(onMode).toHaveBeenCalledWith('voice');
  });

  it('closed frame: no scroll region is rendered (prewarm/hidden branches untouched)', () => {
    const { container } = render(<FloatingPersonFrame {...baseProps} open={false} keepRendered><div>panel body</div></FloatingPersonFrame>);
    const wrapper = screen.getByText('panel body').parentElement;
    expect(wrapper?.className).toContain('aspen-prewarm-offscreen');
    expect(container.querySelector('.overflow-y-auto')).toBeNull();
  });
});
