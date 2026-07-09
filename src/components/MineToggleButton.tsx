"use client";

// One-tap shortcut for the most common filter — no panel, just flips
// straight to (or back from) the current user's own sketches.
export default function MineToggleButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Show only my sketches"
      aria-pressed={active}
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
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    </button>
  );
}
