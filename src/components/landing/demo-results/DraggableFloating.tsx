import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import { fitFloatingPosition, floatingCornerPosition, readFloatingViewport, type FloatingViewport } from '@/lib/floatingViewport';
import { availableHeightFor, visualViewportClass } from '@/lib/visualViewport';

const VIEWPORT_PADDING = 12;

interface DraggableFloatingProps {
  children: ReactNode;
  initialX: number;
  initialY: number;
  /** If set, initialX is treated as pixels from the RIGHT edge instead of left */
  anchorRight?: boolean;
  /** If set, initialY is treated as pixels from the BOTTOM edge (an inset)
   * instead of an absolute top. Bottom-anchored shells are seated by
   * floatingCornerPosition against the tracked visual-viewport rect. */
  anchorBottom?: boolean;
  dragLabel?: string;
  resetKey?: string | number;  /** 'below': in-flow pill under the content. 'top': pill at the top of the
   * bubble (minimized stages). 'chest': no pill here — the child shell
   * renders the [data-drag-handle] inside its window-controls row at the
   * top inside the open panel (the row began as the "chest" cluster;
   * since the 2026-11-12 panel layout fix it sits in-flow inside the
   * panel, never over the portrait). Drag delegation is by the
   * [data-drag-handle] attribute anywhere in this container, so the
   * handle's position does not matter to the drag behaviour. */
  dragHandlePlacement?: 'below' | 'chest' | 'top';
}

