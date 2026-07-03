"use client";

import { useState } from "react";
import { useIsTouchPrimary } from "@/hooks/useIsTouchPrimary";
import AboutModal from "./AboutModal";

// Desktop-only trigger (bottom-right). On mobile, the same modal is opened
// from the info button in InfiniteGrid's joystick/recenter control row
// instead, so this renders nothing there.
export default function AboutButton() {
  const [open, setOpen] = useState(false);
  const isTouchPrimary = useIsTouchPrimary();

  if (isTouchPrimary) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About this gallery"
        className="fixed bottom-4 right-4 z-40 flex items-center justify-center w-9 h-9 rounded-full bg-background/90 backdrop-blur border border-black/10 dark:border-white/15 shadow-lg text-black/60 dark:text-white/60 hover:opacity-90"
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
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      <AboutModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
