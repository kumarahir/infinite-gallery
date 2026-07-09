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

      <ProfileForm initialProfile={profile as Profile | null} />
    </div>
  );
}
