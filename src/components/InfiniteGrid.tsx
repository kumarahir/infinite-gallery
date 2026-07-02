"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import GridCell from "./GridCell";
import AddCellModal from "./AddCellModal";
import { useCellChunks } from "@/hooks/useCellChunks";
import { useUser } from "@/hooks/useUser";
import { BUFFER, STEP, TAP_THRESHOLD } from "@/lib/gridConstants";
import type { CellRow } from "@/lib/cells";

const FRICTION = 0.94; // velocity decay per 16.67ms tick
const VELOCITY_STOP_THRESHOLD = 0.02; // px per tick
const MAX_FRAME_DELTA = 48; // ms, guards against tab-switch stalls

export default function InfiniteGrid({ initialUser }: { initialUser: User | null }) {
  const user = useUser(initialUser);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [pendingCell, setPendingCell] = useState<{ x: number; y: number } | null>(null);

  const dragState = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: 0 });
  const lastSample = useRef({ x: 0, y: 0, t: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  const lastFrameTime = useRef<number | null>(null);

  const { ensureRange, getCell, addLocalCell, version } = useCellChunks();

  const stopAnimation = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    lastFrameTime.current = null;
  }, []);

  // Pure friction decay — no bounds/spring since the grid has no edges.
  const runPhysics = useCallback(() => {
    if (rafId.current != null) return;
    const step = (ts: number) => {
      if (lastFrameTime.current == null) lastFrameTime.current = ts;
      const dt = Math.min(ts - lastFrameTime.current, MAX_FRAME_DELTA);
      lastFrameTime.current = ts;
      const ticks = dt / 16.67;

      let settled = false;
      setTranslate((prev) => {
        let vx = velocity.current.x;
        let vy = velocity.current.y;
        const decay = Math.pow(FRICTION, ticks);
        vx *= decay;
        vy *= decay;
        velocity.current = { x: vx, y: vy };

        if (Math.abs(vx) < VELOCITY_STOP_THRESHOLD && Math.abs(vy) < VELOCITY_STOP_THRESHOLD) {
          settled = true;
          return prev;
        }
        return { x: prev.x + vx * ticks, y: prev.y + vy * ticks };
      });

      if (settled) {
        rafId.current = null;
        lastFrameTime.current = null;
        return;
      }
      rafId.current = requestAnimationFrame(step);
    };
    rafId.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => stopAnimation, [stopAnimation]);

  const range = useMemo(() => {
    if (viewport.width === 0 && viewport.height === 0) return null;
    return {
      minX: Math.floor(-translate.x / STEP) - BUFFER,
      maxX: Math.ceil((-translate.x + viewport.width) / STEP) + BUFFER,
      minY: Math.floor(-translate.y / STEP) - BUFFER,
      maxY: Math.ceil((-translate.y + viewport.height) / STEP) + BUFFER,
    };
  }, [translate, viewport]);

  useEffect(() => {
    if (!range) return;
    ensureRange(range.minX, range.maxX, range.minY, range.maxY);
  }, [range, ensureRange]);

  const cellsInView = useMemo(() => {
    if (!range) return [];
    const items: { x: number; y: number; cell: CellRow | undefined }[] = [];
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        items.push({ x, y, cell: getCell(x, y) });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, getCell, version]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopAnimation();
    velocity.current = { x: 0, y: 0 };
    setIsDragging(true);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: translate.x,
      originY: translate.y,
      moved: 0,
    };
    lastSample.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some pointer types/environments reject capture — dragging still
      // works via document-level pointermove/up, just without capture.
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const now = performance.now();
    const dt = Math.max(now - lastSample.current.t, 1);
    velocity.current = {
      x: ((e.clientX - lastSample.current.x) / dt) * 16.67,
      y: ((e.clientY - lastSample.current.y) / dt) * 16.67,
    };
    lastSample.current = { x: e.clientX, y: e.clientY, t: now };

    dragState.current.moved = Math.max(
      dragState.current.moved,
      Math.hypot(e.clientX - dragState.current.startX, e.clientY - dragState.current.startY)
    );

    setTranslate({
      x: dragState.current.originX + (e.clientX - dragState.current.startX),
      y: dragState.current.originY + (e.clientY - dragState.current.startY),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);

    if (dragState.current.moved < TAP_THRESHOLD) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cellX = Math.floor((e.clientX - rect.left - translate.x) / STEP);
        const cellY = Math.floor((e.clientY - rect.top - translate.y) / STEP);
        if (!getCell(cellX, cellY)) {
          setPendingCell({ x: cellX, y: cellY });
        }
      }
    } else {
      runPhysics();
    }
  };

  const onPointerLeave = () => {
    if (!isDragging) return;
    setIsDragging(false);
    runPhysics();
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setTranslate((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    velocity.current = { x: (-e.deltaX / 16.67) * 4, y: (-e.deltaY / 16.67) * 4 };
    runPhysics();
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`relative w-full h-full overflow-hidden touch-none select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate3d(${translate.x}px, ${translate.y}px, 0)`,
            willChange: "transform",
          }}
        >
          {cellsInView.map(({ x, y, cell }) => (
            <GridCell key={`${x}:${y}`} x={x} y={y} cell={cell} />
          ))}
        </div>
      </div>

      {pendingCell && (
        <AddCellModal
          x={pendingCell.x}
          y={pendingCell.y}
          user={user}
          onClose={() => setPendingCell(null)}
          onCreated={addLocalCell}
        />
      )}
    </>
  );
}
