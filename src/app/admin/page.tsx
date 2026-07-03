import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminThemesPanel from "@/components/AdminThemesPanel";
import AdminUsersPanel from "@/components/AdminUsersPanel";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: adminRow } = await supabase.from("admins").select("email").maybeSingle();
  if (!adminRow) redirect("/");

  return (
    <div className="min-h-dvh p-6 max-w-lg mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <Link href="/" className="text-sm underline text-black/60 dark:text-white/60">
          Back to gallery
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Themes</h2>
        <AdminThemesPanel />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Users</h2>
        <AdminUsersPanel />
      </div>
    </div>
  );
}
