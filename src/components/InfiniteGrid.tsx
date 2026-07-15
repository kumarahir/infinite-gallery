"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import GridCell from "./GridCell";
import AddCellModal from "./AddCellModal";
import ViewCellModal from "./ViewCellModal";
import Joystick from "./Joystick";
import AboutModal from "./AboutModal";
import MinimapRadar, { type MinimapRadarHandle } from "./MinimapRadar";
import FilterBar from "./FilterBar";
import MineToggleButton from "./MineToggleButton";
import { useCellChunks } from "@/hooks/useCellChunks";
import { useUser } from "@/hooks/useUser";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useIsTouchPrimary } from "@/hooks/useIsTouchPrimary";
import {
  BUFFER,
  CELL_SIZE,
  DEFAULT_ZOOM_INDEX,
  FILTERED_GRID_COLS,
  GAP,
  JOYSTICK_MAX_SPEED,
  MOBILE_CONTROLS_HEIGHT,
  TAP_THRESHOLD,
  ZOOM_LEVELS,
} from "@/lib/gridConstants";
import {
  fetchAllImageCoords,
  fetchCellAt,
  fetchFilteredCells,
  fetchThemes,
  fetchTotalImageCount,
  type CellCoord,
  type CellRow,
  type Theme,
} from "@/lib/cells";

