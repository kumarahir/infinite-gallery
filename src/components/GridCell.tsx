import { memo } from "react";
import Image from "next/image";
import { getPublicImageUrl, type CellRow } from "@/lib/cells";
import type { ReactionSummary } from "@/lib/reactions";

function GridCell({
  x,
  y,
  cell,
  currentUserId,
  readOnly,
  cellSize,
  step,
  reactionSummary,
  showReactionBadge,
}: {
  x: number;
  y: number;
  cell: CellRow | undefined;
  currentUserId?: string;
  readOnly?: boolean;
  cellSize: number;
  step: number;
  reactionSummary?: ReactionSummary;
  // Faded out while the canvas is panning/settling — a badge that
  // stays glued to a thumbnail whizzing past mid-drag reads as jittery
  // clutter rather than a calm summary.
  showReactionBadge?: boolean;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: x * step,
    top: y * step,
    width: cellSize,
    height: cellSize,
  };

  if (!cell) {
    return (
      <div
        style={style}
        className="grid-cell flex items-center justify-center rounded-lg border border-dashed border-black/20 dark:border-white/25 bg-black/[0.03] dark:bg-white/[0.04] text-black/30 dark:text-white/35"
      >
        {!readOnly && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="w-6 h-6 pointer-events-none"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
      </div>
    );
  }

  if (cell.cell_type === "image" && cell.image_path) {
    const isOwn = !!currentUserId && cell.created_by === currentUserId;
    // Cells uploaded after the dedicated-thumbnail feature shipped have a
    // pre-shrunk ~400px file — already the right ballpark size for an
    // 80-160px cell, so there's nothing for Next's Image Optimization to
    // usefully do to it (unoptimized skips that transform entirely). Older
    // cells have no thumbnail_path and fall back to the full image, still
    // correctly downsized server-side via the sizes prop below.
    const hasThumbnail = !!cell.thumbnail_path;
    return (
      <div
        style={style}
        className={`grid-cell rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 ${
          isOwn ? "border-2 border-dotted border-blue-500" : ""
        }`}
      >
        <Image
          src={getPublicImageUrl(cell.thumbnail_path ?? cell.image_path)}
          alt=""
          width={cellSize}
          height={cellSize}
          unoptimized={hasThumbnail}
          // Without `sizes`, Next.js assumes this could render as wide as
          // the viewport and requests (and bills) a much larger transform
          // than this thumbnail — which is always exactly cellSize — ever
          // needs, even though CSS (object-cover, below) is what actually
          // fits it into the cell. Ignored when unoptimized.
          sizes={`${cellSize}px`}
          draggable={false}
          className="w-full h-full object-cover pointer-events-none"
        />
        {reactionSummary && (
          <span
            className={`absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-white pointer-events-none transition-opacity duration-150 ${
              showReactionBadge ? "opacity-100" : "opacity-0"
            }`}
          >
            {reactionSummary.emoji} {reactionSummary.total}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={style}
      className="grid-cell rounded-lg bg-black/5 dark:bg-white/5 p-3 overflow-hidden"
    >
      <p className="text-sm leading-snug break-words line-clamp-[7] pointer-events-none">
        {cell.text_content}
      </p>
    </div>
  );
}

export default memo(GridCell);
