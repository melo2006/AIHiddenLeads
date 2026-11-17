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
    // Header avatar size (Ron, 2026-11-16): 36px read as a
    // thumbnail next to her name — "the avatar is too small,
    // increase the size a little bit" — 56px the same evening, then
    // 72px in chat-fix3 (Ron's second test: he did not notice 56px —
    // "should be a little bigger than what it used to be").
    expect(avatar.className).toContain('h-[72px]');
    expect(avatar.className).toContain('w-[72px]');
    expect(avatar.className).not.toContain('h-9');

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

  it('phone chain: the composer lives INSIDE the panel box, below the thread — the panel is the region\'s flex child, so its bottom (the composer) can never fall below the fold', () => {
    // The widget structure at phone sizes (GeminiAgentWidget /
    // AspenDemoWidget markup): the .aspen-panel wraps the chat
    // surface; the composer is the surface's last in-flow child.
    // jsdom does no layout, so — the established seam — this pins
    // the DOM containment the CSS cap chain acts on: dock → region
    // → panel → thread … composer, with the composer inside the
    // panel rather than a sibling the region could scroll past.
    const { container } = render(<FloatingPersonFrame {...baseProps} open>
      <div className="aspen-panel min-h-80 overflow-hidden rounded-lg border border-border bg-card">
        <div className="aspen-chat-content">
          <div>
            <div data-testid="fit-thread">thread</div>
            <div data-testid="fit-composer">composer</div>
          </div>
        </div>
      </div>
    </FloatingPersonFrame>);
    const dock = screen.getByTestId('aspen-chat-dock');
    const panel = container.querySelector('.aspen-panel') as HTMLElement;
    const thread = screen.getByTestId('fit-thread');
    const composer = screen.getByTestId('fit-composer');
    const region = thread.closest('.overflow-y-auto') as HTMLElement;

    expect(dock.contains(panel)).toBe(true);
    expect(panel.parentElement).toBe(region);
    expect(region.parentElement).toBe(dock);
    // The composer is inside the panel's box — never a direct child
    // of the scroll region — and follows the thread in DOM order.
    expect(panel.contains(composer)).toBe(true);
    expect(composer.closest('.aspen-panel')).toBe(panel);
    expect(region.contains(composer)).toBe(true);
    expect(thread.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The panel keeps its overflow clip, so an over-tall surface
    // clips at the panel's own box while the thread scrolls inside.
    expect(panel.className).toContain('overflow-hidden');
  });

  it('closed frame: no scroll region is rendered (prewarm/hidden branches untouched)', () => {
    const { container } = render(<FloatingPersonFrame {...baseProps} open={false} keepRendered><div>panel body</div></FloatingPersonFrame>);
    const wrapper = screen.getByText('panel body').parentElement;
    expect(wrapper?.className).toContain('aspen-prewarm-offscreen');
    expect(container.querySelector('.overflow-y-auto')).toBeNull();
  });
});
