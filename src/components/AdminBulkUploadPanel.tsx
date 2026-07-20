"use client";

import { useEffect, useState } from "react";
import {
  CellTakenError,
  fetchOccupiedCoords,
  fetchThemes,
  insertImageCell,
  type Theme,
} from "@/lib/cells";
import { resizeImageWithThumbnail } from "@/lib/resizeImage";
import { useUser } from "@/hooks/useUser";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const BOUNDS_PADDING = 5; // cells of extra room around existing content
const MAX_PLACEMENT_ATTEMPTS = 20;

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function computeBounds(coords: { x: number; y: number }[]): Bounds {
  if (coords.length === 0) {
    return { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  }
  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  return {
    minX: Math.min(...xs) - BOUNDS_PADDING,
    maxX: Math.max(...xs) + BOUNDS_PADDING,
    minY: Math.min(...ys) - BOUNDS_PADDING,
    maxY: Math.max(...ys) + BOUNDS_PADDING,
  };
}

function randomEmptyCell(
  occupied: Set<string>,
  bounds: Bounds
): { x: number; y: number } | null {
  for (let i = 0; i < 200; i++) {
    const x = bounds.minX + Math.floor(Math.random() * (bounds.maxX - bounds.minX + 1));
    const y = bounds.minY + Math.floor(Math.random() * (bounds.maxY - bounds.minY + 1));
    if (!occupied.has(`${x}:${y}`)) return { x, y };
  }
  return null;
}

type FileResult = { name: string; status: "ok" | "error"; message?: string };

export default function AdminBulkUploadPanel() {
  const user = useUser(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeId, setThemeId] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<FileResult[]>([]);

  useEffect(() => {
    fetchThemes()
      .then((list) => {
        setThemes(list);
        const defaultTheme = list.find((t) => t.is_default);
        setThemeId(defaultTheme?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {
        // Leave themes empty — the upload button stays disabled in that case.
      });
  }, []);

  const pickFiles = (fileList: FileList | null) => {
    setResults([]);
    setFiles(fileList ? Array.from(fileList) : []);
  };

  const upload = async () => {
    if (!user || files.length === 0 || themeId == null) return;
    setBusy(true);
    setResults([]);
    setProgress(0);

    const coords = await fetchOccupiedCoords();
    const occupied = new Set(coords.map((c) => `${c.x}:${c.y}`));
    const bounds = computeBounds(coords);

    for (const file of files) {
      try {
        if (!ALLOWED_TYPES.has(file.type)) throw new Error("Unsupported file type.");
        if (file.size > MAX_FILE_SIZE) throw new Error("File is too large (max 20MB).");

        const { full, thumbnail } = await resizeImageWithThumbnail(file);

        let placed = false;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && !placed; attempt++) {
          const cell = randomEmptyCell(occupied, bounds);
          if (!cell) {
            lastError = new Error("No empty cell available.");
            break;
          }
          occupied.add(`${cell.x}:${cell.y}`);
          try {
            await insertImageCell({
              x: cell.x,
              y: cell.y,
              blob: full.blob,
              width: full.width,
              height: full.height,
              thumbnailBlob: thumbnail.blob,
              userId: user.id,
              themeId,
            });
            placed = true;
          } catch (err) {
            lastError = err;
            // Someone else just took that cell — try another. Any other
            // failure (storage, network, RLS) isn't worth retrying.
            if (!(err instanceof CellTakenError)) break;
          }
        }
        if (!placed) {
          throw lastError instanceof Error ? lastError : new Error("Could not place image.");
        }
        setResults((prev) => [...prev, { name: file.name, status: "ok" }]);
      } catch (err) {
        setResults((prev) => [
          ...prev,
          { name: file.name, status: "error", message: err instanceof Error ? err.message : "Failed." },
        ]);
      } finally {
        setProgress((prev) => prev + 1);
      }
    }

    setBusy(false);
    setFiles([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-black/60 dark:text-white/60">
        Upload several images at once — each lands in a random empty cell near the existing
        gallery content.
      </p>

      <label className="flex flex-col items-center justify-center gap-1 py-6 rounded-lg border-2 border-dashed border-black/15 dark:border-white/20 cursor-pointer hover:border-black/30 dark:hover:border-white/40 transition-colors">
        <span className="text-sm text-black/50 dark:text-white/50">
          {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Click to choose images"}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => pickFiles(e.target.files)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-black/50 dark:text-white/50">Theme</span>
        <select
          value={themeId ?? ""}
          onChange={(e) => setThemeId(Number(e.target.value))}
          className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
        >
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={upload}
        disabled={files.length === 0 || busy || themeId == null}
        className="self-start rounded-lg bg-foreground text-background text-sm font-medium px-4 py-2 disabled:opacity-40 hover:opacity-90"
      >
        {busy ? `Uploading ${progress}/${files.length}…` : `Upload ${files.length || ""} image${files.length === 1 ? "" : "s"}`}
      </button>

      {results.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {results.map((r, i) => (
            <li
              key={i}
              className={r.status === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
            >
              {r.status === "ok" ? "✓" : "✗"} {r.name}
              {r.message ? ` — ${r.message}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
