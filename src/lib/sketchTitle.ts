// Shared between the community and personal /share pages — both need the
// same "which prompt does this sketch's title show" logic: prefer whichever
// prompt the uploader explicitly picked (AddCellModal's "Prompt" dropdown,
// stored as theme_prompt_id — may be day-less for a Generic-theme keyword,
// or for a different day than the upload date), falling back to inferring
// one from the UTC day-of-month the sketch was actually uploaded on.
export interface PromptRow {
  id: number;
  day_of_month: number | null;
  prompt_text: string;
}

export interface PromptMaps {
  byDay: Map<number, string>;
  byId: Map<number, { day_of_month: number | null; prompt_text: string }>;
}

export function buildPromptMaps(promptRows: PromptRow[]): PromptMaps {
  const byDay = new Map<number, string>();
  const byId = new Map<number, { day_of_month: number | null; prompt_text: string }>();
  for (const row of promptRows) {
    if (row.day_of_month != null) byDay.set(row.day_of_month, row.prompt_text);
    byId.set(row.id, { day_of_month: row.day_of_month, prompt_text: row.prompt_text });
  }
  return { byDay, byId };
}

export function titleForSketch(
  cell: { created_at: string; theme_prompt_id: number | null },
  maps: PromptMaps
): string {
  const dayOfMonth = new Date(cell.created_at).getUTCDate();
  const linked = cell.theme_prompt_id != null ? maps.byId.get(cell.theme_prompt_id) : null;
  if (linked && linked.day_of_month == null) return linked.prompt_text;
  const promptText = linked?.prompt_text ?? maps.byDay.get(dayOfMonth);
  return promptText ? `Day ${dayOfMonth} — ${promptText}` : `Day ${dayOfMonth}`;
}

// Separate from the two exports above (rather than widening them) because
// this variant spans every theme at once — the grid view's sort-by-prompt
// can be showing sketches from many themes with no theme filter active, and
// day_of_month alone would collide across themes (theme A's day 5 and theme
// B's day 5 are unrelated prompts), so the day-based fallback needs to be
// keyed by (theme_id, day_of_month) instead of day_of_month alone.
export interface MultiThemePromptRow {
  id: number;
  theme_id: number;
  day_of_month: number | null;
  prompt_text: string;
}

export interface MultiThemePromptMaps {
  byThemeDay: Map<string, string>;
  byId: Map<number, { day_of_month: number | null; prompt_text: string }>;
}

export function buildMultiThemePromptMaps(rows: MultiThemePromptRow[]): MultiThemePromptMaps {
  const byThemeDay = new Map<string, string>();
  const byId = new Map<number, { day_of_month: number | null; prompt_text: string }>();
  for (const row of rows) {
    if (row.day_of_month != null) {
      byThemeDay.set(`${row.theme_id}:${row.day_of_month}`, row.prompt_text);
    }
    byId.set(row.id, { day_of_month: row.day_of_month, prompt_text: row.prompt_text });
  }
  return { byThemeDay, byId };
}

// Just the prompt text (not a "Day N — " display label) — null when nothing
// resolves (no theme, or a day/theme with no configured prompt), so callers
// sorting alphabetically by this can push unprompted sketches to the end
// instead of treating "no prompt" as if it sorted before/after real ones.
export function promptTextForCell(
  cell: { created_at: string; theme_id: number | null; theme_prompt_id: number | null },
  maps: MultiThemePromptMaps
): string | null {
  const linked = cell.theme_prompt_id != null ? maps.byId.get(cell.theme_prompt_id) : null;
  if (linked) return linked.prompt_text;
  if (cell.theme_id == null) return null;
  const dayOfMonth = new Date(cell.created_at).getUTCDate();
  return maps.byThemeDay.get(`${cell.theme_id}:${dayOfMonth}`) ?? null;
}
