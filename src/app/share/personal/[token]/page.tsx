import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/cells";
import { buildPromptMaps, titleForSketch } from "@/lib/sketchTitle";
import ShareGalleryView, { type ShareSketch } from "@/components/ShareGalleryView";
import type { PublicProfile } from "@/lib/profiles";

interface PersonalSharePageParams {
  token: string;
}

// Matches get_shareable_personal_sketches' return shape — see schema.sql
// for why every cell.* field can be null (a valid token for a theme with
// no sketches yet still returns one row, via a left join, so this page can
// tell that apart from "the token itself doesn't resolve").
interface ShareableRow {
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

// Inlines its own Supabase queries with the server client (not the
// personalShares.ts helpers, which wrap the browser client for
// InfiniteGrid's client-side use) — same convention the community share
// page and /profile already follow for server components.
async function fetchPersonalShareRows(token: string): Promise<ShareableRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shareable_personal_sketches", {
    p_share_token: token,
  });
  if (error) throw error;
  return (data ?? []) as ShareableRow[];
}

async function fetchHeaderData(ownerId: string, themeId: number) {
  const supabase = await createClient();
  const [{ data: profile }, { data: theme }] = await Promise.all([
    supabase.rpc("get_public_profile", { p_user_id: ownerId }).maybeSingle(),
    supabase.from("themes").select("name").eq("id", themeId).maybeSingle(),
  ]);
  return { profile: profile as PublicProfile | null, theme: theme as { name: string } | null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PersonalSharePageParams>;
}): Promise<Metadata> {
  const { token } = await params;
  const rows = await fetchPersonalShareRows(token).catch(() => []);
  if (rows.length === 0) return { title: "Infinite Gallery" };

  const { profile, theme } = await fetchHeaderData(rows[0].owner_id, rows[0].theme_id);
  if (!profile || !theme) return { title: "Infinite Gallery" };

  const name = profile.display_name || "A sketcher";
  return {
    title: `${name}'s ${theme.name} sketches — Infinite Gallery`,
    description: `See every sketch ${name} has made for ${theme.name} on Infinite Gallery.`,
  };
}

export default async function PersonalSharePage({
  params,
}: {
  params: Promise<PersonalSharePageParams>;
}) {
  const { token } = await params;
  const rows = await fetchPersonalShareRows(token);
  if (rows.length === 0) notFound();

  const { owner_id: ownerId, theme_id: themeId } = rows[0];
  const supabase = await createClient();
  const [{ profile, theme }, { count: totalSketches }, { data: promptRows }] = await Promise.all([
    fetchHeaderData(ownerId, themeId),
    // Community-only, matching the community share page's stat — this is
    // describing the owner's overall community footprint, unaffected by
    // which personal theme is being shared here.
    supabase
      .from("cells")
      .select("id", { count: "exact", head: true })
      .eq("created_by", ownerId)
      .eq("cell_type", "image")
      .is("personal_owner_id", null),
    supabase.from("theme_prompts").select("id, day_of_month, prompt_text").eq("theme_id", themeId),
  ]);
  if (!profile || !theme) notFound();

  const promptMaps = buildPromptMaps(promptRows ?? []);

  // row.id is only null for the placeholder "valid token, nothing uploaded
  // yet" row the RPC's left join produces — filtered out here, and the
  // empty-sketches state below (via ShareGalleryView) covers that case.
  const sketches: ShareSketch[] = rows
    .filter((row) => row.id != null && row.created_at != null)
    .map((row) => ({
      id: row.id as number,
      imageUrl: getPublicImageUrl(row.thumbnail_path ?? row.image_path ?? ""),
      width: row.image_width,
      height: row.image_height,
      title: titleForSketch(
        { created_at: row.created_at as string, theme_prompt_id: row.theme_prompt_id },
        promptMaps
      ),
      // Personal-origin cells can never have cell_reactions rows (see the
      // RLS split in schema.sql's v3.0 section) — ShareGalleryView doesn't
      // show a reaction picker for this page at all (allowReactions=false),
      // so this is just satisfying the shared ShareSketch shape.
      reaction: null,
    }));

  return (
    <ShareGalleryView
      avatarSeed={ownerId}
      name={profile.display_name || "A sketcher"}
      profile={profile}
      totalSketches={totalSketches ?? 0}
      themeName={theme.name}
      sketches={sketches}
      viewerUser={null}
      allowReactions={false}
    />
  );
}
