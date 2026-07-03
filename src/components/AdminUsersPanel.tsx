"use client";

import { useEffect, useState } from "react";
import { fetchAdminEmails, fetchProfiles, updateProfilePermissions, type Profile } from "@/lib/profiles";

export default function AdminUsersPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminEmails, setAdminEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchProfiles(), fetchAdminEmails()])
      .then(([p, emails]) => {
        setProfiles(p);
        setAdminEmails(emails);
      })
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (profile: Profile, key: "can_login" | "can_upload") => {
    const nextValue = !profile[key];
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, [key]: nextValue } : p))
    );
    setError(null);
    try {
      await updateProfilePermissions(profile.id, { [key]: nextValue });
    } catch {
      // Roll back on failure.
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, [key]: !nextValue } : p))
      );
      setError("Failed to update permission.");
    }
  };

  if (loading) return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <ul className="flex flex-col gap-2">
        {profiles.map((profile) => {
          const isAdminAccount = adminEmails.has(profile.email.toLowerCase());
          return (
            <li
              key={profile.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-black/10 dark:border-white/15 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">
                  {profile.display_name || profile.email}
                  {isAdminAccount && (
                    <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                      (admin)
                    </span>
                  )}
                </p>
                <p className="text-xs text-black/50 dark:text-white/50 truncate">{profile.email}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={profile.can_login}
                    onChange={() => toggle(profile, "can_login")}
                  />
                  Can log in
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={profile.can_upload}
                    onChange={() => toggle(profile, "can_upload")}
                  />
                  Can upload
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
