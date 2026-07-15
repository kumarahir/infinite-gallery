"use client";

import { useState } from "react";
import { updateMySocialLinks, type Profile } from "@/lib/profiles";

function normalizeHandle(value: string): string | null {
  const trimmed = value.trim().replace(/^@/, "");
  return trimmed || null;
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function ProfileForm({ initialProfile }: { initialProfile: Profile | null }) {
  const [websiteUrl, setWebsiteUrl] = useState(initialProfile?.website_url ?? "");
  const [instagramHandle, setInstagramHandle] = useState(initialProfile?.instagram_handle ?? "");
  const [twitterHandle, setTwitterHandle] = useState(initialProfile?.twitter_handle ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateMySocialLinks({
        websiteUrl: normalizeUrl(websiteUrl),
        instagramHandle: normalizeHandle(instagramHandle),
        twitterHandle: normalizeHandle(twitterHandle),
      });
      setSaved(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
          Social &amp; website links
        </h2>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-black/60 dark:text-white/60">Website</span>
          <input
            type="text"
            value={websiteUrl}
            onChange={(e) => {
              setWebsiteUrl(e.target.value);
              setSaved(false);
            }}
            placeholder="yourwebsite.com"
            className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-black/60 dark:text-white/60">Instagram handle</span>
          <div className="flex items-center rounded-lg border border-black/10 dark:border-white/15 focus-within:border-black/30 dark:focus-within:border-white/40">
            <span className="pl-3 text-sm text-black/40 dark:text-white/40">@</span>
            <input
              type="text"
              value={instagramHandle}
              onChange={(e) => {
                setInstagramHandle(e.target.value);
                setSaved(false);
              }}
              placeholder="yourhandle"
              className="w-full bg-transparent px-2 py-2 text-sm outline-none"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-black/60 dark:text-white/60">X / Twitter handle</span>
          <div className="flex items-center rounded-lg border border-black/10 dark:border-white/15 focus-within:border-black/30 dark:focus-within:border-white/40">
            <span className="pl-3 text-sm text-black/40 dark:text-white/40">@</span>
            <input
              type="text"
              value={twitterHandle}
              onChange={(e) => {
                setTwitterHandle(e.target.value);
                setSaved(false);
              }}
              placeholder="yourhandle"
              className="w-full bg-transparent px-2 py-2 text-sm outline-none"
            />
          </div>
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="self-start rounded-lg bg-foreground text-background text-sm font-medium px-4 py-2 disabled:opacity-40 hover:opacity-90"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
