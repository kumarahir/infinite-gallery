import { createClient } from "@/lib/supabase/client";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  can_login: boolean;
  can_upload: boolean;
  website_url: string | null;
  instagram_handle: string | null;
  twitter_handle: string | null;
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

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

// Routed through an RPC (not a direct table update) — profiles has no
// general self-update RLS policy, since that would also let a user flip
// their own can_login/can_upload. The RPC is scoped server-side to only
// these three columns.
export async function updateMySocialLinks(links: {
  websiteUrl: string | null;
  instagramHandle: string | null;
  twitterHandle: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("update_my_social_links", {
    p_website_url: links.websiteUrl,
    p_instagram_handle: links.instagramHandle,
    p_twitter_handle: links.twitterHandle,
  });
  if (error) throw error;
}

export interface PublicProfile {
  display_name: string | null;
  website_url: string | null;
  instagram_handle: string | null;
  twitter_handle: string | null;
}

// Routed through an RPC rather than selecting profiles directly — there's
// no public SELECT policy on that table (it would also expose email and
// can_login/can_upload), so this is the only way anyone other than the
// profile's owner or an admin can see even these safe fields.
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("get_public_profile", { p_user_id: userId })
    .maybeSingle();
  if (error) throw error;
  return (data as PublicProfile) ?? null;
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
