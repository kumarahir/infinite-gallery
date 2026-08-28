"use client";

export type GalleryMode = "community" | "personal";

// Same icon-button convention as MineToggleButton/FilterBar (40x40, blue
// when the non-default state is active) rather than a new segmented-pill
// style, so it reads as one more control in the same row instead of a
// visually distinct concept.
export default function GalleryModeToggle({
  mode,
  onToggle,
}: {
  mode: GalleryMode;
  onToggle: () => void;
}) {
  const active = mode === "personal";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={active ? "Switch to community gallery" : "Switch to your personal gallery"}
      aria-pressed={active}
      title={active ? "Personal gallery" : "Community gallery"}
      className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur border ${
        active
          ? "bg-blue-500 border-blue-500 text-white"
          : "bg-black/20 dark:bg-white/10 border-black/10 dark:border-white/20 text-black/70 dark:text-white/80"
      }`}
    >
      {active ? (
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
          <rect x="3" y="11" width="18" height="10" rx="1" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ) : (
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
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )}
    </button>
  );
}
