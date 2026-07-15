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
      className={`grid transition-all duration-300 ease-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden flex items-center gap-3">{children}</div>
    </div>
  );
}
