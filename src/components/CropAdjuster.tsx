"use client";

import { useRef, useState } from "react";
import type { Corners, Point } from "@/lib/scanDocument";

const DISPLAY_WIDTH = 320;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);

  // Corners are always stored in the original image's own pixel space (what
  // warpAndClean needs) — only scaled for on-screen display, and unscaled
  // again on every drag update.
  const scale = DISPLAY_WIDTH / imageWidth;
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
    const x = Math.min(Math.max(e.clientX - rect.left, 0), DISPLAY_WIDTH);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), displayHeight);
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
      <div
        ref={containerRef}
        className="relative touch-none select-none mx-auto rounded-lg overflow-hidden bg-black/5 dark:bg-white/5"
        style={{ width: DISPLAY_WIDTH, height: displayHeight }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
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
          width={DISPLAY_WIDTH}
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
        {corners.map((corner, i) => {
          const d = toDisplay(corner);
          return (
            <div
              key={i}
              onPointerDown={startDrag(i)}
              className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 border-2 border-white shadow-md cursor-grab touch-none"
              style={{ left: d.x, top: d.y }}
            />
          );
        })}
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
