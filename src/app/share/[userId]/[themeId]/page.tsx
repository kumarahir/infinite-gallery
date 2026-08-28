import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/cells";
import { reactionSummaryFromCounts, type Emotion, type ReactionCounts } from "@/lib/reactions";
import { buildPromptMaps, titleForSketch } from "@/lib/sketchTitle";
import ShareGalleryView, { type ShareSketch } from "@/components/ShareGalleryView";
import type { PublicProfile } from "@/lib/profiles";

interface SharePageParams {
  userId: string;
  themeId: string;
}

async function fetchHeaderData(userId: string, themeId: number) {
  const supabase = await createClient();
  const [{ data: profile }, { data: theme }] = await Promise.all([
    supabase.rpc("get_public_profile", { p_user_id: userId }).maybeSingle(),
    supabase.from("themes").select("name").eq("id", themeId).maybeSingle(),
  ]);
  return { profile: profile as PublicProfile | null, theme: theme as { name: string } | null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<SharePageParams>;
}): Promise<Metadata> {
  const { userId, themeId } = await params;
  const { profile, theme } = await fetchHeaderData(userId, Number(themeId));
  if (!profile || !theme) return { title: "Infinite Gallery" };

  const name = profile.display_name || "A sketcher";
  return {
    title: `${name}'s ${theme.name} sketches — Infinite Gallery`,
    description: `See every sketch ${name} has made for ${theme.name} on Infinite Gallery.`,
  };
}

function emptyCounts(): ReactionCounts {
  return { inspired: 0, proud: 0, joyful: 0, confident: 0, loved: 0 };
}

export default async function SharePage({
  params,
}: {
  params: Promise<SharePageParams>;
}) {
  const { userId, themeId: themeIdParam } = await params;
  const themeId = Number(themeIdParam);
  if (!Number.isFinite(themeId)) notFound();

  const supabase = await createClient();
  const { profile, theme } = await fetchHeaderData(userId, themeId);
  if (!profile || !theme) notFound();

  // Whoever has this link open and is currently logged in can react to
  // these sketches right here — same cell_reactions table the rest of the
  // app reads/writes, so it shows up in the grid badge, ViewCellModal, and
  // the collage highlight exactly like any other reaction would.
  const [
    {
      data: { user: viewerUser },
    },
    { count: totalSketches },
    { data: cellRows },
    { data: promptRows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("cells")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .eq("cell_type", "image")
      .is("personal_owner_id", null),
    supabase
      .from("cells")
      .select(
        "id, image_path, thumbnail_path, image_width, image_height, created_at, theme_prompt_id"
      )
      .eq("created_by", userId)
      .eq("theme_id", themeId)
      .eq("cell_type", "image")
      // Without this, an owner viewing their own share link while signed in
      // would also see their own personal-plane sketches for this theme
      // mixed in — RLS lets them see those (they're the owner), but this
      // page is specifically the community view.
      .is("personal_owner_id", null)
      .order("created_at", { ascending: true }),
    supabase.from("theme_prompts").select("id, day_of_month, prompt_text").eq("theme_id", themeId),
  ]);

  const promptMaps = buildPromptMaps(promptRows ?? []);

  const cells = cellRows ?? [];
  const cellIds = cells.map((c) => c.id);

  const reactionCounts = new Map<number, ReactionCounts>();
  if (cellIds.length > 0) {
    const { data: reactionRows } = await supabase
      .from("cell_reactions")
      .select("cell_id, emotion")
      .in("cell_id", cellIds);
    for (const row of reactionRows ?? []) {
      const counts = reactionCounts.get(row.cell_id) ?? emptyCounts();
      const emotion = row.emotion as Emotion;
      counts[emotion] = (counts[emotion] ?? 0) + 1;
      reactionCounts.set(row.cell_id, counts);
    }
  }

  const sketches: ShareSketch[] = cells.map((cell) => {
    const counts = reactionCounts.get(cell.id);
    return {
      id: cell.id,
      imageUrl: getPublicImageUrl(cell.thumbnail_path ?? cell.image_path ?? ""),
      width: cell.image_width,
      height: cell.image_height,
      title: titleForSketch(cell, promptMaps),
      reaction: counts ? reactionSummaryFromCounts(counts) : null,
    };
  });

  return (
    <ShareGalleryView
      avatarSeed={userId}
      name={profile.display_name || "A sketcher"}
      profile={profile}
      totalSketches={totalSketches ?? 0}
      themeName={theme.name}
      sketches={sketches}
      viewerUser={viewerUser}
      allowReactions
    />
  );
}
