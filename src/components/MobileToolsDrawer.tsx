// Bottom sheet holding secondary mobile controls (filter, "mine" toggle,
// thumbnail size) — kept out of the main joystick/recenter row so that row
// stays small and reachable with one thumb. Positioned a fixed distance
// above that row (bottom-28) and slid further down by a fixed amount when
// closed (rather than a percentage transform, which would depend on this
// drawer's own content height) so it's reliably off-screen either way.
export default function MobileToolsDrawer({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed bottom-32 inset-x-0 z-30 flex justify-center transition-transform duration-300 ease-out ${
        open ? "translate-y-0" : "translate-y-64"
      }`}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-background/95 backdrop-blur border border-black/10 dark:border-white/15 shadow-lg px-4 py-3">
        {children}
      </div>
    </div>
  );
}
