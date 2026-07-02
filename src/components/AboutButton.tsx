"use client";

import { useState } from "react";

export default function AboutButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About this gallery"
        className="fixed bottom-4 right-4 z-40 flex items-center justify-center w-9 h-9 rounded-full bg-background/90 backdrop-blur border border-black/10 dark:border-white/15 shadow-lg text-black/60 dark:text-white/60 hover:opacity-90"
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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">About AtomicSketches</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
      )}
    </>
  );
}
