"use client";

import { useEffect, useState } from "react";
import {
  fetchAdminEmails,
  fetchProfiles,
  resetUploadLimit,
  updateProfilePermissions,
  type Profile,
} from "@/lib/profiles";
import { fetchUploadCountsByUser, type UploadCounts } from "@/lib/cells";

export default function AdminUsersPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminEmails, setAdminEmails] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Map<string, UploadCounts>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [justReset, setJustReset] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchProfiles(), fetchAdminEmails(), fetchUploadCountsByUser()])
      .then(([p, emails, uploadCounts]) => {
        setProfiles(p);
        setAdminEmails(emails);
        setCounts(uploadCounts);
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

  const handleReset = async (profile: Profile) => {
    setResetId(profile.id);
    setError(null);
    try {
      await resetUploadLimit(profile.id);
      setJustReset(profile.id);
      setTimeout(() => setJustReset((id) => (id === profile.id ? null : id)), 2000);
    } catch {
      setError("Failed to reset upload limit.");
    } finally {
      setResetId(null);
    }
  };

  if (loading) return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <ul className="flex flex-col gap-2">
        {profiles.map((profile) => {
          const isAdminAccount = adminEmails.has(profile.email.toLowerCase());
          const userCounts = counts.get(profile.id) ?? { images: 0, text: 0 };
          return (
            <li
              key={profile.id}
              className="flex flex-col gap-2 rounded-lg border border-black/10 dark:border-white/15 px-3 py-2"
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
                <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">
                  {userCounts.images} image{userCounts.images === 1 ? "" : "s"} ·{" "}
                  {userCounts.text} text{userCounts.text === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
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
                {!isAdminAccount && (
                  <button
                    type="button"
                    onClick={() => handleReset(profile)}
                    disabled={resetId === profile.id}
                    className="ml-auto text-xs font-medium text-black/60 dark:text-white/60 underline hover:opacity-70 disabled:opacity-40"
                  >
                    {justReset === profile.id
                      ? "Reset!"
                      : resetId === profile.id
                        ? "Resetting…"
                        : "Reset daily limit"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
