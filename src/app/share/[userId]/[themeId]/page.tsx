import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/cells";
import { reactionSummaryFromCounts, type Emotion, type ReactionCounts } from "@/lib/reactions";
import DefaultAvatar from "@/components/DefaultAvatar";
import SocialLinks from "@/components/SocialLinks";
import ReactionPicker from "@/components/ReactionPicker";
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

interface ShareSketch {
  id: number;
  imageUrl: string;
  width: number | null;
  height: number | null;
  title: string;
  reaction: { emoji: string; total: number } | null;
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
      .eq("cell_type", "image"),
    supabase
      .from("cells")
      .select("id, image_path, thumbnail_path, image_width, image_height, created_at")
      .eq("created_by", userId)
      .eq("theme_id", themeId)
      .eq("cell_type", "image")
      .order("created_at", { ascending: true }),
    supabase.from("theme_prompts").select("day_of_month, prompt_text").eq("theme_id", themeId),
  ]);

  const promptByDay = new Map<number, string>();
  for (const row of promptRows ?? []) {
    promptByDay.set(row.day_of_month, row.prompt_text);
  }

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
    const dayOfMonth = new Date(cell.created_at).getUTCDate();
    const promptText = promptByDay.get(dayOfMonth);
    const counts = reactionCounts.get(cell.id);
    return {
      id: cell.id,
      imageUrl: getPublicImageUrl(cell.thumbnail_path ?? cell.image_path ?? ""),
      width: cell.image_width,
      height: cell.image_height,
      title: promptText ? `Day ${dayOfMonth} — ${promptText}` : `Day ${dayOfMonth}`,
      reaction: counts ? reactionSummaryFromCounts(counts) : null,
    };
  });

  const name = profile.display_name || "A sketcher";

  return (
    <div className="min-h-dvh p-6 max-w-lg mx-auto flex flex-col gap-6">
      <Link
        href="/"
        aria-label="Back to gallery"
        className="fixed top-4 left-4 z-40 flex items-center justify-center w-9 h-9 rounded-full bg-background/90 backdrop-blur border border-black/10 dark:border-white/15 shadow-lg text-black/60 dark:text-white/60 hover:opacity-90"
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
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>

      <div className="flex items-center gap-3 mt-10">
        <DefaultAvatar seed={userId} size={48} />
        <div className="flex flex-col min-w-0">
          <p className="text-2xl font-bold truncate">{name}</p>
          <SocialLinks profile={profile} />
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-900/40 dark:to-pink-900/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 text-center">
        <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">
          🎉 {totalSketches ?? 0}
        </p>
        <p className="text-xs font-medium text-amber-700/80 dark:text-amber-300/80 mt-0.5">
          sketches shared so far, across all themes
        </p>
      </div>

      <h3 className="text-lg font-semibold">{theme.name}</h3>

      {sketches.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          No sketches in this theme yet.
        </p>
      ) : (
        <div className="relative pl-6 flex flex-col gap-8">
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-black/10 dark:bg-white/15" />
          {sketches.map((sketch) => (
            <div key={sketch.id} className="relative">
              <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
              <p className="text-sm text-black/60 dark:text-white/60 mb-2">{sketch.title}</p>
              <div className="rounded-lg overflow-hidden bg-black/5 dark:bg-white/5">
                <Image
                  src={sketch.imageUrl}
                  alt=""
                  width={sketch.width ?? 400}
                  height={sketch.height ?? 400}
                  className="w-full h-auto object-contain"
                  unoptimized
                />
              </div>
              {viewerUser ? (
                <div className="mt-2">
                  <ReactionPicker cellId={sketch.id} user={viewerUser} />
                </div>
              ) : (
                sketch.reaction && (
                  <p className="text-sm mt-2">
                    {sketch.reaction.emoji} {sketch.reaction.total} reaction
                    {sketch.reaction.total === 1 ? "" : "s"}
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
