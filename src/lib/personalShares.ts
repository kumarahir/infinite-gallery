import { createClient } from "@/lib/supabase/client";

// Backs the "Share sketches page" action when in personal-gallery mode —
// same token if this theme already has one, otherwise a fresh one. See
// get_or_create_personal_share / get_shareable_personal_sketches in
// schema.sql for why this is a random token rather than the raw
// (userId, themeId) pair the community share URL uses (revocability and
// avoiding theme-id enumeration).
export async function getOrCreatePersonalShareToken(themeId: number): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_or_create_personal_share", {
    p_theme_id: themeId,
  });
  if (error) throw error;
  return data as string;
}

// One row per matching sketch, EXCEPT: a valid token for a theme with zero
// sketches so far still returns exactly one row with every cell.* field
// null (owner_id/theme_id are always present) — see
// get_shareable_personal_sketches in schema.sql for why (distinguishing
// "invalid token" from "nothing uploaded yet" requires a left join). An
// empty array from this function means the token itself doesn't resolve.
export interface ShareablePersonalSketch {
  id: number | null;
  image_path: string | null;
  thumbnail_path: string | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string | null;
  theme_prompt_id: number | null;
  owner_id: string;
  theme_id: number;
}

// Public-facing read backing /share/personal/[token] — resolves a share
// token to its sketch list via a security-definer RPC, since personal
// cells aren't selectable through normal table RLS by anyone but their
// owner.
export async function fetchShareablePersonalSketches(
  shareToken: string
): Promise<ShareablePersonalSketch[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_shareable_personal_sketches", {
    p_share_token: shareToken,
  });
  if (error) throw error;
  return (data ?? []) as ShareablePersonalSketch[];
}
