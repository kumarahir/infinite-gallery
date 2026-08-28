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