const FRICTION = 0.94; // velocity decay per 16.67ms tick
const VELOCITY_STOP_THRESHOLD = 0.02; // px per tick
const MAX_FRAME_DELTA = 48; // ms, guards against tab-switch stalls
const RECENTER_DURATION = 400; // ms, ease-out pan when tapping the recenter button

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
  const [dotCoords, setDotCoords] = useState<CellCoord[]>([]);
  const [radarVisible, setRadarVisible] = useState(false);
  const minimapRef = useRef<MinimapRadarHandle>(null);

  // Discrete thumbnail zoom, changed via the +/- buttons. cellStep is named
  // distinctly from the rAF-callback `step` params used elsewhere in this
  // file (runPhysics/animateTranslateTo) to avoid confusion.
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const zoomLevel = ZOOM_LEVELS[zoomIndex];
  const cellSize = CELL_SIZE * zoomLevel;
  const cellStep = cellSize + GAP * zoomLevel;

  // Clustered/filtered browse mode — reuses the same pan mechanics and
  // GridCell rendering as the real infinite canvas, just fed by a compact
  // virtual layout of matching sketches instead of their real scattered
  // world coordinates. View-only: no empty "+" cells, nothing to add into.
  const [themes, setThemes] = useState<Theme[]>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [themeFilterId, setThemeFilterId] = useState<number | null>(null);
  const [filteredCells, setFilteredCells] = useState<CellRow[]>([]);
  const filterActive = onlyMine || themeFilterId != null;
  const wasFilterActive = useRef(false);

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
    minimapRef.current?.setPan(translateRef.current.x, translateRef.current.y);
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

  // Fetched once for the mobile minimap radar — kept in sync afterward via
  // handleCellCreated/handleCellDeleted rather than re-queried.
  useEffect(() => {
    fetchAllImageCoords()
      .then(setDotCoords)
      .catch(() => {
        // Radar just shows no dots if this fails — not worth surfacing an error for.
      });
  }, []);

  // Fetched once for the filter bar's theme dropdown.
  useEffect(() => {
    fetchThemes()
      .then(setThemes)
      .catch(() => {
        // Filter bar just shows no theme options if this fails.
      });
  }, []);

  // Re-fetch the clustered result set whenever the active filter changes.
  useEffect(() => {
    if (!filterActive) {
      setFilteredCells([]);
      return;
    }
    fetchFilteredCells({ onlyMine, themeId: themeFilterId }, user?.id)
      .then(setFilteredCells)
      .catch(() => setFilteredCells([]));
  }, [filterActive, onlyMine, themeFilterId, user?.id]);

  // Deep-link support: /?cell=x,y auto-opens that cell and centers the grid
  // on it. Parsed once on mount (and stripped from the URL immediately);
  // the actual centering is deferred to a separate effect below.
  const deepLinkCell = useRef<{ x: number; y: number } | null>(null);
  const deepLinkHandled = useRef(false);

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
    deepLinkCell.current = { x, y };
  }, []);

  // Waits for `viewport` (populated by the ResizeObserver above) to report a
  // real, non-zero size before centering — reading containerRef's
  // clientWidth/clientHeight directly at mount time is racy and can still
  // be 0 before the first layout pass, silently pinning the view at the
  // top-left corner instead of centering on the shared cell.
  useEffect(() => {
    if (deepLinkHandled.current || !deepLinkCell.current) return;
    if (viewport.width === 0 && viewport.height === 0) return;
    deepLinkHandled.current = true;
    const { x, y } = deepLinkCell.current;

    fetchCellAt(x, y).then((cell) => {
      if (cell) addLocalCell(cell);
      setPendingCell({ x, y });
      // Center within the space above the mobile controls row, not the
      // literal screen center (which those controls would cover) — same
      // usableHeight adjustment as handleRecenter.
      const usableHeight = isTouchPrimary
        ? viewport.height - MOBILE_CONTROLS_HEIGHT
        : viewport.height;
      commitTranslate({
        x: viewport.width / 2 - x * cellStep - cellSize / 2,
        y: usableHeight / 2 - y * cellStep - cellSize / 2,
      });
    });
  }, [viewport, isTouchPrimary, cellStep, cellSize, addLocalCell, commitTranslate]);

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
    const minX = Math.floor(-translate.x / cellStep) - BUFFER;
    const maxX = Math.ceil((-translate.x + viewport.width) / cellStep) + BUFFER;
    const minY = Math.floor(-translate.y / cellStep) - BUFFER;
    const maxY = Math.ceil((-translate.y + viewport.height) / cellStep) + BUFFER;
    setRange((prev) =>
      prev &&
      prev.minX === minX &&
      prev.maxX === maxX &&
      prev.minY === minY &&
      prev.maxY === maxY
        ? prev
        : { minX, maxX, minY, maxY }
    );
  }, [translate, viewport, cellStep]);

  useEffect(() => {
    if (!range || filterActive) return;
    ensureRange(range.minX, range.maxX, range.minY, range.maxY);
  }, [range, ensureRange, filterActive]);

  // Packs the filtered result set into a compact grid starting at the
  // origin — no pagination needed given the app's current scale, so every
  // match is simply laid out, same as fetchAllImageCoords elsewhere.
  const filteredCellMap = useMemo(() => {
    const map = new Map<string, CellRow>();
    filteredCells.forEach((cell, i) => {
      const x = i % FILTERED_GRID_COLS;
      const y = Math.floor(i / FILTERED_GRID_COLS);
      map.set(`${x}:${y}`, cell);
    });
    return map;
  }, [filteredCells]);

  const getActiveCell = useCallback(
    (x: number, y: number) =>
      filterActive ? filteredCellMap.get(`${x}:${y}`) : getCell(x, y),
    [filterActive, filteredCellMap, getCell]
  );

  // Same viewport-windowed iteration for both modes — getActiveCell just
  // resolves against the virtual filtered layout instead of the real chunk
  // cache when a filter is active, so empty cells still render (as blanks,
  // via GridCell's readOnly prop) rather than only showing exact matches.
  const cellsInView = useMemo(() => {
    if (!range) return [];
    const items: { x: number; y: number; cell: CellRow | undefined }[] = [];
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        items.push({ x, y, cell: getActiveCell(x, y) });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, getActiveCell, version]);

  const handleCellCreated = useCallback(
    (cell: CellRow) => {
      addLocalCell(cell);
      if (cell.cell_type !== "image") return;
      setDotCoords((prev) => [...prev, { x: cell.x, y: cell.y, created_by: cell.created_by }]);
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

  const handleCellDeleted = useCallback(
    (x: number, y: number) => {
      removeLocalCell(x, y);
      setDotCoords((prev) => prev.filter((d) => d.x !== x || d.y !== y));
      setFilteredCells((prev) => prev.filter((c) => c.x !== x || c.y !== y));
    },
    [removeLocalCell]
  );

  const handleJoystickVector = useCallback(
    (dx: number, dy: number) => {
      // Camera-control convention, not drag-to-pan: pushing the stick up
      // should feel like moving the view toward the top of the gallery, the
      // opposite sign from how a raw drag gesture maps to translate.
      joystickVector.current = { x: -dx, y: -dy };
      const active = dx !== 0 || dy !== 0;
      joystickActive.current = active;
      if (active) runPhysics();
    },
    [runPhysics]
  );

  // Eases the view to a target translate over RECENTER_DURATION rather than
  // jumping instantly — reuses the same rafId slot as runPhysics (mutually
  // exclusive, since stopAnimation() cancels whichever is running first).
  const animateTranslateTo = useCallback(
    (target: { x: number; y: number }) => {
      stopAnimation();
      const start = { ...translateRef.current };
      const startTime = performance.now();
      const step = (ts: number) => {
        const t = Math.min((ts - startTime) / RECENTER_DURATION, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        commitTranslate({
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
        });
        rafId.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      rafId.current = requestAnimationFrame(step);
    },
    [commitTranslate, stopAnimation]
  );

  const handleRecenter = useCallback(() => {
    joystickActive.current = false;
    velocity.current = { x: 0, y: 0 };
    if (!containerRef.current) return;
    // On mobile, center within the space above the joystick/recenter row,
    // not the literal screen center (which those controls would cover).
    const usableHeight = isTouchPrimary
      ? containerRef.current.clientHeight - MOBILE_CONTROLS_HEIGHT
      : containerRef.current.clientHeight;
    animateTranslateTo({
      x: containerRef.current.clientWidth / 2 - cellSize / 2,
      y: usableHeight / 2 - cellSize / 2,
    });
  }, [animateTranslateTo, isTouchPrimary, cellSize]);

  // Changes the discrete zoom step, keeping whichever world point sits
  // under `anchor` (container-relative px — the zoom button click passes
  // the container's own center) visually stable rather than re-centering
  // on the origin.
  const handleZoomStep = useCallback(
    (direction: 1 | -1, anchor: { x: number; y: number }) => {
      setZoomIndex((prevIndex) => {
        const nextIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, prevIndex + direction));
        if (nextIndex === prevIndex) return prevIndex;
        const oldStep = CELL_SIZE * ZOOM_LEVELS[prevIndex] + GAP * ZOOM_LEVELS[prevIndex];
        const newStep = CELL_SIZE * ZOOM_LEVELS[nextIndex] + GAP * ZOOM_LEVELS[nextIndex];
        const ratio = newStep / oldStep;
        commitTranslate({
          x: anchor.x - (anchor.x - translateRef.current.x) * ratio,
          y: anchor.y - (anchor.y - translateRef.current.y) * ratio,
        });
        return nextIndex;
      });
    },
    [commitTranslate]
  );

  // Zoom buttons anchor on the container's own center rather than a
  // gesture midpoint.
  const zoomAtCenter = useCallback(
    (direction: 1 | -1) => {
      if (!containerRef.current) return;
      handleZoomStep(direction, {
        x: containerRef.current.clientWidth / 2,
        y: containerRef.current.clientHeight / 2,
      });
    },
    [handleZoomStep]
  );

  // Single toggle button: below the default size, the next tap zooms back
  // up to it; at the default, the next tap zooms down one step.
  const isZoomedOut = zoomIndex < DEFAULT_ZOOM_INDEX;
  const toggleZoom = useCallback(() => {
    zoomAtCenter(isZoomedOut ? 1 : -1);
  }, [zoomAtCenter, isZoomedOut]);

  // Jump to the start of the clustered results as soon as a filter engages,
  // rather than leaving the view wherever it happened to be panned to in
  // the real gallery (which could be far from the compact virtual layout).
  useEffect(() => {
    if (filterActive && !wasFilterActive.current) {
      handleRecenter();
    }
    wasFilterActive.current = filterActive;
  }, [filterActive, handleRecenter]);

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
        const cellX = Math.floor((e.clientX - rect.left - translateRef.current.x) / cellStep);
        const cellY = Math.floor((e.clientY - rect.top - translateRef.current.y) / cellStep);
        setPendingCell({ x: cellX, y: cellY });
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
            <GridCell
              key={`${x}:${y}`}
              x={x}
              y={y}
              cell={cell}
              currentUserId={user?.id}
              readOnly={filterActive}
              cellSize={cellSize}
              step={cellStep}
            />
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
          <FilterBar themes={themes} themeId={themeFilterId} onThemeIdChange={setThemeFilterId} />
          {user && (
            <MineToggleButton active={onlyMine} onToggle={() => setOnlyMine((v) => !v)} />
          )}
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={isZoomedOut ? "Increase thumbnail size" : "Decrease thumbnail size"}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="w-5 h-5"
            >
              <path d="M5 12h14" />
              {isZoomedOut && <path d="M12 5v14" />}
            </svg>
          </button>
          <div className="relative w-24 h-24 flex items-center justify-center">
            {!filterActive && (
              <div
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none transition-opacity duration-200"
                style={{ opacity: radarVisible ? 1 : 0, bottom: "calc(100% + 12px)" }}
              >
                <MinimapRadar ref={minimapRef} dots={dotCoords} currentUserId={user?.id} />
              </div>
            )}
            <Joystick onVector={handleJoystickVector} onActiveChange={setRadarVisible} />
          </div>
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

      {!isTouchPrimary && !filterActive && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-opacity duration-200"
          style={{ opacity: isDragging ? 1 : 0 }}
        >
          <MinimapRadar ref={minimapRef} dots={dotCoords} currentUserId={user?.id} />
        </div>
      )}

      {!isTouchPrimary && (
        <div className="fixed bottom-8 left-8 z-40 flex items-center gap-3">
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
          <FilterBar themes={themes} themeId={themeFilterId} onThemeIdChange={setThemeFilterId} />
          {user && (
            <MineToggleButton active={onlyMine} onToggle={() => setOnlyMine((v) => !v)} />
          )}
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={isZoomedOut ? "Increase thumbnail size" : "Decrease thumbnail size"}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="w-5 h-5"
            >
              <path d="M5 12h14" />
              {isZoomedOut && <path d="M12 5v14" />}
            </svg>
          </button>
        </div>
      )}

      {isTouchPrimary && <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />}

      {pendingCell && (() => {
        const existing = getActiveCell(pendingCell.x, pendingCell.y);
        const closeModal = () => {
          setPendingCell(null);
          setCelebration(null);
        };
        if (filterActive) {
          return existing ? (
            <ViewCellModal
              cell={existing}
              isAdmin={isAdmin}
              onClose={closeModal}
              onDeleted={handleCellDeleted}
            />
          ) : null;
        }
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
            onDeleted={handleCellDeleted}
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
