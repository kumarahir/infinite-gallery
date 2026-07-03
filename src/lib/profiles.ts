import { createClient } from "@/lib/supabase/client";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  can_login: boolean;
  can_upload: boolean;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function updateProfilePermissions(
  id: string,
  updates: { can_login?: boolean; can_upload?: boolean }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("profiles").update(updates).eq("id", id);
  if (error) throw error;
}

// Defaults to true if no profile row is found (e.g. before the profiles
// migration/trigger has run) so this never blocks uploads that used to work.
export async function fetchCanUpload(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("can_upload")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.can_upload ?? true;
}

export async function fetchAdminEmails(): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("admins").select("email");
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.email.toLowerCase()));
}

// Doesn't touch any existing cells — the daily image limit counts cells
// created since whichever is later, start of today or this timestamp, so
// setting it to now() effectively zeroes the user's count for today.
export async function resetUploadLimit(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ upload_limit_reset_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
