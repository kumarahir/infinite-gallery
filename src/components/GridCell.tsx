import { memo } from "react";
import Image from "next/image";
import { CELL_SIZE, STEP } from "@/lib/gridConstants";
import { getPublicImageUrl, type CellRow } from "@/lib/cells";

function GridCell({
  x,
  y,
  cell,
}: {
  x: number;
  y: number;
  cell: CellRow | undefined;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: x * STEP,
    top: y * STEP,
    width: CELL_SIZE,
    height: CELL_SIZE,
  };

  if (!cell) {
    return (
      <div
        style={style}
        className="flex items-center justify-center rounded-lg border border-dashed border-black/20 dark:border-white/25 bg-black/[0.03] dark:bg-white/[0.04] text-black/30 dark:text-white/35"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6 pointer-events-none"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </div>
    );
  }

  if (cell.cell_type === "image" && cell.image_path) {
    return (
      <div
        style={style}
        className="rounded-lg overflow-hidden bg-black/5 dark:bg-white/5"
      >
        <Image
          src={getPublicImageUrl(cell.image_path)}
          alt=""
          width={cell.image_width ?? CELL_SIZE}
          height={cell.image_height ?? CELL_SIZE}
          draggable={false}
          className="w-full h-full object-cover pointer-events-none"
        />
      </div>
    );
  }

  return (
    <div
      style={style}
      className="rounded-lg bg-black/5 dark:bg-white/5 p-3 overflow-hidden"
    >
      <p className="text-sm leading-snug break-words line-clamp-[7] pointer-events-none">
        {cell.text_content}
      </p>
    </div>
  );
}

export default memo(GridCell);
