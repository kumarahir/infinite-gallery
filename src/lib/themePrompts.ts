import { createClient } from "@/lib/supabase/client";

export interface ThemePrompt {
  id: number;
  theme_id: number;
  day_of_month: number;
  prompt_text: string;
  quote: string | null;
  simple_instruction: string | null;
  medium_instruction: string | null;
  stretch_instruction: string | null;
}

export interface ParsedThemePrompt {
  day_of_month: number;
  prompt_text: string;
  quote: string | null;
  simple_instruction: string | null;
  medium_instruction: string | null;
  stretch_instruction: string | null;
}

const DAY_LINE = /^day\s+(\d+)\s*-\s*(.+)$/i;
const SIMPLE_LINE = /^simple\s*-\s*(.+)$/i;
const MEDIUM_LINE = /^medium\s*-\s*(.+)$/i;
const STRETCH_LINE = /^stretch\s*-\s*(.+)$/i;

// Parses the admin's pasted monthly-prompt doc into per-day rows — matches
// the fixed "Day X - <prompt>" / quote / Simple-Medium-Stretch format the
// community already writes prompts in elsewhere, so a whole month can be
// authored outside this app and pasted in here in one go. Blank lines and
// any text before the first "Day N -" line are ignored; the first
// unrecognized line within a day's block is taken as its quote (only the
// first — the format has exactly one).
export function parseThemePromptsText(raw: string): ParsedThemePrompt[] {
  const lines = raw.split("\n").map((l) => l.trim());
  const prompts: ParsedThemePrompt[] = [];
  let current: ParsedThemePrompt | null = null;

  for (const line of lines) {
    if (!line) continue;

    const dayMatch = line.match(DAY_LINE);
    if (dayMatch) {
      if (current) prompts.push(current);
      current = {
        day_of_month: Number(dayMatch[1]),
        prompt_text: dayMatch[2].trim(),
        quote: null,
        simple_instruction: null,
        medium_instruction: null,
        stretch_instruction: null,
      };
      continue;
    }
    if (!current) continue;

    const simpleMatch = line.match(SIMPLE_LINE);
    if (simpleMatch) {
      current.simple_instruction = simpleMatch[1].trim();
      continue;
    }
    const mediumMatch = line.match(MEDIUM_LINE);
    if (mediumMatch) {
      current.medium_instruction = mediumMatch[1].trim();
      continue;
    }
    const stretchMatch = line.match(STRETCH_LINE);
    if (stretchMatch) {
      current.stretch_instruction = stretchMatch[1].trim();
      continue;
    }
    if (!current.quote) current.quote = line;
  }
  if (current) prompts.push(current);

  return prompts.filter((p) => p.day_of_month >= 1 && p.day_of_month <= 31 && p.prompt_text);
}

export async function fetchThemePrompts(themeId: number): Promise<ThemePrompt[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("theme_prompts")
    .select("*")
    .eq("theme_id", themeId)
    .order("day_of_month");
  if (error) throw error;
  return (data ?? []) as ThemePrompt[];
}

// Bulk save after pasting/parsing a whole month at once. Upserts on
// (theme_id, day_of_month) so re-pasting a corrected block — or the admin's
// later "update the prompt manually" case — just overwrites the matching
// days instead of erroring on duplicates.
export async function upsertThemePrompts(
  themeId: number,
  prompts: ParsedThemePrompt[]
): Promise<void> {
  if (prompts.length === 0) return;
  const supabase = createClient();
  const rows = prompts.map((p) => ({ theme_id: themeId, ...p }));
  const { error } = await supabase
    .from("theme_prompts")
    .upsert(rows, { onConflict: "theme_id,day_of_month" });
  if (error) throw error;
}

export async function deleteThemePrompt(id: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("theme_prompts").delete().eq("id", id);
  if (error) throw error;
}

// Backs the landing overlay's "today's prompt" — day_of_month is the plain
// UTC calendar day-of-month, the same UTC-day convention already used for
// upload streaks (see bump_upload_streak in schema.sql), not an explicit
// date column on this table.
export async function fetchPromptForDay(
  themeId: number,
  dayOfMonth: number
): Promise<ThemePrompt | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("theme_prompts")
    .select("*")
    .eq("theme_id", themeId)
    .eq("day_of_month", dayOfMonth)
    .maybeSingle();
  if (error) throw error;
  return (data as ThemePrompt) ?? null;
}
