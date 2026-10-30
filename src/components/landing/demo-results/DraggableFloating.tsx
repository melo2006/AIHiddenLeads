import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import { fitFloatingPosition, floatingCornerPosition, type FloatingViewport } from '@/lib/floatingViewport';

const VIEWPORT_PADDING = 12;

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

interface DraggableFloatingProps {
  children: ReactNode;
  initialX: number;
  initialY: number;
  /** If set, initialX is treated as pixels from the RIGHT edge instead of left */
  anchorRight?: boolean;
  anchorBottom?: boolean;
  dragLabel?: string;
  resetKey?: string | number;
}

const DraggableFloating = ({
  children,
  initialX,
  initialY,
  anchorRight = false,
  anchorBottom = false,
  dragLabel = "Drag me",
  resetKey,
}: DraggableFloatingProps) => {
  const [pos, setPos] = useState(() => ({
    x: anchorRight ? Math.max(VIEWPORT_PADDING, window.innerWidth - 200 - initialX) : Math.min(initialX, window.innerWidth - 80),
    y: Math.min(initialY, window.innerHeight - 80),
  }));
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragging = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<FloatingViewport>(() => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }));
  const [dimensions, setDimensions] = useState({ width: 200, height: 80 });
  useEffect(() => {
    const visual = window.visualViewport;
    const update = () => setViewport({ left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0, width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight });
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { visual?.removeEventListener('resize', update); visual?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);

  const clampPosition = useCallback((nextPosition?: { x: number; y: number }) => {
    const el = containerRef.current;
    if (!el) return;

    const maxX = window.innerWidth - el.offsetWidth - VIEWPORT_PADDING;
    const maxY = window.innerHeight - el.offsetHeight - VIEWPORT_PADDING;

    setPos((prev) => {
      const base = nextPosition ?? prev;
      const clamped = {
        x: clampValue(base.x, VIEWPORT_PADDING, maxX),
        y: clampValue(base.y, VIEWPORT_PADDING, maxY),
      };

      return prev.x === clamped.x && prev.y === clamped.y ? prev : clamped;
    });
  }, []);

  useEffect(() => {
    if (resetKey === undefined) return;
    setHasMoved(false);
    const frame = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      clampPosition({ x: anchorRight ? window.innerWidth - el.offsetWidth - initialX : initialX, y: initialY });
    });
    return () => cancelAnimationFrame(frame);
  }, [resetKey, anchorRight, initialX, initialY, clampPosition]);

  // After first render, reposition right-anchored widgets using actual element width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      if (anchorRight && !hasInitialized) {
        const w = el.offsetWidth;
        const rightX = window.innerWidth - w - initialX;
        setPos((prev) => ({
          x: clampValue(rightX, VIEWPORT_PADDING, window.innerWidth - w - VIEWPORT_PADDING),
          y: clampValue(prev.y, VIEWPORT_PADDING, window.innerHeight - el.offsetHeight - VIEWPORT_PADDING),
        }));
        setHasInitialized(true);
      } else {
        clampPosition();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [children, clampPosition, anchorRight, initialX, hasInitialized]);

  useEffect(() => {
    const handleResize = () => {
      // Mobile keyboards may emit a layout resize as well as visualViewport resize.
      // The visual bounds handle that temporarily; do not replace the saved corner.
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return;
      const el = containerRef.current;
      if (!el) return;
      if (anchorRight) {
        const w = el.offsetWidth;
        const rightX = window.innerWidth - w - initialX;
        clampPosition({ x: rightX, y: window.innerHeight - 100 });
      } else {
        clampPosition({ x: initialX, y: window.innerHeight - 100 });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition, initialX, anchorRight]);

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

      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const maxX = window.innerWidth - w - VIEWPORT_PADDING;
      const maxY = window.innerHeight - h - VIEWPORT_PADDING;

      const newX = e.clientX - offset.current.x;
      const newY = e.clientY - offset.current.y;

      setPos({
        x: clampValue(newX, VIEWPORT_PADDING, maxX),
        y: clampValue(newY, VIEWPORT_PADDING, maxY),
      });
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
      style={{
        position: "fixed",
        left: visiblePosition.x,
        top: visiblePosition.y,
        zIndex: 'var(--layer-floating)',
        touchAction: isDragging ? "none" : "auto",
        '--aspen-available-height': `${Math.max(140, viewport.height - 56)}px`,
      } as React.CSSProperties}
    >
      <div className="flex flex-col items-center">
        <Button
          type="button"
          data-drag-handle
          variant="ghost"
          className="mb-1 h-5 flex cursor-grab touch-none select-none items-center gap-1 rounded-full border border-primary/60 bg-card/95 px-2 py-0.5 text-primary shadow-md backdrop-blur-sm transition-colors hover:bg-secondary hover:text-primary active:cursor-grabbing"
          aria-label="Drag widget"
        >
          <GripVertical className="h-3 w-3" />
          <span className="text-[8px] font-bold uppercase tracking-wider">{isDragging ? "Moving" : "Drag"}</span>
        </Button>
        {children}
      </div>
    </div>
    </>, document.body
  );
};

export default DraggableFloating;
