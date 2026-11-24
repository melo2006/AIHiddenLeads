export type FloatingViewport = { left: number; top: number; width: number; height: number };

/**
 * The ONE tracked viewport rect every positioning path for the
 * position:fixed floating shell derives from (fix batch 2026-11-24).
 *
 * `left`/`top` are always 0: the shell is `position: fixed`, so its
 * left/top are already resolved against the visual viewport's own
 * origin by the browser. Adding the visual viewport's own offset
 * (its offset WITHIN the layout viewport) on top
 * double-counts that offset — on Android Chrome the panel seated too
 * low by exactly that amount. Only the visual viewport's SIZE is
 * tracked here; the layout viewport's width/height must never feed
 * a positioning path (the document element's client size is used
 * only as the no-visualViewport fallback in readFloatingViewport).
 */
export function readFloatingViewport(): FloatingViewport {
  if (typeof window === "undefined") return { left: 0, top: 0, width: 0, height: 0 };
  const visual = window.visualViewport;
  return {
    left: 0,
    top: 0,
    width: visual?.width ?? document.documentElement?.clientWidth ?? 0,
    height: visual?.height ?? document.documentElement?.clientHeight ?? 0,
  };
}

export function floatingCornerPosition(size: { width: number; height: number }, viewport: FloatingViewport, inset = 12) {
  return fitFloatingPosition({ x: viewport.left + viewport.width - size.width - inset, y: viewport.top + viewport.height - size.height - inset }, size, viewport);
}

export function fitFloatingPosition(position: { x: number; y: number }, size: { width: number; height: number }, viewport: FloatingViewport, padding = 12) {
  return {
    x: Math.min(Math.max(position.x, viewport.left + padding), Math.max(viewport.left + padding, viewport.left + viewport.width - size.width - padding)),
    y: Math.min(Math.max(position.y, viewport.top + padding), Math.max(viewport.top + padding, viewport.top + viewport.height - size.height - padding)),
  };
}