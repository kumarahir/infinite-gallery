import Link from "next/link";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import DefaultAvatar from "./DefaultAvatar";
import SocialLinks from "./SocialLinks";
import ReactionPicker from "./ReactionPicker";
import type { PublicProfile } from "@/lib/profiles";

export interface ShareSketch {
  id: number;
  imageUrl: string;
  width: number | null;
  height: number | null;
  title: string;
  reaction: { emoji: string; total: number } | null;
}

// Shared rendering for both /share/[userId]/[themeId] (community) and
// /share/personal/[token] (personal) — the two routes differ only in how
// they fetch this same shape (direct public-RLS queries vs. the
// get_shareable_personal_sketches RPC), not in how it's displayed.
// Reactions only ever show for community-origin sketches — the caller
// simply doesn't build a `reaction`/ReactionPicker-eligible sketch for a
// personal one, since personal cells can never have cell_reactions rows
// (see the RLS split in schema.sql's v3.0 section).
export default function ShareGalleryView({
  avatarSeed,
  name,
  profile,
  totalSketches,
  themeName,
  sketches,
  viewerUser,
  allowReactions,
}: {
  avatarSeed: string;
  name: string;
  profile: PublicProfile;
  totalSketches: number;
  themeName: string;
  sketches: ShareSketch[];
  viewerUser: User | null;
  allowReactions: boolean;
}) {
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
        <DefaultAvatar seed={avatarSeed} size={48} />
        <div className="flex flex-col min-w-0">
          <p className="text-2xl font-bold truncate">{name}</p>
          <SocialLinks profile={profile} />
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-900/40 dark:to-pink-900/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 text-center">
        <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">🎉 {totalSketches}</p>
        <p className="text-xs font-medium text-amber-700/80 dark:text-amber-300/80 mt-0.5">
          sketches shared so far, across all themes
        </p>
      </div>

      <h3 className="text-lg font-semibold">{themeName}</h3>

      {sketches.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">No sketches in this theme yet.</p>
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
              {allowReactions && viewerUser ? (
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
