"use client";

// Same icon-button convention as MineToggleButton/GalleryModeToggle — one
// more control in the same row, not a visually distinct concept. Switches
// the whole gallery from the pannable infinite canvas to a plain
// vertical-scrolling 2-column grid (see GalleryGridView).
export default function GridViewToggle({
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
      aria-label={active ? "Switch to canvas view" : "Switch to grid view"}
      aria-pressed={active}
      title={active ? "Canvas view" : "Grid view"}
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
        {active ? (
          <>
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
          </>
        ) : (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </>
        )}
      </svg>
    </button>
  );
}
