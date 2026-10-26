export type FloatingViewport = { left: number; top: number; width: number; height: number };

export function fitFloatingPosition(position: { x: number; y: number }, size: { width: number; height: number }, viewport: FloatingViewport, padding = 12) {
  return {
    x: Math.min(Math.max(position.x, viewport.left + padding), Math.max(viewport.left + padding, viewport.left + viewport.width - size.width - padding)),
    y: Math.min(Math.max(position.y, viewport.top + padding), Math.max(viewport.top + padding, viewport.top + viewport.height - size.height - padding)),
  };
}