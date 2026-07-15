import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/components/ProfileForm";
import type { Profile } from "@/lib/profiles";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { count: imageCount } = await supabase
    .from("cells")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .eq("cell_type", "image");

  // current_streak/last_upload_date are only written to when the user
  // uploads, so a streak that's gone quiet doesn't visibly "break" until
  // read time — treat it as broken here if they haven't uploaded today or
  // yesterday, rather than showing a stale count that no longer reflects
  // an unbroken run of days.
  const typedProfile = profile as Profile | null;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const daysSinceUpload = typedProfile?.last_upload_date
    ? Math.round(
        (today.getTime() - new Date(typedProfile.last_upload_date + "T00:00:00Z").getTime()) /
          86_400_000
      )
    : null;
  const streakActive = daysSinceUpload !== null && daysSinceUpload <= 1;
  const currentStreak = streakActive ? typedProfile?.current_streak ?? 0 : 0;
  const longestStreak = typedProfile?.longest_streak ?? 0;

  return (
    <div className="min-h-dvh p-6 max-w-lg mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your profile</h1>
        <Link href="/" className="text-sm underline text-black/60 dark:text-white/60">
          Back to gallery
        </Link>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-900/40 dark:to-pink-900/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 text-center">
        <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">
          🎉 {imageCount ?? 0}
        </p>
        <p className="text-xs font-medium text-amber-700/80 dark:text-amber-300/80 mt-0.5">
          AtomicSketches uploaded by you
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold">
            {currentStreak > 0 ? `🔥 ${currentStreak}` : "—"}
          </p>
          <p className="text-xs font-medium text-black/50 dark:text-white/50 mt-0.5">
            {currentStreak > 0
              ? `day streak`
              : daysSinceUpload != null
                ? "streak ended"
                : "no streak yet"}
          </p>
        </div>
        <div className="rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-2xl font-bold">🏆 {longestStreak}</p>
          <p className="text-xs font-medium text-black/50 dark:text-white/50 mt-0.5">
            longest streak
          </p>
        </div>
      </div>

      <ProfileForm initialProfile={profile as Profile | null} />
    </div>
  );
}
