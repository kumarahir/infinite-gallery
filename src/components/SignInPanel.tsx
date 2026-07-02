"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInPanel({ title = "Sign in" }: { title?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  const signInWithGoogle = () => {
    const supabase = createClient();
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{title}</p>
      <button
        type="button"
        onClick={signInWithGoogle}
        className="rounded-lg border border-black/10 dark:border-white/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
      >
        Continue with Google
      </button>
      <div className="flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
        <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
        or
        <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
      </div>
      {status === "sent" ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-2">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-lg bg-foreground text-background text-sm font-medium px-3 py-2 disabled:opacity-40 hover:opacity-90"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {status === "error" && (
            <p className="text-xs text-red-500">Something went wrong. Try again.</p>
          )}
        </form>
      )}
    </div>
  );
}
