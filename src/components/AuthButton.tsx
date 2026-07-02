"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import SignInPanel from "./SignInPanel";

export default function AuthButton({ initialUser }: { initialUser: User | null }) {
  const user = useUser(initialUser);
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
  };

  if (user) {
    return (
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-background/90 backdrop-blur border border-black/10 dark:border-white/15 pl-3 pr-1 py-1 shadow-lg">
        <span className="text-sm truncate max-w-[140px]">{user.email}</span>
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
