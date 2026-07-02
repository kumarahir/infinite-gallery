"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useIsAdmin(user: User | null): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user?.email) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    // RLS restricts this table to each user's own row (case-insensitive
    // email match), so an unfiltered select only ever returns 0 or 1 rows.
    supabase
      .from("admins")
      .select("email")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  return isAdmin;
}
