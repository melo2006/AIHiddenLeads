// Chat-fix4 (2026-11-16): the Aspen panel must size itself against
// the ACTUALLY VISIBLE viewport (window.visualViewport), not the
// layout viewport. On a phone the on-screen keyboard shrinks the
// visual viewport while the layout height stays put, so CSS
// viewport units and layout-height media queries never react —
// the panel kept its full height and the composer slid behind
// the keyboard (Ron's retest screenshots). DraggableFloating
// mirrors the visual viewport into --aspen-available-height and
// toggles the `aspen-vv-short` class; index.css keys the relaxed
// short-viewport panel rules off that class so they fire from
// the visual height in every state, keyboard open or closed.

/** Below this visual height the panel is in its compact regime. */
export const SHORT_VISUAL_VIEWPORT_MAX = 560;

/** Vertical chrome reserved outside the floating panel. */
export const FLOATING_VIEWPORT_RESERVE = 56;

export function isShortVisualViewport(height: number): boolean {
  return height > 0 && height <= SHORT_VISUAL_VIEWPORT_MAX;
}

/** Container class that activates the short-visual-viewport CSS. */
export function visualViewportClass(height: number): string {
  return isShortVisualViewport(height) ? 'aspen-vv-short' : '';
}

/** Value written to --aspen-available-height for a visual height. */
export function availableHeightFor(visualHeight: number): number {
  return Math.max(140, visualHeight - FLOATING_VIEWPORT_RESERVE);
}
