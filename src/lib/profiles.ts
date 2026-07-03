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

export async function fetchAdminEmails(): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("admins").select("email");
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.email.toLowerCase()));
}
