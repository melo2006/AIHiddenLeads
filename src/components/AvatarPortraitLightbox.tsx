import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, RotateCcw, ZoomIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared portrait viewer for the avatar gallery + library picker
 * (Ron's order, 2026-11-17): hovering a tile highlights it and lifts
 * the portrait a little; tapping/clicking the portrait opens this
 * overlay with the face large, pinch/scroll/button zoom and drag-pan,
 * so the detail is readable even on a phone where the tiles are small.
 *
 * The hover treatment is pointer-only ([@media(hover:hover)]) so a
 * touch tap never leaves a stuck highlight, and the lift is
 * motion-safe so reduced-motion visitors get the ring without motion.
 */

export interface PortraitLightboxPerson {
  name: string;
  image: string;
  /** Small line under the name (e.g. the tile's voice / category). */
  detail?: string;
}

interface LightboxProps {
  person: PortraitLightboxPerson | null;
  onClose: () => void;
  /** Picker contexts only: the select action carried inside the
   *  overlay, so enlarging a face never dead-ends the picking flow. */
  selectAction?: {
    selected: boolean;
    onSelect: () => void;
  };
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const BUTTON_STEP = 1.5;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export default function AvatarPortraitLightbox({ person, onClose, selectAction }: LightboxProps) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // Every newly opened portrait starts unzoomed and centred.
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
  }, [person?.image]);

  const applyScale = (next: number) => {
    const clamped = clampScale(next);
    setScale(clamped);
    if (clamped === 1) setOffset({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    applyScale(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / older engines: capture is a nicety, not a requirement */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag.current = null;
    } else if (pointers.current.size === 1 && scale > 1) {
      drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0) applyScale(pinch.current.scale * (distance / pinch.current.distance));
    } else if (drag.current && drag.current.id === e.pointerId) {
      setOffset({
        x: drag.current.baseX + (e.clientX - drag.current.startX),
        y: drag.current.baseY + (e.clientY - drag.current.startY),
      });
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current && drag.current.id === e.pointerId) drag.current = null;
  };

  return (
    <Dialog open={person !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md gap-3 p-4 sm:max-w-lg">
        {person && (
          <>
            <div className="space-y-1 pr-8">
              <DialogTitle>{person.name}</DialogTitle>
              <DialogDescription>
                {person.detail ? `${person.detail} · ` : ""}{t("gallery.zoomHint")}
              </DialogDescription>
            </div>
            <div
              className={cn(
                "relative aspect-square w-full select-none overflow-hidden rounded-lg border border-border bg-muted/30",
                scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
              )}
              style={{ touchAction: "none" }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onDoubleClick={() => applyScale(scale > 1 ? 1 : 2.5)}
            >
              <img
                src={person.image}
                alt={person.name}
                draggable={false}
                className="h-full w-full object-cover"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              />
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={t("gallery.zoomOut")}
                disabled={scale <= MIN_SCALE}
                onClick={() => applyScale(scale / BUTTON_STEP)}
              >
                <Minus />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={t("gallery.zoomReset")}
                disabled={scale === 1 && offset.x === 0 && offset.y === 0}
                onClick={() => applyScale(1)}
              >
                <RotateCcw />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={t("gallery.zoomIn")}
                disabled={scale >= MAX_SCALE}
                onClick={() => applyScale(scale * BUTTON_STEP)}
              >
                <Plus />
              </Button>
            </div>
            {selectAction &&
              (selectAction.selected ? (
                <Button type="button" className="w-full" disabled>
                  <Check /> {t("gallery.currentAvatar")}
                </Button>
              ) : (
                <Button type="button" className="w-full" onClick={selectAction.onSelect}>
                  {t("gallery.useThisAvatar")}
                </Button>
              ))}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The tile portrait as a "view" button: opens the lightbox. Shared by
 * the homepage gallery and the library picker so both get the same
 * hover lift + zoom affordance. The image scales inside its frame
 * (overflow hidden on the button) — no layout shift.
 */
export function PortraitViewButton({
  name,
  image,
  onView,
  className,
  imgClassName,
}: {
  name: string;
  image: string;
  onView: () => void;
  className?: string;
  imgClassName?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onView}
      aria-label={t("gallery.viewPhoto", { name })}
      className={cn(
        "group relative block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "[@media(hover:hover)]:hover:border-primary/60 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:shadow-primary/20",
        className,
      )}
    >
      <img
        src={image}
        alt={name}
        loading="lazy"
        width={480}
        height={480}
        className={cn(
          "aspect-square w-full object-cover transition-transform duration-300 ease-out",
          "motion-safe:[@media(hover:hover)]:group-hover:scale-105",
          imgClassName,
        )}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/85 text-foreground opacity-70 shadow transition-opacity duration-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <ZoomIn className="h-4 w-4" />
      </span>
    </button>
  );
}
