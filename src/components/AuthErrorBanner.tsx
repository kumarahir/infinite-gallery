"use client";

import { useEffect, useState } from "react";

const FRIENDLY_MESSAGES: Record<string, string> = {
  otp_expired:
    "That sign-in link was already used or expired before you clicked it. This often happens with corporate email (security scanners open links automatically). Try again, or use a personal email / Google sign-in instead.",
  account_suspended:
    "Your account has been suspended. Contact the site admin if you think this is a mistake.",
};

export default function AuthErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("auth_error");
    if (!raw) return;
    setMessage(FRIENDLY_MESSAGES[raw] ?? raw);
    params.delete("auth_error");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `?${next}` : window.location.pathname);
  }, []);

  if (!message) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 text-sm px-4 py-3 shadow-lg flex items-start gap-3">
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setMessage(null)}
        aria-label="Dismiss"
        className="text-red-400 hover:text-red-600 dark:hover:text-red-100"
      >
        ×
      </button>
    </div>
  );
}
