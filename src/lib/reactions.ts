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
// candidate cell rather than one per cell, summed (across all emotions,
// not per-emotion) client-side to rank by total reaction count.
export async function fetchReactionTotalsByCellIds(
  cellIds: number[]
): Promise<Map<number, number>> {
  if (cellIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cell_reactions")
    .select("cell_id")
    .in("cell_id", cellIds);
  if (error) throw error;

  const totals = new Map<number, number>();
  for (const row of data ?? []) {
    totals.set(row.cell_id, (totals.get(row.cell_id) ?? 0) + 1);
  }
  return totals;
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
