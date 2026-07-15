"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { MINIMAP_RADIUS_PX, MINIMAP_SCALE, STEP } from "@/lib/gridConstants";
import type { CellCoord } from "@/lib/cells";

export interface MinimapRadarHandle {
  // worldX/worldY: the world-cell coordinate currently at the center of the
  // gallery viewport (zoom-independent) — not a raw pixel pan amount.
  setPan: (worldX: number, worldY: number) => void;
}

// Purely a visual overlay — no pointer-events, no React re-renders while
// panning. `setPan` is called from InfiniteGrid's existing rAF-driven
// paintTransform, so this rides the exact same frame as the main grid's own
// transform update rather than doing any per-frame work of its own. Dot
// positions are computed once per `dots` change (mirrors the number/rarity
// of actual uploads, not pan events).
const MinimapRadar = forwardRef<
  MinimapRadarHandle,
  { dots: CellCoord[]; currentUserId?: string }
>(function MinimapRadar({ dots, currentUserId }, ref) {
  const layerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      setPan(worldX: number, worldY: number) {
        if (layerRef.current) {
          // Shifts the dot layer so the dot at (worldX, worldY) — the
          // gallery's current viewport center — lands exactly on the fixed
          // crosshair at the minimap's own center.
          layerRef.current.style.transform = `translate3d(${-worldX * STEP * MINIMAP_SCALE}px, ${
            -worldY * STEP * MINIMAP_SCALE
          }px, 0)`;
        }
      },
    }),
    []
  );

  const dotStyles = useMemo(
    () =>
      dots.map((d) => ({
        left: d.x * STEP * MINIMAP_SCALE,
        top: d.y * STEP * MINIMAP_SCALE,
        isOwn: !!currentUserId && d.created_by === currentUserId,
      })),
    [dots, currentUserId]
  );

  const diameter = MINIMAP_RADIUS_PX * 2;

  return (
    <div
      className="relative rounded-full overflow-hidden bg-black/20 dark:bg-white/20 backdrop-blur border border-black/10 dark:border-white/30"
      style={{ width: diameter, height: diameter }}
    >
      <div ref={layerRef} className="absolute top-1/2 left-1/2" style={{ willChange: "transform" }}>
        {dotStyles.map((style, i) => (
          <div
            key={i}
            className={`absolute w-[2px] h-[2px] rounded-full ${
              style.isOwn ? "bg-blue-500" : "bg-foreground/70"
            }`}
            style={{ left: style.left, top: style.top, transform: "translate(-50%, -50%)" }}
          />
        ))}
      </div>

      {/* Rotating radar sweep for flavor — pure CSS, no JS cost. */}
      <div
        className="absolute inset-0 radar-sweep"
        style={{
          background:
            "conic-gradient(from 270deg, transparent, rgba(34,197,94,0.35) 40deg, transparent 40deg)",
        }}
      />

      {/* Crosshair marking the current view center. */}
      <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500" />
    </div>
  );
});

export default MinimapRadar;
