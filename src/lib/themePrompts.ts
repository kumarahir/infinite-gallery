import { createClient } from "@/lib/supabase/client";

export interface ThemePrompt {
  id: number;
  theme_id: number;
  // Null for the "Generic" theme's freeform keyword-prompts, which aren't
  // tied to a calendar day — see addGenericThemeKeywords below.
  day_of_month: number | null;
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

// Some quotes were pasted/typed with their own straight or curly quote
// marks already wrapped around them — stripped here so callers can wrap the
// result in their own “” without ending up with doubled-up quote marks.
export function stripQuoteMarks(quote: string): string {
  return quote.trim().replace(/^["“”]+|["“”]+$/g, "");
}

// Separator between the label and its text — accepts a plain hyphen as
// well as en dash/em dash, since pasting from Word/Docs/Notes commonly
// autocorrects "word - word" into an en dash.
const SEP = "\\s*[-\u2013\u2014:]\\s*";
const DAY_LINE = new RegExp(`^day\\s+(\\d+)${SEP}(.+)$`, "i");
const QUOTE_LINE = new RegExp(`^quote${SEP}(.+)$`, "i");
const SIMPLE_LINE = new RegExp(`^simple${SEP}(.+)$`, "i");
const MEDIUM_LINE = new RegExp(`^medium${SEP}(.+)$`, "i");
const STRETCH_LINE = new RegExp(`^stretch${SEP}(.+)$`, "i");

// Parses the admin's pasted monthly-prompt doc into per-day rows — matches
// the "Day X - <prompt>" / quote / Simple-Medium-Stretch format the
// community writes prompts in, so a whole month can be authored outside
// this app and pasted in here in one go. Blank lines and any text before
// the first "Day N" line are ignored. The quote line may carry an explicit
// "Quote -" label or, for compatibility, be a bare unlabeled line — the
// first unrecognized line within a day's block is taken as its quote if no
// "Quote -" line is present.
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

    const quoteMatch = line.match(QUOTE_LINE);
    if (quoteMatch) {
      current.quote = quoteMatch[1].trim();
      continue;
    }
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

// Adds (or, if the day already exists for this theme, overwrites) a single
// day's prompt — the admin panel's "Add prompt" form. Goes through the same
// upsert-by-(theme_id, day_of_month) path as the bulk paste import.
export async function addThemePrompt(
  themeId: number,
  prompt: ParsedThemePrompt
): Promise<void> {
  return upsertThemePrompts(themeId, [prompt]);
}

// Edits an existing day's prompt fields by row id — deliberately not an
// upsert-by-day like addThemePrompt, since the admin panel's edit form
// never changes day_of_month; going through `id` means a typo'd day number
// can't be "corrected" into silently creating a duplicate day while
// orphaning the original row.
export async function updateThemePrompt(
  id: number,
  fields: Omit<ParsedThemePrompt, "day_of_month">
): Promise<ThemePrompt> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("theme_prompts")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ThemePrompt;
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

export async function fetchThemePromptById(id: number): Promise<ThemePrompt | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("theme_prompts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ThemePrompt) ?? null;
}

// Prefers a sketch's explicitly-picked prompt (see cells.theme_prompt_id,
// set when uploading to the default theme's prompt dropdown) over inferring
// one from the upload date — older cells, and cells uploaded to a theme
// with no prompt picker, fall back to the day-of-month match as before.
export async function fetchPromptForCell(cell: {
  theme_id: number | null;
  theme_prompt_id: number | null;
  created_at: string;
}): Promise<ThemePrompt | null> {
  if (cell.theme_prompt_id != null) {
    const byId = await fetchThemePromptById(cell.theme_prompt_id);
    if (byId) return byId;
  }
  if (cell.theme_id == null) return null;
  const dayOfMonth = new Date(cell.created_at).getUTCDate();
  return fetchPromptForDay(cell.theme_id, dayOfMonth);
}

// Lets any signed-in user grow the "Generic" theme's freeform keyword pool
// while uploading — each keyword becomes its own day-less prompt row (see
// theme_prompts_generic_insert in schema.sql, which only allows this for
// the Generic theme specifically). Not attached to the sketch being
// uploaded — these enrich the shared pool for the future, not this cell.
export async function addGenericThemeKeywords(
  themeId: number,
  keywords: string[]
): Promise<void> {
  const trimmed = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  if (trimmed.length === 0) return;
  const supabase = createClient();
  const rows = trimmed.map((prompt_text) => ({
    theme_id: themeId,
    day_of_month: null,
    prompt_text,
  }));
  const { error } = await supabase.from("theme_prompts").insert(rows);
  if (error) throw error;
}
