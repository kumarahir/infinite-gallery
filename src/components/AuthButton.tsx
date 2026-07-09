"use client";

import { useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import SignInPanel from "./SignInPanel";

export default function AuthButton({ initialUser }: { initialUser: User | null }) {
  const user = useUser(initialUser);
  const isAdmin = useIsAdmin(user);
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
  };

  if (user) {
    return (
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-background/90 backdrop-blur border border-black/10 dark:border-white/15 pl-3 pr-1 py-1 shadow-lg">
        <Link
          href="/profile"
          aria-label="Your profile"
          className="flex items-center justify-center w-7 h-7 rounded-full text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            aria-label="Admin settings"
            className="flex items-center justify-center w-7 h-7 rounded-full text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        )}
        <button
          type="button"
          onClick={signOut}
          className="rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 hover:opacity-90"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-foreground text-background text-sm font-medium px-4 py-2 shadow-lg hover:opacity-90"
        >
          Sign in
        </button>
      ) : (
        <div className="w-64 rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-black/40 dark:text-white/40 hover:opacity-70"
            >
              ×
            </button>
          </div>
          <SignInPanel />
        </div>
      )}
    </div>
  );
}
