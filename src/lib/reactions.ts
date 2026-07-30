import { createClient } from "@/lib/supabase/client";

export type Emotion = "inspired" | "proud" | "joyful" | "confident" | "loved";

// Fixed, deliberately positive/uplifting set — mirrored server-side by the
// check constraint on cell_reactions.emotion in schema.sql.
export const EMOTIONS: { emotion: Emotion; emoji: string; label: string }[] = [
  { emotion: "inspired", emoji: "🤩", label: "Inspired" },
  { emotion: "proud", emoji: "🙌", label: "Proud" },
  { emotion: "joyful", emoji: "😊", label: "Joyful" },
  { emotion: "confident", emoji: "💪", label: "Confident" },
  { emotion: "loved", emoji: "❤️", label: "Loved it" },
];

export type ReactionCounts = Record<Emotion, number>;

function emptyCounts(): ReactionCounts {
  return { inspired: 0, proud: 0, joyful: 0, confident: 0, loved: 0 };
}

export function totalReactionCount(counts: ReactionCounts): number {
  return EMOTIONS.reduce((sum, { emotion }) => sum + counts[emotion], 0);
}

export async function fetchReactionCounts(cellId: number): Promise<ReactionCounts> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cell_reactions")
    .select("emotion")
    .eq("cell_id", cellId);
  if (error) throw error;

  const counts = emptyCounts();
  for (const row of data ?? []) {
    const emotion = row.emotion as Emotion;
    counts[emotion] = (counts[emotion] ?? 0) + 1;
  }
  return counts;
}

// Backs the collage's "most reactions" highlight — one query for every
// candidate cell rather than one per cell, aggregated per-emotion
// client-side. Ranking uses totalReactionCount(); the full breakdown is
// also what gets printed under each highlighted sketch.
export async function fetchReactionBreakdownByCellIds(
  cellIds: number[]
): Promise<Map<number, ReactionCounts>> {
  if (cellIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cell_reactions")
    .select("cell_id, emotion")
    .in("cell_id", cellIds);
  if (error) throw error;

  const breakdown = new Map<number, ReactionCounts>();
  for (const row of data ?? []) {
    const emotion = row.emotion as Emotion;
    const counts = breakdown.get(row.cell_id) ?? emptyCounts();
    counts[emotion] = (counts[emotion] ?? 0) + 1;
    breakdown.set(row.cell_id, counts);
  }
  return breakdown;
}

export interface ReactionSummary {
  emoji: string;
  total: number;
}

// Backs the grid's per-cell reaction badges — fetches every reaction row
// once (same full-fetch approach as fetchAllImageCoords in cells.ts; this
// app's scale doesn't yet need per-chunk pagination) and reduces each
// cell down to just its dominant emotion's emoji plus a total count, since
// a grid thumbnail only has room for one compact badge, not a full
// breakdown like the collage's highlight row shows.
export async function fetchAllReactionSummaries(): Promise<Map<number, ReactionSummary>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("cell_reactions").select("cell_id, emotion");
  if (error) throw error;

  const perCell = new Map<number, ReactionCounts>();
  for (const row of data ?? []) {
    const emotion = row.emotion as Emotion;
    const counts = perCell.get(row.cell_id) ?? emptyCounts();
    counts[emotion] = (counts[emotion] ?? 0) + 1;
    perCell.set(row.cell_id, counts);
  }

  const summaries = new Map<number, ReactionSummary>();
  for (const [cellId, counts] of perCell) {
    const top = EMOTIONS.reduce((best, cur) =>
      counts[cur.emotion] > counts[best.emotion] ? cur : best
    );
    summaries.set(cellId, { emoji: top.emoji, total: totalReactionCount(counts) });
  }
  return summaries;
}

export async function fetchMyReaction(cellId: number, userId: string): Promise<Emotion | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cell_reactions")
    .select("emotion")
    .eq("cell_id", cellId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.emotion as Emotion) ?? null;
}

// One row per (cell, user) — picking a different emotion overwrites the
// previous pick rather than adding a second reaction.
export async function setMyReaction(
  cellId: number,
  userId: string,
  emotion: Emotion
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cell_reactions")
    .upsert({ cell_id: cellId, user_id: userId, emotion }, { onConflict: "cell_id,user_id" });
  if (error) throw error;
}

// Clicking an already-selected emotion again removes it — lets someone
// un-react instead of being stuck with a pick.
export async function clearMyReaction(cellId: number, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cell_reactions")
    .delete()
    .eq("cell_id", cellId)
    .eq("user_id", userId);
  if (error) throw error;
}
