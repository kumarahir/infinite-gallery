"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  clearMyReaction,
  fetchMyReaction,
  fetchReactionCounts,
  reactionSummaryFromCounts,
  setMyReaction,
  EMOTIONS,
  type Emotion,
  type ReactionCounts,
  type ReactionSummary,
} from "@/lib/reactions";

// Self-contained: fetches its own counts and the viewer's existing reaction
// on mount, so the same picker drops into any context — the view modal, the
// public share page — with just a cell id and the viewer's user.
export default function ReactionPicker({
  cellId,
  user,
  onReactionChange,
}: {
  cellId: number;
  user: User | null;
  // Lets a parent (e.g. the grid) update this cell's badge immediately
  // instead of waiting for the next full page load's bulk fetch to catch up.
  onReactionChange?: (cellId: number, summary: ReactionSummary | null) => void;
}) {
  const [reactionCounts, setReactionCounts] = useState<ReactionCounts | null>(null);
  const [myReaction, setMyReactionState] = useState<Emotion | null>(null);
  const [reacting, setReacting] = useState(false);

  useEffect(() => {
    fetchReactionCounts(cellId)
      .then(setReactionCounts)
      .catch(() => setReactionCounts(null));
  }, [cellId]);

  useEffect(() => {
    if (!user) {
      setMyReactionState(null);
      return;
    }
    fetchMyReaction(cellId, user.id)
      .then(setMyReactionState)
      .catch(() => setMyReactionState(null));
  }, [cellId, user]);

  // Clicking the currently-picked emotion again removes it. Optimistic —
  // updates local counts immediately rather than waiting on a refetch, since
  // a reaction isn't critical enough to justify a loading state.
  const handleReact = async (emotion: Emotion) => {
    if (!user || reacting) return;
    const isRemoving = myReaction === emotion;
    setReacting(true);
    try {
      if (isRemoving) {
        await clearMyReaction(cellId, user.id);
      } else {
        await setMyReaction(cellId, user.id, emotion);
      }
      const base = reactionCounts ?? { inspired: 0, proud: 0, joyful: 0, confident: 0, loved: 0 };
      const next = { ...base };
      if (myReaction) next[myReaction] = Math.max(0, next[myReaction] - 1);
      if (!isRemoving) next[emotion] = next[emotion] + 1;
      setReactionCounts(next);
      setMyReactionState(isRemoving ? null : emotion);
      onReactionChange?.(cellId, reactionSummaryFromCounts(next));
    } catch {
      // Non-critical — the reaction just silently doesn't register.
    } finally {
      setReacting(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap">
      {EMOTIONS.map(({ emotion, emoji, label }) => {
        const selected = myReaction === emotion;
        const count = reactionCounts?.[emotion] ?? 0;
        return (
          <button
            key={emotion}
            type="button"
            onClick={() => handleReact(emotion)}
            disabled={!user || reacting}
            aria-pressed={selected}
            aria-label={label}
            title={user ? label : "Sign in to react"}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors disabled:opacity-50 disabled:cursor-default ${
              selected
                ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-900/30"
                : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && (
              <span className="text-xs text-black/50 dark:text-white/50">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
