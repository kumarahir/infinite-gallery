// Secondary mobile controls (filter, "mine" toggle, thumbnail size, about) —
// rendered as a second row directly below the main joystick/recenter row
// (both are stacked by the caller inside one fixed bottom-anchored flex
// column), animated open/closed via the CSS grid-rows fr trick so it grows
// from 0 to its natural content height without needing to know that height
// up front.
export default function MobileToolsDrawer({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid w-screen transition-all duration-300 ease-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      {/* The icon buttons rendered here use dark: variants designed for a
          dark backdrop (matching wherever else they're used, directly on
          the gallery) — pairing the off-white light-mode background with a
          dark counterpart here keeps those variants legible instead of
          going light-icon-on-light-background in dark mode. */}
      <div className="overflow-hidden flex items-center justify-center gap-3 bg-neutral-100/95 dark:bg-neutral-800/95 backdrop-blur-sm py-3">
        {children}
      </div>
    </div>
  );
}
