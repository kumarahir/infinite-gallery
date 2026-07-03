"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import GridCell from "./GridCell";
import AddCellModal from "./AddCellModal";
import ViewCellModal from "./ViewCellModal";
import Joystick from "./Joystick";
import AboutModal from "./AboutModal";
import { useCellChunks } from "@/hooks/useCellChunks";
import { useUser } from "@/hooks/useUser";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useIsTouchPrimary } from "@/hooks/useIsTouchPrimary";
import {
  BUFFER,
  CELL_SIZE,
  JOYSTICK_MAX_SPEED,
  MOBILE_CONTROLS_HEIGHT,
  STEP,
  TAP_THRESHOLD,
} from "@/lib/gridConstants";
import { fetchCellAt, fetchTotalImageCount, type CellRow } from "@/lib/cells";

const FRICTION = 0.94; // velocity decay per 16.67ms tick
const VELOCITY_STOP_THRESHOLD = 0.02; // px per tick
const MAX_FRAME_DELTA = 48; // ms, guards against tab-switch stalls

export default function InfiniteGrid({ initialUser }: { initialUser: User | null }) {
  const user = useUser(initialUser);
  const isAdmin = useIsAdmin(user);
  const isTouchPrimary = useIsTouchPrimary();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [pendingCell, setPendingCell] = useState<{ x: number; y: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [celebration, setCelebration] = useState<{
    x: number;
    y: number;
    total: number | null;
  } | null>(null);

  const dragState = useRef({ startX: 0, startY: 0, originX: 0, originY: 0, moved: 0 });
  const lastSample = useRef({ x: 0, y: 0, t: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  const lastFrameTime = useRef<number | null>(null);

  // Joystick input (mobile only) — a normalized -1..1 direction vector,
  // driven directly at JOYSTICK_MAX_SPEED while held. Releasing it just
  // stops feeding new velocity in; the existing friction-decay loop below
  // takes over from there for a smooth coast to a stop.
  const joystickVector = useRef({ x: 0, y: 0 });
  const joystickActive = useRef(false);

  // The visual position is tracked in a ref and painted straight to the DOM
  // (no React render) so finger tracking is instant. `translate` (state) is
  // only synced from this ref once per animation frame — it exists purely
  // to drive which cells are visible, which doesn't need to update on every
  // single pointermove (mobile can fire dozens of those between frames).
  const translateRef = useRef({ x: 0, y: 0 });
  const syncScheduled = useRef(false);

  const paintTransform = useCallback(() => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = `translate3d(${translateRef.current.x}px, ${translateRef.current.y}px, 0)`;
    }
  }, []);

  const scheduleStateSync = useCallback(() => {
    if (syncScheduled.current) return;
    syncScheduled.current = true;
    requestAnimationFrame(() => {
      syncScheduled.current = false;
      setTranslate({ ...translateRef.current });
    });
  }, []);

  const commitTranslate = useCallback(
    (next: { x: number; y: number }) => {
      translateRef.current = next;
      paintTransform();
      scheduleStateSync();
    },
    [paintTransform, scheduleStateSync]
  );

  const { ensureRange, getCell, addLocalCell, removeLocalCell, version } = useCellChunks();

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

      let vx: number;
      let vy: number;
      if (joystickActive.current) {
        vx = joystickVector.current.x * JOYSTICK_MAX_SPEED;
        vy = joystickVector.current.y * JOYSTICK_MAX_SPEED;
      } else {
        const decay = Math.pow(FRICTION, ticks);
        vx = velocity.current.x * decay;
        vy = velocity.current.y * decay;
      }
      velocity.current = { x: vx, y: vy };

      if (
        !joystickActive.current &&
        Math.abs(vx) < VELOCITY_STOP_THRESHOLD &&
        Math.abs(vy) < VELOCITY_STOP_THRESHOLD
      ) {
        rafId.current = null;
        lastFrameTime.current = null;
        return;
      }

      commitTranslate({
        x: translateRef.current.x + vx * ticks,
        y: translateRef.current.y + vy * ticks,
      });
      rafId.current = requestAnimationFrame(step);
    };
    rafId.current = requestAnimationFrame(step);
  }, [commitTranslate]);

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

  // Deep-link support: /?cell=x,y auto-opens that cell and centers the grid on it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("cell");
    params.delete("cell");
    const rest = params.toString();
    window.history.replaceState({}, "", rest ? `?${rest}` : window.location.pathname);

    if (!raw) return;
    const [xStr, yStr] = raw.split(",");
    const x = Number(xStr);
    const y = Number(yStr);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;

    fetchCellAt(x, y).then((cell) => {
      if (cell) addLocalCell(cell);
      setPendingCell({ x, y });
      commitTranslate({
        x: containerRef.current!.clientWidth / 2 - x * STEP - CELL_SIZE / 2,
        y: containerRef.current!.clientHeight / 2 - y * STEP - CELL_SIZE / 2,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only produces a NEW range object when the visible cell window actually
  // shifts (roughly once per STEP px of movement) rather than on every
  // translate sync (~60/sec while dragging). Returning the same object
  // reference from a state updater makes React skip the re-render entirely,
  // which avoids reallocating + re-rendering every visible tile every frame.
  const [range, setRange] = useState<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  useEffect(() => {
    if (viewport.width === 0 && viewport.height === 0) return;
    const minX = Math.floor(-translate.x / STEP) - BUFFER;
    const maxX = Math.ceil((-translate.x + viewport.width) / STEP) + BUFFER;
    const minY = Math.floor(-translate.y / STEP) - BUFFER;
    const maxY = Math.ceil((-translate.y + viewport.height) / STEP) + BUFFER;
    setRange((prev) =>
      prev &&
      prev.minX === minX &&
      prev.maxX === maxX &&
      prev.minY === minY &&
      prev.maxY === maxY
        ? prev
        : { minX, maxX, minY, maxY }
    );
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

  const handleCellCreated = useCallback(
    (cell: CellRow) => {
      addLocalCell(cell);
      if (cell.cell_type !== "image") return;
      // Show the thank-you banner immediately (count fills in once known) —
      // the ViewCellModal that's about to render for this cell reads it.
      setCelebration({ x: cell.x, y: cell.y, total: null });
      fetchTotalImageCount()
        .then((total) => setCelebration({ x: cell.x, y: cell.y, total }))
        .catch(() => {
          // Leave the banner showing without a count rather than erroring out.
        });
    },
    [addLocalCell]
  );

  const handleJoystickVector = useCallback(
    (dx: number, dy: number) => {
      joystickVector.current = { x: dx, y: dy };
      const active = dx !== 0 || dy !== 0;
      joystickActive.current = active;
      if (active) runPhysics();
    },
    [runPhysics]
  );

  const handleRecenter = useCallback(() => {
    joystickActive.current = false;
    velocity.current = { x: 0, y: 0 };
    stopAnimation();
    if (!containerRef.current) return;
    // On mobile, center within the space above the joystick/recenter row,
    // not the literal screen center (which those controls would cover).
    const usableHeight = isTouchPrimary
      ? containerRef.current.clientHeight - MOBILE_CONTROLS_HEIGHT
      : containerRef.current.clientHeight;
    commitTranslate({
      x: containerRef.current.clientWidth / 2 - CELL_SIZE / 2,
      y: usableHeight / 2 - CELL_SIZE / 2,
    });
  }, [commitTranslate, stopAnimation, isTouchPrimary]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopAnimation();
    velocity.current = { x: 0, y: 0 };
    setIsDragging(true);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: translateRef.current.x,
      originY: translateRef.current.y,
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

    // Swipe-to-pan is mobile-only disabled — panning there happens via the
    // joystick instead (direct touch-drag caused sluggish, GC-heavy
    // rendering on phones). Tap-to-open below still works on touch.
    if (isTouchPrimary) return;

    commitTranslate({
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
        const cellX = Math.floor((e.clientX - rect.left - translateRef.current.x) / STEP);
        const cellY = Math.floor((e.clientY - rect.top - translateRef.current.y) / STEP);
        setPendingCell({ x: cellX, y: cellY });
      }
    } else if (!isTouchPrimary) {
      runPhysics();
    }
  };

  const onPointerLeave = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (!isTouchPrimary) runPhysics();
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    commitTranslate({
      x: translateRef.current.x - e.deltaX,
      y: translateRef.current.y - e.deltaY,
    });
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
          ref={wrapperRef}
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

      {isTouchPrimary && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="Recenter gallery"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
            </svg>
          </button>
          <Joystick onVector={handleJoystickVector} />
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            aria-label="About this gallery"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        </div>
      )}

      {isTouchPrimary && <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />}

      {pendingCell && (() => {
        const existing = getCell(pendingCell.x, pendingCell.y);
        const closeModal = () => {
          setPendingCell(null);
          setCelebration(null);
        };
        return existing ? (
          <ViewCellModal
            cell={existing}
            isAdmin={isAdmin}
            celebrateTotal={
              celebration && celebration.x === pendingCell.x && celebration.y === pendingCell.y
                ? celebration.total
                : undefined
            }
            onClose={closeModal}
            onDeleted={removeLocalCell}
          />
        ) : (
          <AddCellModal
            x={pendingCell.x}
            y={pendingCell.y}
            user={user}
            isAdmin={isAdmin}
            onClose={closeModal}
            onCreated={handleCellCreated}
          />
        );
      })()}
    </>
  );
}
