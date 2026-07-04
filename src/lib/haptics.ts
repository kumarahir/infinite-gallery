// Thin wrapper around the Vibration API — feature-detected since support is
// inconsistent (notably: iOS Safari has never implemented it, on any
// version, so this silently no-ops there and only produces feedback on
// Android Chrome/Firefox and similar).
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
