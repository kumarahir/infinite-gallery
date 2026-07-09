"use client";

import { useState } from "react";
import type { Theme } from "@/lib/cells";

// Icon-only, meant to sit inline in the main controls row alongside
// recenter/joystick/about — the theme panel opens upward above it, same
// convention as the minimap opening above the joystick.
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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

      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 w-56 rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-4 flex flex-col gap-3"
          style={{ bottom: "calc(100% + 12px)" }}
        >
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
              onClick={() => onThemeIdChange(null)}
              className="text-sm text-black/50 dark:text-white/50 hover:opacity-70 self-start"
            >
              Clear theme
            </button>
          )}
        </div>
      )}
    </div>
  );
}
