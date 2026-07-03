"use client";

import { useEffect, useState } from "react";
import { fetchTotalImageCount } from "@/lib/cells";

export default function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [totalSketches, setTotalSketches] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchTotalImageCount()
      .then(setTotalSketches)
      .catch(() => {
        // Non-critical — the celebratory count just won't show.
      });
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">About AtomicSketches</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-black/40 dark:text-white/40 hover:opacity-70"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm leading-relaxed text-black/80 dark:text-white/80">
          <p>
            AtomicSketches is a shared, infinite canvas where creators can share
            their sketches in the simplest way possible — a place to inspire
            others and be inspired. Every sketch added here also becomes part
            of a living archive of everything shared so far.
          </p>

          {totalSketches != null && (
            <div className="rounded-lg bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-900/40 dark:to-pink-900/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 text-center">
              <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">
                🎉 {totalSketches}
              </p>
              <p className="text-xs font-medium text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                AtomicSketches shared so far
              </p>
            </div>
          )}

          <div>
            <h3 className="font-medium text-black dark:text-white mb-1">Using the gallery</h3>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Tap any empty cell with a &ldquo;+&rdquo; to add a sketch or a short note.</li>
              <li>Sign in (Google or email) is required to add something — viewing is open to everyone.</li>
              <li>Pan around by dragging (desktop) or with the on-screen joystick (mobile).</li>
              <li>Tap a filled cell to view it enlarged, and share it from there.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-black dark:text-white mb-1">Image upload rules</h3>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Supported formats: JPEG, PNG, GIF, WebP, AVIF.</li>
              <li>Max file size: 20MB per image.</li>
              <li>Up to 5 images per person per day, to keep the gallery growing at a healthy pace for everyone. Text notes have no daily limit.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
