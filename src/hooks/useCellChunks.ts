"use client";

import { useCallback, useRef, useState } from "react";
import { fetchCellsInRange, type CellRow } from "@/lib/cells";
import { CHUNK_SIZE } from "@/lib/gridConstants";

function chunkKey(cx: number, cy: number) {
  return `${cx}:${cy}`;
}

// Client-side cache of fetched grid chunks, keyed by chunk coordinate so
// re-panning into an already-visited region never re-fetches. Cache and
// in-flight tracking live in refs (not state) since they're mutated outside
// the render cycle; `version` is bumped to force consumers to re-read them.
export function useCellChunks() {
  const cache = useRef(new Map<string, CellRow[]>());
  const inFlight = useRef(new Set<string>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const ensureRange = useCallback(
    (minX: number, maxX: number, minY: number, maxY: number) => {
      const minCX = Math.floor(minX / CHUNK_SIZE);
      const maxCX = Math.floor((maxX - 1) / CHUNK_SIZE);
      const minCY = Math.floor(minY / CHUNK_SIZE);
      const maxCY = Math.floor((maxY - 1) / CHUNK_SIZE);

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
          const key = chunkKey(cx, cy);
          if (cache.current.has(key) || inFlight.current.has(key)) continue;
          inFlight.current.add(key);
          fetchCellsInRange(
            cx * CHUNK_SIZE,
            (cx + 1) * CHUNK_SIZE,
            cy * CHUNK_SIZE,
            (cy + 1) * CHUNK_SIZE
          )
            .then((rows) => {
              cache.current.set(key, rows);
            })
            .catch(() => {
              cache.current.set(key, []);
            })
            .finally(() => {
              inFlight.current.delete(key);
              bump();
            });
        }
      }
    },
    [bump]
  );

  const getCell = useCallback((x: number, y: number): CellRow | undefined => {
    const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
    return cache.current.get(key)?.find((r) => r.x === x && r.y === y);
  }, []);

  const addLocalCell = useCallback(
    (cell: CellRow) => {
      const key = chunkKey(
        Math.floor(cell.x / CHUNK_SIZE),
        Math.floor(cell.y / CHUNK_SIZE)
      );
      const existing = cache.current.get(key) ?? [];
      cache.current.set(key, [...existing, cell]);
      bump();
    },
    [bump]
  );

  const removeLocalCell = useCallback(
    (x: number, y: number) => {
      const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
      const existing = cache.current.get(key);
      if (!existing) return;
      cache.current.set(
        key,
        existing.filter((r) => !(r.x === x && r.y === y))
      );
      bump();
    },
    [bump]
  );

  return { ensureRange, getCell, addLocalCell, removeLocalCell, version };
}
