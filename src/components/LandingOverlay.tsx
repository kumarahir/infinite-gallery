"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import {
  fetchFilteredCells,
  fetchLatestImageCellByUsers,
  fetchThemeImageCount,
  getPublicImageUrl,
  type CellRow,
  type Theme,
} from "@/lib/cells";
import { fetchConsistentArtists, fetchMyProfile, type ConsistentArtist } from "@/lib/profiles";
import { fetchPromptForDay, type ThemePrompt } from "@/lib/themePrompts";

function Thumb({ cell, size }: { cell: CellRow; size: number }) {
  const path = cell.thumbnail_path ?? cell.image_path;
  if (!path) return null;
  return (
    <div
      style={{ width: size, height: size }}
      className="shrink-0 rounded-lg overflow-hidden bg-black/5 dark:bg-white/5"
    >
      <Image
        src={getPublicImageUrl(path)}
        alt=""
        width={size}
        height={size}
        unoptimized={!!cell.thumbnail_path}
        sizes={`${size}px`}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

export default function LandingOverlay({
  open,
  onClose,
  user,
  themes,
  onShowMine,
  onExploreTheme,
  onShuffle,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  themes: Theme[];
  onShowMine: () => void;
  onExploreTheme: (themeId: number) => void;
  onShuffle: () => void;
}) {
  const [streak, setStreak] = useState<{ current: number; nudge: string } | null>(null);
  const [themeCells, setThemeCells] = useState<CellRow[]>([]);
  const [themeCount, setThemeCount] = useState<number | null>(null);
  const [artists, setArtists] = useState<ConsistentArtist[]>([]);
  const [artistCells, setArtistCells] = useState<Map<string, CellRow>>(new Map());
  const [todaysPrompt, setTodaysPrompt] = useState<ThemePrompt | null>(null);

  const defaultTheme = themes.find((t) => t.is_default) ?? null;
  // Same UTC-day convention used for upload streaks elsewhere in the app —
  // theme_prompts has no explicit date column, just a day-of-month.
  const dayOfMonth = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getUTCDate();

  useEffect(() => {
    if (!open || !user) return;
    fetchMyProfile(user.id)
      .then((profile) => {
        if (!profile?.last_upload_date) {
          setStreak(null);
          return;
        }
        const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
        const daysSince = Math.round(
          (today.getTime() - new Date(profile.last_upload_date + "T00:00:00Z").getTime()) /
            86_400_000
        );
        const active = daysSince <= 1;
        const current = active ? profile.current_streak : 0;
        if (current <= 0) {
          setStreak(null);
          return;
        }
        setStreak({
          current,
          nudge:
            daysSince === 1
              ? "One sketch today keeps it alive"
              : "Nice work — you're on a roll",
        });
      })
      .catch(() => setStreak(null));
  }, [open, user]);

  useEffect(() => {
    if (!open || !defaultTheme) return;
    fetchFilteredCells({ themeId: defaultTheme.id, limit: 4 })
      .then(setThemeCells)
      .catch(() => setThemeCells([]));
    fetchThemeImageCount(defaultTheme.id)
      .then(setThemeCount)
      .catch(() => setThemeCount(null));
  }, [open, defaultTheme]);

  useEffect(() => {
    if (!open || !defaultTheme) return;
    fetchPromptForDay(defaultTheme.id, dayOfMonth)
      .then(setTodaysPrompt)
      .catch(() => setTodaysPrompt(null));
  }, [open, defaultTheme, dayOfMonth]);

  useEffect(() => {
    if (!open) return;
    fetchConsistentArtists(6)
      .then((rows) => {
        setArtists(rows);
        return fetchLatestImageCellByUsers(rows.map((r) => r.id));
      })
      .then(setArtistCells)
      .catch(() => {
        setArtists([]);
        setArtistCells(new Map());
      });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">Welcome back</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-black/40 dark:text-white/40 hover:opacity-70"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="w-5 h-5"
            >
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {streak && (
          <div className="rounded-lg bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-900/40 dark:to-pink-900/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 flex items-center gap-3">
            <span className="text-2xl leading-none">🔥</span>
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {streak.current} day streak
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">{streak.nudge}</p>
            </div>
          </div>
        )}

        {todaysPrompt && (
          <div className="rounded-lg border border-black/10 dark:border-white/15 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1">
              Day {todaysPrompt.day_of_month}&rsquo;s prompt
            </p>
            <p className="text-sm font-semibold">{todaysPrompt.prompt_text}</p>
            {todaysPrompt.quote && (
              <p className="text-xs italic text-black/60 dark:text-white/60 mt-1">
                &ldquo;{todaysPrompt.quote}&rdquo;
              </p>
            )}
            <div className="flex flex-col gap-0.5 mt-2 text-xs">
              {todaysPrompt.simple_instruction && (
                <p>
                  <span className="font-medium text-green-700 dark:text-green-400">Simple —</span>{" "}
                  {todaysPrompt.simple_instruction}
                </p>
              )}
              {todaysPrompt.medium_instruction && (
                <p>
                  <span className="font-medium text-amber-700 dark:text-amber-400">Medium —</span>{" "}
                  {todaysPrompt.medium_instruction}
                </p>
              )}
              {todaysPrompt.stretch_instruction && (
                <p>
                  <span className="font-medium text-red-700 dark:text-red-400">Stretch —</span>{" "}
                  {todaysPrompt.stretch_instruction}
                </p>
              )}
            </div>
          </div>
        )}

        {defaultTheme && (
          <div className="rounded-lg border border-black/10 dark:border-white/15 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1">
              This month&rsquo;s theme
            </p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{defaultTheme.name}</p>
              {themeCount != null && (
                <span className="text-xs text-black/50 dark:text-white/50">
                  {themeCount} sketch{themeCount === 1 ? "" : "es"}
                </span>
              )}
            </div>
            {themeCells.length > 0 && (
              <div className="flex gap-2 mt-2">
                {themeCells.map((cell) => (
                  <Thumb key={cell.id} cell={cell} size={44} />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => onExploreTheme(defaultTheme.id)}
              className="text-xs font-medium text-green-700 dark:text-green-400 mt-2"
            >
              See what others sketched →
            </button>
          </div>
        )}

        {artists.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40 mb-1.5">
              Sketches from consistent artists
            </p>
            <div className="flex gap-2 overflow-x-auto">
              {artists.map((artist) => {
                const cell = artistCells.get(artist.id);
                if (!cell) return null;
                return (
                  <div key={artist.id} className="relative shrink-0">
                    <Thumb cell={cell} size={52} />
                    <span className="absolute -bottom-1 -right-1 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[10px] font-medium rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                      🔥{artist.current_streak}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {user && (
            <button
              type="button"
              onClick={onShowMine}
              className="flex-1 rounded-lg border border-green-600 dark:border-green-500 bg-stone-50 dark:bg-white/5 text-green-700 dark:text-green-400 text-xs font-medium py-2"
            >
              My sketches
            </button>
          )}
          <button
            type="button"
            onClick={onShuffle}
            className="flex-1 rounded-lg border border-green-600 dark:border-green-500 bg-stone-50 dark:bg-white/5 text-green-700 dark:text-green-400 text-xs font-medium py-2"
          >
            Show random
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2.5"
        >
          Explore
        </button>
      </div>
    </div>
  );
}
