"use client";

import { useState } from "react";
import Image from "next/image";
import { deleteCell, getPublicImageUrl, type CellRow } from "@/lib/cells";
import ShareButton from "./ShareButton";

export default function ViewCellModal({
  cell,
  isAdmin,
  celebrateTotal,
  onClose,
  onDeleted,
}: {
  cell: CellRow;
  isAdmin: boolean;
  celebrateTotal?: number | null;
  onClose: () => void;
  onDeleted: (x: number, y: number) => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await deleteCell(cell);
      onDeleted(cell.x, cell.y);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setRemoving(false);
      setConfirmingRemove(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-black/40 dark:text-white/40 hover:opacity-70"
          >
            ×
          </button>
        </div>

        {celebrateTotal !== undefined && (
          <p className="text-sm font-medium text-center">
            Thank you for adding one more AtomicSketch
            {celebrateTotal != null ? ` to make it total of ${celebrateTotal}` : ""}
          </p>
        )}

        {cell.cell_type === "image" && cell.image_path ? (
          <div className="relative flex items-center justify-center max-h-[70vh] overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-black/15 dark:border-white/15 border-t-black/60 dark:border-t-white/70 animate-spin" />
              </div>
            )}
            <Image
              src={getPublicImageUrl(cell.image_path)}
              alt=""
              width={cell.image_width ?? 800}
              height={cell.image_height ?? 800}
              onLoad={() => setImageLoaded(true)}
              className={`max-w-full max-h-[70vh] w-auto h-auto object-contain transition-opacity duration-200 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        ) : (
          <p className="text-lg leading-snug break-words whitespace-pre-wrap py-4">
            {cell.text_content}
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <ShareButton cell={cell} />

          {isAdmin && (
            <div className="flex items-center gap-2">
              {confirmingRemove ? (
                <>
                  <span className="text-xs text-black/50 dark:text-white/50">Remove for everyone?</span>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={removing}
                    className="rounded-lg bg-red-600 text-white text-sm font-medium px-3 py-2 disabled:opacity-40 hover:opacity-90"
                  >
                    {removing ? "Removing…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={removing}
                    className="text-sm text-black/50 dark:text-white/50 hover:opacity-70"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  className="rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-medium px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
