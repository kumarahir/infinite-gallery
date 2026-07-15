"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Theme } from "@/lib/cells";

export default function FilterBar({
  themes,
  themeId,
  onThemeIdChange,
}: {
  themes: Theme[];
  themeId: number | null;
  onThemeIdChange: (value: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = themeId != null;

  const select = (id: number | null) => {
    onThemeIdChange(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Filter by theme"
        className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur border ${
          active
            ? "bg-blue-500 border-blue-500 text-white"
            : "bg-black/20 dark:bg-white/10 border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
        }`}
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
          <path d="M4 5h16" />
          <path d="M7 12h10" />
          <path d="M10 19h4" />
        </svg>
      </button>

      {open &&
        createPortal(
          // Rendered via a portal straight into <body> rather than in place —
          // this button can sit inside an ancestor with a CSS transform (the
          // mobile control row uses -translate-x-1/2 to center itself), and a
          // transformed ancestor becomes the containing block for `position:
          // fixed` descendants, which would otherwise position this modal
          // relative to that small row instead of the actual viewport.
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-3 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Filter by theme</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="text-black/40 dark:text-white/40 hover:opacity-70"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => select(null)}
                  className={`text-left rounded-lg px-3 py-2 text-sm font-medium ${
                    themeId == null
                      ? "bg-blue-500 text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  All themes
                </button>
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => select(theme.id)}
                    className={`text-left rounded-lg px-3 py-2 text-sm font-medium ${
                      themeId === theme.id
                        ? "bg-blue-500 text-white"
                        : "hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {theme.name}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