const DraggableFloating = ({
  children,
  initialX,
  initialY,
  anchorRight = false,
  anchorBottom = false,
  dragLabel = "Drag me",
  resetKey, dragHandlePlacement = 'below',
}: DraggableFloatingProps) => {
  const [pos, setPos] = useState(() => {
    // Fix batch 2026-11-24: EVERY positioning path derives from the one
    // tracked visual-viewport rect (readFloatingViewport) — never from
    // the layout viewport's width/height. The shell is position:fixed,
    // so the rect's origin is 0,0; adding the visual viewport's offset
    // within the layout viewport double-counted it and seated the
    // panel too low on Android.
    const rect = readFloatingViewport();
    const size = { width: 200, height: 80 };
    if (anchorRight && anchorBottom) return floatingCornerPosition(size, rect, initialX);
    if (anchorRight) return fitFloatingPosition({ x: rect.left + rect.width - size.width - initialX, y: initialY }, size, rect);
    if (anchorBottom) return fitFloatingPosition({ x: initialX, y: rect.top + rect.height - size.height - initialY }, size, rect);
    return fitFloatingPosition({ x: initialX, y: initialY }, size, rect);
  });
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragging = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<FloatingViewport>(() => readFloatingViewport());
  const [dimensions, setDimensions] = useState({ width: 200, height: 80 });
  useEffect(() => {
    const visual = window.visualViewport;
    const update = () => setViewport(readFloatingViewport());
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { visual?.removeEventListener('resize', update); visual?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);

  const clampPosition = useCallback((nextPosition?: { x: number; y: number }) => {
    const el = containerRef.current;
    if (!el) return;

    const size = { width: el.offsetWidth, height: el.offsetHeight };
    setPos((prev) => {
      const clamped = fitFloatingPosition(nextPosition ?? prev, size, viewport, VIEWPORT_PADDING);
      return prev.x === clamped.x && prev.y === clamped.y ? prev : clamped;
    });
  }, [viewport]);

  useEffect(() => {
    if (resetKey === undefined) return;
    setHasMoved(false);
    const frame = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      if (anchorRight && anchorBottom) {
        clampPosition(floatingCornerPosition(size, viewport, initialX));
      } else if (anchorRight) {
        clampPosition({ x: viewport.left + viewport.width - size.width - initialX, y: initialY });
      } else if (anchorBottom) {
        clampPosition({ x: initialX, y: viewport.top + viewport.height - size.height - initialY });
      } else {
        clampPosition({ x: initialX, y: initialY });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [resetKey, anchorRight, anchorBottom, initialX, initialY, clampPosition, viewport]);

  // After first render, reposition right-anchored widgets using actual element width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      if (anchorRight && !hasInitialized) {
        const size = { width: el.offsetWidth, height: el.offsetHeight };
        if (anchorBottom) {
          setPos(floatingCornerPosition(size, viewport, initialX));
        } else {
          setPos((prev) => fitFloatingPosition({ x: viewport.left + viewport.width - size.width - initialX, y: prev.y }, size, viewport, VIEWPORT_PADDING));
        }
        setHasInitialized(true);
      } else {
        clampPosition();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [children, clampPosition, anchorRight, anchorBottom, initialX, hasInitialized, viewport]);

  useEffect(() => {
    const handleResize = () => {
      // Mobile keyboards may emit a layout resize as well as visualViewport resize.
      // The visual bounds handle that temporarily; do not replace the saved corner.
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return;
      const el = containerRef.current;
      if (!el) return;
      // Reseat from a FRESH read of the tracked visual-viewport rect —
      // the old hard-coded layout-height-minus-100 target seated the
      // shell against the layout viewport and pushed it too low.
      const rect = readFloatingViewport();
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      if (anchorRight && anchorBottom) {
        setPos(floatingCornerPosition(size, rect, initialX));
      } else if (anchorRight) {
        setPos((prev) => fitFloatingPosition({ x: rect.left + rect.width - size.width - initialX, y: prev.y }, size, rect, VIEWPORT_PADDING));
      } else if (anchorBottom) {
        setPos((prev) => fitFloatingPosition({ x: prev.x, y: rect.top + rect.height - size.height - initialY }, size, rect, VIEWPORT_PADDING));
      } else {
        setPos(fitFloatingPosition({ x: initialX, y: initialY }, size, rect, VIEWPORT_PADDING));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initialX, initialY, anchorRight, anchorBottom]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { setDimensions({ width: element.offsetWidth, height: element.offsetHeight }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [clampPosition]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drag-handle]")) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragging.current = true;
    setHasMoved(true);
    activePointerId.current = e.pointerId;
    setIsDragging(true);
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    document.body.style.userSelect = "none";
    document.body.style.touchAction = "none";
    const handle = target.closest<HTMLElement>('[data-drag-handle]');
    handle?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, []);

  const stopDragging = useCallback((pointerId?: number | null) => {
    if (pointerId != null && activePointerId.current != null && pointerId !== activePointerId.current) return;

    dragging.current = false;
    activePointerId.current = null;
    document.body.style.userSelect = "";
    document.body.style.touchAction = "";
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;

      const el = containerRef.current;
      if (!el) return;

      const size = { width: el.offsetWidth, height: el.offsetHeight };
      // Drag clamps against the tracked visual-viewport rect too, so a
      // drag cannot park the shell in the layout-only area below the
      // visible viewport (e.g. behind the Android Chrome URL bar zone).
      setPos(fitFloatingPosition(
        { x: e.clientX - offset.current.x, y: e.clientY - offset.current.y },
        size,
        readFloatingViewport(),
        VIEWPORT_PADDING,
      ));
    };

    const handlePointerEnd = (e: PointerEvent) => stopDragging(e.pointerId);

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      document.body.style.userSelect = "";
      document.body.style.touchAction = "";
    };
  }, [isDragging, stopDragging]);

  const visiblePosition = anchorRight && anchorBottom && !hasMoved
    ? floatingCornerPosition(dimensions, viewport, initialX)
    : fitFloatingPosition(pos, dimensions, viewport);
  return createPortal(
    <>
    {isDragging && <div className="fixed inset-0" style={{ zIndex: 'var(--layer-floating)' }} aria-hidden="true" />}
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onLostPointerCapture={() => stopDragging()}
      className={visualViewportClass(viewport.height)}
      style={{
        position: "fixed",
        left: visiblePosition.x,
        top: visiblePosition.y,
        zIndex: 'var(--layer-floating)',
        touchAction: isDragging ? "none" : "auto",
        // Chat-fix4: the available height derives from the VISUAL
        // viewport (state above tracks window.visualViewport), so
        // the panel shrinks to the visible area when the on-screen
        // keyboard opens; the aspen-vv-short class switches the
        // panel's short-viewport CSS rules on the same signal.
        '--aspen-available-height': `${availableHeightFor(viewport.height)}px`,
      } as React.CSSProperties}
    >
      <div className={dragHandlePlacement === 'below' ? "flex flex-col items-center" : dragHandlePlacement === 'chest' ? "aspen-drag-chest flex flex-col items-center" : "aspen-drag-top flex flex-col items-center"}>
        {children}
        {dragHandlePlacement !== 'chest' && <Button
          type="button"
          data-drag-handle
          variant="ghost"
          className="mt-1 h-5 flex cursor-grab touch-none select-none items-center gap-1 rounded-full border border-primary/60 bg-card/95 px-2 py-0.5 text-primary shadow-md backdrop-blur-sm transition-colors hover:bg-secondary hover:text-primary active:cursor-grabbing"
          aria-label="Drag widget"
        >
          <GripVertical className="h-3 w-3" />
          <span className="text-[8px] font-bold uppercase tracking-wider">{isDragging ? "Moving" : "Drag"}</span>
        </Button>}
      </div>
    </div>
    </>, document.body
  );
};

export default DraggableFloating;
