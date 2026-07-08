"use client";

import { useState } from "react";
import type { Theme } from "@/lib/cells";

export default function FilterBar({
  themes,
  onlyMine,
  onOnlyMineChange,
  themeId,
  onThemeIdChange,
  canFilterMine,
  active,
  onClear,
}: {
  themes: Theme[];
  onlyMine: boolean;
  onOnlyMineChange: (value: boolean) => void;
  themeId: number | null;
  onThemeIdChange: (value: number | null) => void;
  canFilterMine: boolean;
  active: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed top-4 left-4 z-40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filter gallery"
        className={`flex items-center gap-2 h-10 px-3 rounded-full backdrop-blur border text-sm font-medium ${
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
          className="w-4 h-4"
        >
          <path d="M4 5h16" />
          <path d="M7 12h10" />
          <path d="M10 19h4" />
        </svg>
        {active ? "Filtered" : "Filter"}
      </button>

      {open && (
        <div className="mt-2 w-64 rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-4 flex flex-col gap-3">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>My sketches only</span>
            <input
              type="checkbox"
              checked={onlyMine}
              disabled={!canFilterMine}
              onChange={(e) => onOnlyMineChange(e.target.checked)}
              className="w-4 h-4 disabled:opacity-40"
            />
          </label>
          {!canFilterMine && (
            <p className="-mt-2 text-xs text-black/45 dark:text-white/45">Sign in to filter your own sketches.</p>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/60 dark:text-white/60">Theme</span>
            <select
              value={themeId ?? ""}
              onChange={(e) => onThemeIdChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
            >
              <option value="">All themes</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>

          {active && (
            <button
              type="button"
              onClick={onClear}
              className="text-sm text-black/50 dark:text-white/50 hover:opacity-70 self-start"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
