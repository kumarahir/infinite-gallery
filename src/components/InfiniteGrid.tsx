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
import GalleryModeToggle, { type GalleryMode } from "./GalleryModeToggle";
import GridViewToggle from "./GridViewToggle";
import GalleryGridView, { type GridSortBy } from "./GalleryGridView";
import LandingOverlay from "./LandingOverlay";
import MobileToolsDrawer from "./MobileToolsDrawer";
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
  fetchLastImageCellByUser,
  fetchThemes,
  fetchTotalImageCount,
  getPublicImageUrl,
  type CellCoord,
  type CellRow,
  type Theme,
} from "@/lib/cells";
import { buildCollage, collageFilename } from "@/lib/collage";
import { getOrCreatePersonalShareToken } from "@/lib/personalShares";
import { fetchThemePrompts, type ThemePrompt } from "@/lib/themePrompts";
import {
  fetchAllReactionSummaries,
  fetchReactionBreakdownByCellIds,
  totalReactionCount,
  type ReactionCounts,
  type ReactionSummary,
} from "@/lib/reactions";

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
  // Shown once when the gallery is first opened — dismissed for the rest of
  // this session, not persisted, since this component only ever mounts once
  // per page load anyway.
  const [overlayOpen, setOverlayOpen] = useState(true);
  // Mobile-only bottom sheet holding the filter/mine/size-toggle controls,
  // out of the main joystick/recenter row.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [celebration, setCelebration] = useState<{
    x: number;
    y: number;
    total: number | null;
    streak: number | null;
    publishError: string | null;
  } | null>(null);
  const [dotCoords, setDotCoords] = useState<CellCoord[]>([]);
  const [radarVisible, setRadarVisible] = useState(false);
  const minimapRef = useRef<MinimapRadarHandle>(null);
  const [reactionSummaries, setReactionSummaries] = useState<Map<number, ReactionSummary>>(
    new Map()
  );
  // Lets ViewCellModal push a cell's new reaction state straight into the
  // grid's badge map the instant a reaction is set/changed/cleared, instead
  // of waiting for the next full page load's bulk fetch to catch up.
  const handleReactionSummaryChange = useCallback(
    (cellId: number, summary: ReactionSummary | null) => {
      setReactionSummaries((prev) => {
        const next = new Map(prev);
        if (summary) next.set(cellId, summary);
        else next.delete(cellId);
        return next;
      });
    },
    []
  );
  // Reaction badges fade out while the view is actually moving (drag,
  // momentum coast, zoom, recenter, deep-link centering — anything that
  // changes `translate`) and back in shortly after it stops, rather than
  // tracking each of those animations individually.
  const [gridSettled, setGridSettled] = useState(true);
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Plain vertical-scrolling 2-column grid, as an alternative to the
  // pannable canvas — respects whatever Theme/Mine filter is currently
  // active (or shows everything in the current gallery plane if neither is
  // set), reusing the same `filteredCells` fetch as the clustered/filtered
  // canvas mode above rather than a second data source.
  const [gridViewOn, setGridViewOn] = useState(false);
  const [gridSortBy, setGridSortBy] = useState<GridSortBy>("time");
  const [gridThemePrompts, setGridThemePrompts] = useState<ThemePrompt[]>([]);
  const [gridViewSelectedCell, setGridViewSelectedCell] = useState<CellRow | null>(null);

  // Which (x,y) plane is currently being browsed — the shared community
  // canvas, or this signed-in user's own private one. Always "community"
  // for logged-out visitors (the toggle itself only renders when `user` is
  // set). `personalOwnerId` is the single value threaded through every
  // scope-aware fetch below — undefined selects the community plane.
  const [galleryMode, setGalleryMode] = useState<GalleryMode>("community");
  const personalOwnerId = galleryMode === "personal" && user ? user.id : undefined;

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

  // `stepForMinimap` lets callers that change zoom mid-render (see
  // handleZoomStep, which commits a translate from inside the setZoomIndex
  // updater, before this component re-renders with the new cellStep) pass
  // the up-to-date step explicitly — otherwise this would close over the
  // stale, pre-zoom `cellStep` and briefly desync the minimap.
  const paintTransform = useCallback(
    (stepForMinimap?: number) => {
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translate3d(${translateRef.current.x}px, ${translateRef.current.y}px, 0)`;
      }
      // Minimap dots are placed in fixed world-cell units (unaffected by
      // zoom), so it needs the world coordinate currently at the viewport's
      // center — not the raw pixel translate, which is scaled by the
      // (zoom-dependent) cellStep and would drift the minimap out of sync
      // with the real gallery center every time the thumbnail size changes.
      const step = stepForMinimap ?? cellStep;
      minimapRef.current?.setPan(
        (viewport.width / 2 - translateRef.current.x) / step,
        (viewport.height / 2 - translateRef.current.y) / step
      );
    },
    [viewport.width, viewport.height, cellStep]
  );

  const scheduleStateSync = useCallback(() => {
    if (syncScheduled.current) return;
    syncScheduled.current = true;
    requestAnimationFrame(() => {
      syncScheduled.current = false;
      setTranslate({ ...translateRef.current });
    });
  }, []);

  const commitTranslate = useCallback(
    (next: { x: number; y: number }, stepForMinimap?: number) => {
      translateRef.current = next;
      paintTransform(stepForMinimap);
      scheduleStateSync();
    },
    [paintTransform, scheduleStateSync]
  );

  const { ensureRange, getCell, addLocalCell, removeLocalCell, version } =
    useCellChunks(personalOwnerId);

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

  // Fetched for the minimap radar — kept in sync afterward via
  // handleCellCreated/handleCellDeleted rather than re-queried, except when
  // the gallery plane itself changes, which needs a fresh fetch scoped to
  // the newly-selected plane.
  useEffect(() => {
    fetchAllImageCoords(personalOwnerId)
      .then(setDotCoords)
      .catch(() => {
        // Radar just shows no dots if this fails — not worth surfacing an error for.
      });
  }, [personalOwnerId]);

  // Seeds the grid's reaction badges on load; individual cells are kept
  // live afterward via handleReactionSummaryChange, not by re-running this.
  useEffect(() => {
    fetchAllReactionSummaries()
      .then(setReactionSummaries)
      .catch(() => {
        // Badges just won't show if this fails.
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

  // Re-fetch the clustered result set whenever the active filter changes —
  // also feeds the grid view below, which (unlike the clustered canvas
  // mode) wants a result even with no filter active at all, since "grid
  // view" on its own means "show everything in this plane".
  useEffect(() => {
    if (!filterActive && !gridViewOn) {
      setFilteredCells([]);
      return;
    }
    fetchFilteredCells({ onlyMine, themeId: themeFilterId }, user?.id, personalOwnerId)
      .then(setFilteredCells)
      .catch(() => setFilteredCells([]));
  }, [filterActive, gridViewOn, onlyMine, themeFilterId, user?.id, personalOwnerId]);

  // Prompts backing the grid view's "sort by prompt" — every theme's when
  // no theme filter narrows things to one, since sketches from several
  // themes can be shown together there.
  useEffect(() => {
    if (!gridViewOn) {
      setGridThemePrompts([]);
      return;
    }
    fetchThemePrompts(themeFilterId)
      .then(setGridThemePrompts)
      .catch(() => setGridThemePrompts([]));
  }, [gridViewOn, themeFilterId]);

  // Collage download — needs a coherent scope: one person, one theme. In
  // community mode that means both onlyMine and themeFilterId set (onlyMine
  // alone would be unbounded — every sketch this user has ever made;
  // themeFilterId alone wouldn't be personal — everyone's sketches in that
  // theme). In personal mode everything already belongs to this user, so
  // onlyMine (hidden there anyway) doesn't need to be true too.
  const [downloadingCollage, setDownloadingCollage] = useState(false);
  const collageReady =
    !!user && themeFilterId != null && (galleryMode === "community" ? onlyMine : true);

  const handleDownloadCollage = useCallback(async () => {
    if (!collageReady || filteredCells.length === 0 || downloadingCollage) return;
    setDownloadingCollage(true);
    try {
      const theme = themes.find((t) => t.id === themeFilterId);
      // Oldest-first — reads as a progression through the month rather than
      // the newest-first order the real-time filtered grid uses.
      const sorted = [...filteredCells].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const name = sorted[0]?.created_by_name ?? "My";
      const themeName = theme?.name ?? "Theme";
      const withImage = sorted.filter((c) => c.thumbnail_path || c.image_path);

      // Highlight row for whichever of these sketches have any reactions at
      // all — omitted entirely (see buildCollage) if none do, rather than
      // showing an empty "most reactions" section.
      const breakdown = await fetchReactionBreakdownByCellIds(withImage.map((c) => c.id)).catch(
        () => new Map<number, ReactionCounts>()
      );
      const topReacted = withImage
        .map((c) => ({ cell: c, counts: breakdown.get(c.id) }))
        .filter((r): r is { cell: CellRow; counts: ReactionCounts } => !!r.counts)
        .sort((a, b) => totalReactionCount(b.counts) - totalReactionCount(a.counts))
        .slice(0, 3)
        .map(({ cell, counts }) => ({
          imageUrl: getPublicImageUrl(cell.thumbnail_path ?? cell.image_path ?? ""),
          counts,
        }));

      const blob = await buildCollage({
        name,
        themeName,
        sketches: withImage.map((c) => ({
          imageUrl: getPublicImageUrl(c.thumbnail_path ?? c.image_path ?? ""),
        })),
        topReacted,
      });
      const filename = collageFilename(name, themeName);

      // On mobile, an <a download> click doesn't save into Photos/Gallery —
      // iOS Safari in particular routes it through "Save to Files" instead,
      // since it isn't recognized as a savable image asset that way. Sharing
      // the actual File through the native share sheet (same mechanism
      // ShareButton already uses) surfaces a real "Save Image" option that
      // saves to Photos/Gallery. Desktop browsers generally don't support
      // sharing files at all, so canShare returns false there and it falls
      // through to the plain anchor download, which is the expected desktop
      // behavior.
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          // Fall through to the anchor-download fallback below.
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to build sketch collage", err);
    } finally {
      setDownloadingCollage(false);
    }
  }, [collageReady, filteredCells, downloadingCollage, themes, themeFilterId]);

  // Shares a public, no-login-required page listing every sketch this user
  // has made for this theme (same collageReady scope as the collage).
  // Community: /share/[userId]/[themeId], reading through RLS policies
  // that are already public (cells, cell_reactions, theme_prompts, themes)
  // plus the get_public_profile RPC. Personal: /share/personal/[token] —
  // personal cells aren't publicly selectable, so this goes through
  // get_or_create_personal_share instead of exposing the raw userId/themeId
  // (see schema.sql's v3.0 section for why: theme_id is a small guessable
  // int, so a raw-id link would let anyone enumerate this user's other
  // personal themes with no way to revoke a leak).
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const handleShareCollectionLink = useCallback(async () => {
    if (!collageReady || !user || themeFilterId == null) return;
    const theme = themes.find((t) => t.id === themeFilterId);
    const text = theme ? `Check out my ${theme.name} sketches` : "Check out my sketches";

    let url: string;
    if (galleryMode === "personal") {
      try {
        const token = await getOrCreatePersonalShareToken(themeFilterId);
        url = `${window.location.origin}/share/personal/${token}`;
      } catch (err) {
        console.error("Failed to create personal share link", err);
        return;
      }
    } else {
      url = `${window.location.origin}/share/${user.id}/${themeFilterId}`;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: "Infinite Gallery", text, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    await navigator.clipboard.writeText(url);
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  }, [collageReady, user, themeFilterId, themes, galleryMode]);

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

  // Absent a deep link, a signed-in artist opens the gallery centered on
  // their own most recently uploaded cell instead of the origin — picking
  // up where they left off. Guests and never-uploaded users keep the
  // default origin-centered view (translate starts at {0,0}). Doesn't
  // prefetch/open the cell like the deep-link effect does — this only
  // repositions the view; the normal chunk-loading path fills it in once
  // panned there.
  const lastCellHandled = useRef(false);

  useEffect(() => {
    if (lastCellHandled.current || deepLinkCell.current) return;
    if (viewport.width === 0 && viewport.height === 0) return;
    lastCellHandled.current = true;
    if (!user) return;

    fetchLastImageCellByUser(user.id).then((coord) => {
      if (!coord) return;
      const { x, y } = coord;
      const usableHeight = isTouchPrimary
        ? viewport.height - MOBILE_CONTROLS_HEIGHT
        : viewport.height;
      commitTranslate({
        x: viewport.width / 2 - x * cellStep - cellSize / 2,
        y: usableHeight / 2 - y * cellStep - cellSize / 2,
      });
    });
  }, [viewport, isTouchPrimary, cellStep, cellSize, user, commitTranslate]);

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
    setGridSettled(false);
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
    settleTimeout.current = setTimeout(() => setGridSettled(true), 150);
    return () => {
      if (settleTimeout.current) clearTimeout(settleTimeout.current);
    };
  }, [translate]);

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
    (cell: CellRow, streak?: number, publishError?: string) => {
      addLocalCell(cell);
      if (cell.cell_type !== "image") return;
      setDotCoords((prev) => [...prev, { x: cell.x, y: cell.y, created_by: cell.created_by }]);
      // Show the thank-you banner immediately (count fills in once known) —
      // the ViewCellModal that's about to render for this cell reads it.
      // The streak is already known at this point (AddCellModal fetched it
      // right after the insert), unlike the total count below. publishError
      // (from a failed "also publish to community" attempt) is already
      // fully resolved by the time AddCellModal calls this.
      setCelebration({
        x: cell.x,
        y: cell.y,
        total: null,
        streak: streak ?? null,
        publishError: publishError ?? null,
      });
      // fetchTotalImageCount is community-only — showing that count after a
      // personal-gallery upload would be misleading (it didn't change), so
      // the banner just skips the "to make it total of X" clause there and
      // leaves total permanently null.
      if (cell.personal_owner_id != null) return;
      fetchTotalImageCount()
        .then((total) => setCelebration((prev) => (prev ? { ...prev, total } : prev)))
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

  // Recenters whenever the gallery-mode toggle actually changes (not on
  // mount — wasGalleryMode starts equal to the initial value, so this only
  // fires on a real switch) — community and personal are unrelated
  // coordinate spaces, so wherever the view happened to be panned to in one
  // plane means nothing in the other. Mirrors the "open centered on your
  // last upload, else origin" logic the mount effect above already has,
  // just re-triggerable instead of once-only, and reset to the newly
  // active plane's own last cell rather than the community one.
  const wasGalleryMode = useRef(galleryMode);
  useEffect(() => {
    if (wasGalleryMode.current === galleryMode) return;
    wasGalleryMode.current = galleryMode;
    setOnlyMine(false);
    setThemeFilterId(null);
    if (!user || !containerRef.current) {
      handleRecenter();
      return;
    }
    fetchLastImageCellByUser(user.id, personalOwnerId).then((coord) => {
      if (!coord || !containerRef.current) {
        handleRecenter();
        return;
      }
      const { x, y } = coord;
      const usableHeight = isTouchPrimary
        ? containerRef.current.clientHeight - MOBILE_CONTROLS_HEIGHT
        : containerRef.current.clientHeight;
      animateTranslateTo({
        x: containerRef.current.clientWidth / 2 - x * cellStep - cellSize / 2,
        y: usableHeight / 2 - y * cellStep - cellSize / 2,
      });
    });
  }, [
    galleryMode,
    user,
    personalOwnerId,
    isTouchPrimary,
    cellStep,
    cellSize,
    handleRecenter,
    animateTranslateTo,
  ]);

  // Landing overlay's "shuffle" action — teleports to a random existing
  // sketch, reusing the same off-screen-controls-aware centering math as
  // handleRecenter/the deep-link effect. dotCoords is already fetched on
  // mount for the minimap, so this needs no extra query.
  const handleShuffle = useCallback(() => {
    if (dotCoords.length === 0 || !containerRef.current) return;
    const target = dotCoords[Math.floor(Math.random() * dotCoords.length)];
    const usableHeight = isTouchPrimary
      ? containerRef.current.clientHeight - MOBILE_CONTROLS_HEIGHT
      : containerRef.current.clientHeight;
    animateTranslateTo({
      x: containerRef.current.clientWidth / 2 - target.x * cellStep - cellSize / 2,
      y: usableHeight / 2 - target.y * cellStep - cellSize / 2,
    });
  }, [dotCoords, isTouchPrimary, cellStep, cellSize, animateTranslateTo]);

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
        commitTranslate(
          {
            x: anchor.x - (anchor.x - translateRef.current.x) * ratio,
            y: anchor.y - (anchor.y - translateRef.current.y) * ratio,
          },
          newStep
        );
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

  // Single toggle button between the two zoom steps: at the smallest step,
  // the next tap zooms up one step; otherwise the next tap zooms back down
  // to the smallest step. Defined relative to the array's own bounds (not
  // DEFAULT_ZOOM_INDEX) so this stays correct no matter which step is the
  // default.
  const isZoomedOut = zoomIndex === 0;
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
          gridViewOn ? "hidden" : isDragging ? "cursor-grabbing" : "cursor-grab"
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
              reactionSummary={cell ? reactionSummaries.get(cell.id) : undefined}
              showReactionBadge={gridSettled}
            />
          ))}
        </div>
      </div>

      {gridViewOn && (
        <GalleryGridView
          cells={filteredCells}
          themePrompts={gridThemePrompts}
          reactionSummaries={reactionSummaries}
          sortBy={gridSortBy}
          onSortByChange={setGridSortBy}
          onSelectCell={setGridViewSelectedCell}
        />
      )}

      {isTouchPrimary && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            {!gridViewOn && (
              <>
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
              </>
            )}
            <button
              type="button"
              onClick={() => setToolsOpen((v) => !v)}
              aria-label={toolsOpen ? "Hide gallery tools" : "Show gallery tools"}
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
                {toolsOpen ? <path d="m6 9 6 6 6-6" /> : <path d="m18 15-6-6-6 6" />}
              </svg>
            </button>
          </div>

          <MobileToolsDrawer open={toolsOpen}>
            <FilterBar themes={themes} themeId={themeFilterId} onThemeIdChange={setThemeFilterId} />
            {user && (
              <GalleryModeToggle
                mode={galleryMode}
                onToggle={() => setGalleryMode((m) => (m === "community" ? "personal" : "community"))}
              />
            )}
            {user && galleryMode === "community" && (
              <MineToggleButton active={onlyMine} onToggle={() => setOnlyMine((v) => !v)} />
            )}
            <GridViewToggle active={gridViewOn} onToggle={() => setGridViewOn((v) => !v)} />
            {collageReady && (
              <button
                type="button"
                onClick={handleDownloadCollage}
                disabled={downloadingCollage || filteredCells.length === 0}
                aria-label="Download sketch collage"
                title="Download sketch collage"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80 disabled:opacity-40"
              >
                {downloadingCollage ? (
                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
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
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                )}
              </button>
            )}
            {collageReady && (
              <button
                type="button"
                onClick={handleShareCollectionLink}
                aria-label="Share sketches page"
                title="Share sketches page"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
              >
                {shareLinkCopied ? (
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
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
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
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
                  </svg>
                )}
              </button>
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
          </MobileToolsDrawer>
        </div>
      )}

      {!isTouchPrimary && !filterActive && !gridViewOn && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-opacity duration-200"
          style={{ opacity: isDragging ? 1 : 0 }}
        >
          <MinimapRadar ref={minimapRef} dots={dotCoords} currentUserId={user?.id} />
        </div>
      )}

      {!isTouchPrimary && (
        <div className="fixed bottom-8 left-8 z-40 flex items-center gap-3">
          {!gridViewOn && (
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
          )}
          <FilterBar themes={themes} themeId={themeFilterId} onThemeIdChange={setThemeFilterId} />
          {user && (
            <GalleryModeToggle
              mode={galleryMode}
              onToggle={() => setGalleryMode((m) => (m === "community" ? "personal" : "community"))}
            />
          )}
          {user && galleryMode === "community" && (
            <MineToggleButton active={onlyMine} onToggle={() => setOnlyMine((v) => !v)} />
          )}
          <GridViewToggle active={gridViewOn} onToggle={() => setGridViewOn((v) => !v)} />
          {collageReady && (
            <button
              type="button"
              onClick={handleDownloadCollage}
              disabled={downloadingCollage || filteredCells.length === 0}
              aria-label="Download sketch collage"
              title="Download sketch collage"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80 disabled:opacity-40"
            >
              {downloadingCollage ? (
                <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
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
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
              )}
            </button>
          )}
          {collageReady && (
            <button
              type="button"
              onClick={handleShareCollectionLink}
              aria-label="Share sketches page"
              title="Share sketches page"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
            >
              {shareLinkCopied ? (
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
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
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
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
                </svg>
              )}
            </button>
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

      <LandingOverlay
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        user={user}
        themes={themes}
        onShowMine={() => {
          setOnlyMine(true);
          setOverlayOpen(false);
        }}
        onExploreTheme={(themeId) => {
          setThemeFilterId(themeId);
          setOverlayOpen(false);
        }}
        onShuffle={() => {
          handleShuffle();
          setOverlayOpen(false);
        }}
      />

      {gridViewSelectedCell && (
        <ViewCellModal
          cell={gridViewSelectedCell}
          user={user}
          isAdmin={isAdmin}
          onClose={() => setGridViewSelectedCell(null)}
          onDeleted={(x, y) => {
            handleCellDeleted(x, y);
            setGridViewSelectedCell(null);
          }}
          onReactionChange={handleReactionSummaryChange}
        />
      )}

      {!gridViewOn && pendingCell && (() => {
        const existing = getActiveCell(pendingCell.x, pendingCell.y);
        const closeModal = () => {
          setPendingCell(null);
          setCelebration(null);
        };
        if (filterActive) {
          return existing ? (
            <ViewCellModal
              cell={existing}
              user={user}
              isAdmin={isAdmin}
              onClose={closeModal}
              onDeleted={handleCellDeleted}
              onReactionChange={handleReactionSummaryChange}
            />
          ) : null;
        }
        return existing ? (
          <ViewCellModal
            cell={existing}
            user={user}
            isAdmin={isAdmin}
            celebrateTotal={
              celebration && celebration.x === pendingCell.x && celebration.y === pendingCell.y
                ? celebration.total
                : undefined
            }
            celebrateStreak={
              celebration && celebration.x === pendingCell.x && celebration.y === pendingCell.y
                ? celebration.streak
                : undefined
            }
            celebratePublishError={
              celebration && celebration.x === pendingCell.x && celebration.y === pendingCell.y
                ? celebration.publishError
                : undefined
            }
            onClose={closeModal}
            onDeleted={handleCellDeleted}
            onReactionChange={handleReactionSummaryChange}
          />
        ) : (
          <AddCellModal
            x={pendingCell.x}
            y={pendingCell.y}
            user={user}
            isAdmin={isAdmin}
            galleryMode={galleryMode}
            onClose={closeModal}
            onCreated={handleCellCreated}
          />
        );
      })()}
    </>
  );
}
