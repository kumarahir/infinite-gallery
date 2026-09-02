"use client";

import Image from "next/image";
import { getPublicImageUrl, type CellRow } from "@/lib/cells";
import type { ReactionSummary } from "@/lib/reactions";
import { buildMultiThemePromptMaps, promptTextForCell, type MultiThemePromptRow } from "@/lib/sketchTitle";

export type GridSortBy = "time" | "prompt" | "artist";

// Newest-first for time (matches the rest of the app); alphabetical for
// prompt/artist, with unprompted sketches pushed to the end for the prompt
// sort rather than being scattered by their fallback "Day N" label — a
// sketch that never resolved to a real prompt isn't meaningfully ordered
// among ones that did.
function sortCells(
  cells: CellRow[],
  sortBy: GridSortBy,
  promptTextFor: (cell: CellRow) => string | null
): CellRow[] {
  const sorted = [...cells];
  if (sortBy === "time") {
    sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (sortBy === "artist") {
    sorted.sort((a, b) => (a.created_by_name ?? "").localeCompare(b.created_by_name ?? ""));
  } else {
    sorted.sort((a, b) => {
      const pa = promptTextFor(a);
      const pb = promptTextFor(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa.localeCompare(pb);
    });
  }
  return sorted;
}

export default function GalleryGridView({
  cells,
  themePrompts,
  reactionSummaries,
  sortBy,
  onSelectCell,
}: {
  cells: CellRow[];
  themePrompts: MultiThemePromptRow[];
  reactionSummaries: Map<number, ReactionSummary>;
  sortBy: GridSortBy;
  onSelectCell: (cell: CellRow) => void;
}) {
  const promptMaps = buildMultiThemePromptMaps(themePrompts);
  const promptTextFor = (cell: CellRow) => promptTextForCell(cell, promptMaps);
  const sorted = sortCells(cells, sortBy, promptTextFor);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-background pt-4">
      {sorted.length === 0 ? (
        <p className="p-6 text-sm text-black/50 dark:text-white/50">No sketches to show yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 max-w-3xl mx-auto">
          {sorted.map((cell) => {
            const promptText = promptTextFor(cell);
            const reaction = reactionSummaries.get(cell.id);
            return (
              <button
                key={cell.id}
                type="button"
                onClick={() => onSelectCell(cell)}
                className="flex flex-col gap-1 text-left"
              >
                <div className="relative aspect-square rounded-lg overflow-hidden bg-black/5 dark:bg-white/5">
                  <Image
                    src={getPublicImageUrl(cell.thumbnail_path ?? cell.image_path ?? "")}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 380px"
                    className="object-cover"
                  />
                  {reaction && (
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-white">
                      {reaction.emoji} {reaction.total}
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  {promptText && (
                    <span className="text-xs font-medium truncate">{promptText}</span>
                  )}
                  {cell.created_by_name && (
                    <span className="text-xs text-black/50 dark:text-white/50 truncate">
                      {cell.created_by_name}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
