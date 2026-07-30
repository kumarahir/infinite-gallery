"use client";

import { useEffect, useRef, useState } from "react";
import type { Corners, Point } from "@/lib/scanDocument";

// Used only until the wrapper's actual rendered width is measured on mount.
const FALLBACK_DISPLAY_WIDTH = 320;
// Caps how large the photo area gets on wide screens — otherwise it'd just
// keep growing to fill a full desktop-width modal.
const MAX_DISPLAY_WIDTH = 480;
// Corner handles are centered exactly on the photo's edges/corners, so
// without this margin half of each handle would render outside the photo
// area and get clipped, leaving a thin, hard-to-grab sliver.
const HANDLE_MARGIN = 18;
// Reserved for what renders below the photo area within this component
// (the "drag corners" instructions are above it and already counted via
// the wrapper's own position; this covers the Cancel/Confirm row plus the
// modal's own bottom padding) — subtracted from viewport height so a tall
// portrait photo can't push the modal's Confirm button off-screen.
const BOTTOM_RESERVE = 100;

export default function CropAdjuster({
  imageUrl,
  imageWidth,
  imageHeight,
  initialCorners,
  onConfirm,
  onCancel,
}: {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialCorners: Corners;
  onConfirm: (corners: Corners) => void;
  onCancel: () => void;
}) {
  const [corners, setCorners] = useState<Corners>(initialCorners);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);
  // Sized off the wrapper's *actual* rendered width rather than a fixed
  // constant — a hardcoded pixel width doesn't know how much room the
  // surrounding modal actually has (it varies by device/viewport), and when
  // it doesn't fit, a centered fixed-width box overflows off the right edge
  // of the screen instead of shrinking to fit.
  const [displayWidth, setDisplayWidth] = useState(FALLBACK_DISPLAY_WIDTH);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const availableWidth = wrapper.clientWidth - HANDLE_MARGIN * 2;
      const maxWidth = Math.max(100, Math.min(MAX_DISPLAY_WIDTH, availableWidth));

      // Also cap by available viewport height — width alone doesn't know a
      // portrait photo will render tall enough to push the rest of the
      // modal (and its Confirm button) off-screen. `top` already reflects
      // everything rendered above this wrapper (title, prompt, "drag
      // corners" text), so this adapts to that content automatically
      // instead of guessing a fixed layout budget.
      const top = wrapper.getBoundingClientRect().top;
      const availableHeight = window.innerHeight - top - HANDLE_MARGIN * 2 - BOTTOM_RESERVE;
      const widthFromHeight = Math.max(100, availableHeight) * (imageWidth / imageHeight);

      setDisplayWidth(Math.min(maxWidth, widthFromHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [imageWidth, imageHeight]);

  // Corners are always stored in the original image's own pixel space (what
  // warpAndClean needs) — only scaled for on-screen display, and unscaled
  // again on every drag update.
  const scale = displayWidth / imageWidth;
  const displayHeight = imageHeight * scale;
  const toDisplay = (p: Point) => ({ x: p.x * scale, y: p.y * scale });
  const toImage = (x: number, y: number): Point => ({ x: x / scale, y: y / scale });

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingIndex.current = index;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // Some pointer types/environments reject capture — dragging still
      // works via the container's own pointermove/up handlers.
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingIndex.current == null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left - HANDLE_MARGIN, 0), displayWidth);
    const y = Math.min(Math.max(e.clientY - rect.top - HANDLE_MARGIN, 0), displayHeight);
    const index = draggingIndex.current;
    setCorners((prev) => {
      const next = [...prev] as Corners;
      next[index] = toImage(x, y);
      return next;
    });
  };

  const endDrag = () => {
    draggingIndex.current = null;
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-black/60 dark:text-white/60">
        Drag the corners to match the edges of your page.
      </p>
      <div ref={wrapperRef} className="w-full">
        <div
          ref={containerRef}
          className="relative touch-none select-none mx-auto"
          style={{
            width: displayWidth + HANDLE_MARGIN * 2,
            height: displayHeight + HANDLE_MARGIN * 2,
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <div
            className="absolute rounded-lg overflow-hidden bg-black/5 dark:bg-white/5"
            style={{
              left: HANDLE_MARGIN,
              top: HANDLE_MARGIN,
              width: displayWidth,
              height: displayHeight,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
            <svg
              className="absolute inset-0 pointer-events-none"
              width={displayWidth}
              height={displayHeight}
            >
              <polygon
                points={corners
                  .map((c) => {
                    const d = toDisplay(c);
                    return `${d.x},${d.y}`;
                  })
                  .join(" ")}
                fill="rgba(59,130,246,0.2)"
                stroke="rgb(59,130,246)"
                strokeWidth={2}
              />
            </svg>
          </div>
          {corners.map((corner, i) => {
            const d = toDisplay(corner);
            return (
              <div
                key={i}
                onPointerDown={startDrag(i)}
                className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 border-2 border-white shadow-md cursor-grab touch-none"
                style={{ left: d.x + HANDLE_MARGIN, top: d.y + HANDLE_MARGIN }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-black/50 dark:text-white/50 hover:opacity-70"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(corners)}
          className="rounded-lg bg-foreground text-background text-sm font-medium px-4 py-2 hover:opacity-90"
        >
          Confirm crop
        </button>
      </div>
    </div>
  );
}
