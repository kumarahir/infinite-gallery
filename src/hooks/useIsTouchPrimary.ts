"use client";

import { useEffect, useState } from "react";

// True when the device's primary pointing input is touch (phones/tablets),
// false for mouse/trackpad devices — regardless of window width, so
// resizing a desktop browser window never triggers mobile-only behavior.
export function useIsTouchPrimary(): boolean {
  const [isTouchPrimary, setIsTouchPrimary] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouchPrimary(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouchPrimary(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isTouchPrimary;
}
