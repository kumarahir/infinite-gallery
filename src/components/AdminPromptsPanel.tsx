"use client";

import { useEffect, useState } from "react";
import { fetchThemes, type Theme } from "@/lib/cells";
import {
  addThemePrompt,
  deleteThemePrompt,
  fetchThemePrompts,
  parseThemePromptsText,
  updateThemePrompt,
  upsertThemePrompts,
  type ParsedThemePrompt,
  type ThemePrompt,
} from "@/lib/themePrompts";

const PASTE_PLACEHOLDER = `Day 1 - Journey
Every journey begins with one small step.
Simple - Draw a single footprint on a path.
Medium - Draw a winding road with a signpost.
Stretch - Draw a full scene of someone starting a hike at dawn.

Day 2 - Growth
...`;

interface PromptFormDraft {
  day_of_month: string;
  prompt_text: string;
  quote: string;
  simple_instruction: string;
  medium_instruction: string;
  stretch_instruction: string;
}

const BLANK_DRAFT: PromptFormDraft = {
  day_of_month: "",
  prompt_text: "",
  quote: "",
  simple_instruction: "",
  medium_instruction: "",
  stretch_instruction: "",
};

function draftFromPrompt(p: ThemePrompt): PromptFormDraft {
  return {
    day_of_month: String(p.day_of_month),
    prompt_text: p.prompt_text,
    quote: p.quote ?? "",
    simple_instruction: p.simple_instruction ?? "",
    medium_instruction: p.medium_instruction ?? "",
    stretch_instruction: p.stretch_instruction ?? "",
  };
}

const toNullable = (s: string) => (s.trim() ? s.trim() : null);

const FIELD_LABEL = "text-xs font-medium text-black/50 dark:text-white/50";
const FIELD_INPUT =
  "w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40";

export default function AdminPromptsPanel() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeId, setThemeId] = useState<number | null>(null);
  const [savedPrompts, setSavedPrompts] = useState<ThemePrompt[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParsedThemePrompt[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Add/edit form — shared between "Add prompt" (blank draft, day_of_month
  // editable, rendered above the list since there's no row to anchor to)
  // and a saved row's "Edit" (pre-filled, rendered inline in that row so
  // editing doesn't jerk the admin's scroll position back up to the top of
  // a 31-day list). day_of_month is fixed in edit mode so a typo'd day
  // can't silently create a duplicate day and orphan the original row —
  // see updateThemePrompt in themePrompts.ts.
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<ThemePrompt | null>(null);
  const [draft, setDraft] = useState<PromptFormDraft>(BLANK_DRAFT);

  useEffect(() => {
    fetchThemes()
      .then((list) => {
        setThemes(list);
        setThemeId((prev) => prev ?? list.find((t) => t.is_default)?.id ?? list[0]?.id ?? null);
      })
      .catch(() => setError("Failed to load themes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (themeId == null) return;
    fetchThemePrompts(themeId)
      .then(setSavedPrompts)
      .catch(() => setError("Failed to load saved prompts."));
  }, [themeId]);

  const closeForm = () => {
    setFormMode(null);
    setEditingPrompt(null);
    setDraft(BLANK_DRAFT);
  };

  const openAddForm = () => {
    setError(null);
    setMessage(null);
    setFormMode("add");
    setEditingPrompt(null);
    setDraft(BLANK_DRAFT);
  };

  const openEditForm = (prompt: ThemePrompt) => {
    setError(null);
    setMessage(null);
    setFormMode("edit");
    setEditingPrompt(prompt);
    setDraft(draftFromPrompt(prompt));
  };

  const handleParse = () => {
    setError(null);
    setMessage(null);
    const parsed = parseThemePromptsText(pasteText);
    if (parsed.length === 0) {
      setPreview(null);
      setError('No valid "Day X - prompt" lines found in the pasted text.');
      return;
    }
    setPreview(parsed);
  };

  const handleSaveAll = async () => {
    if (themeId == null || !preview || preview.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await upsertThemePrompts(themeId, preview);
      const refreshed = await fetchThemePrompts(themeId);
      setSavedPrompts(refreshed);
      setMessage(`Saved ${preview.length} day${preview.length === 1 ? "" : "s"}.`);
      setPreview(null);
      setPasteText("");
    } catch {
      setError("Failed to save prompts.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (prompt: ThemePrompt) => {
    setBusy(true);
    setError(null);
    try {
      await deleteThemePrompt(prompt.id);
      setSavedPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    } catch {
      setError("Failed to delete prompt.");
    } finally {
      setBusy(false);
    }
  };

  const handleFormSave = async () => {
    if (themeId == null) return;
    const dayNum = Number(draft.day_of_month);
    if (!draft.prompt_text.trim()) {
      setError("Prompt text is required.");
      return;
    }
    if (formMode === "add" && (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31)) {
      setError("Day must be a number between 1 and 31.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields = {
        prompt_text: draft.prompt_text.trim(),
        quote: toNullable(draft.quote),
        simple_instruction: toNullable(draft.simple_instruction),
        medium_instruction: toNullable(draft.medium_instruction),
        stretch_instruction: toNullable(draft.stretch_instruction),
      };
      if (formMode === "add") {
        await addThemePrompt(themeId, { day_of_month: dayNum, ...fields });
      } else if (formMode === "edit" && editingPrompt) {
        await updateThemePrompt(editingPrompt.id, fields);
      }
      const refreshed = await fetchThemePrompts(themeId);
      setSavedPrompts(refreshed);
      setMessage(formMode === "add" ? "Prompt added." : "Prompt updated.");
      closeForm();
    } catch {
      setError(formMode === "add" ? "Failed to add prompt." : "Failed to update prompt.");
    } finally {
      setBusy(false);
    }
  };

  // Shared field inputs for both the "add" form (above the list) and an
  // "edit" form (inline inside the row being edited) — only the day-of-month
  // field differs between the two, so callers pass whether to show it.
  const renderFormFields = (showDayField: boolean) => (
    <>
      {showDayField && (
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>Day of month (1-31)</span>
          <input
            type="number"
            min={1}
            max={31}
            value={draft.day_of_month}
            onChange={(e) => setDraft((d) => ({ ...d, day_of_month: e.target.value }))}
            className={FIELD_INPUT}
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Prompt</span>
        <input
          type="text"
          value={draft.prompt_text}
          onChange={(e) => setDraft((d) => ({ ...d, prompt_text: e.target.value }))}
          className={FIELD_INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Quote</span>
        <textarea
          value={draft.quote}
          onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value }))}
          rows={2}
          className={FIELD_INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Simple</span>
        <textarea
          value={draft.simple_instruction}
          onChange={(e) => setDraft((d) => ({ ...d, simple_instruction: e.target.value }))}
          rows={2}
          className={FIELD_INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Medium</span>
        <textarea
          value={draft.medium_instruction}
          onChange={(e) => setDraft((d) => ({ ...d, medium_instruction: e.target.value }))}
          rows={2}
          className={FIELD_INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Stretch</span>
        <textarea
          value={draft.stretch_instruction}
          onChange={(e) => setDraft((d) => ({ ...d, stretch_instruction: e.target.value }))}
          rows={2}
          className={FIELD_INPUT}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleFormSave}
          disabled={busy}
          className="rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={closeForm}
          disabled={busy}
          className="rounded-lg border border-black/10 dark:border-white/15 text-sm font-medium px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </>
  );

  if (loading) {
    return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Theme</span>
        <select
          value={themeId ?? ""}
          onChange={(e) => {
            setThemeId(Number(e.target.value));
            setPreview(null);
            setMessage(null);
            closeForm();
          }}
          className={FIELD_INPUT}
        >
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Paste a month of prompts</span>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={PASTE_PLACEHOLDER}
          rows={8}
          className={`${FIELD_INPUT} font-mono`}
        />
      </label>

      <button
        type="button"
        onClick={handleParse}
        disabled={!pasteText.trim()}
        className="self-start rounded-lg bg-foreground text-background text-sm font-medium px-4 py-2 disabled:opacity-40 hover:opacity-90"
      >
        Parse
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}

      {preview && (
        <div className="flex flex-col gap-2 rounded-lg border border-black/10 dark:border-white/15 p-3">
          <p className="text-sm font-medium">
            Parsed {preview.length} day{preview.length === 1 ? "" : "s"} — review, then save
          </p>
          <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {preview.map((p) => (
              <li key={p.day_of_month} className="text-xs border-t border-black/5 dark:border-white/10 pt-2 first:border-0 first:pt-0">
                <span className="font-semibold">Day {p.day_of_month} — {p.prompt_text}</span>
                {p.quote && <p className="italic text-black/60 dark:text-white/60">&ldquo;{p.quote}&rdquo;</p>}
                {p.simple_instruction && <p>Simple — {p.simple_instruction}</p>}
                {p.medium_instruction && <p>Medium — {p.medium_instruction}</p>}
                {p.stretch_instruction && <p>Stretch — {p.stretch_instruction}</p>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={busy}
            className="self-start rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-40"
          >
            Save {preview.length} day{preview.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Saved prompts for this theme</p>
          {formMode !== "add" && (
            <button
              type="button"
              onClick={openAddForm}
              disabled={themeId == null}
              className="text-xs font-medium text-green-700 dark:text-green-400 hover:opacity-70 disabled:opacity-40"
            >
              + Add prompt
            </button>
          )}
        </div>

        {formMode === "add" && (
          <div className="flex flex-col gap-2 rounded-lg border border-black/10 dark:border-white/15 p-3">
            <p className="text-sm font-medium">Add a day</p>
            {renderFormFields(true)}
          </div>
        )}

        {savedPrompts.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">No prompts saved yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {savedPrompts.map((p) =>
              formMode === "edit" && editingPrompt?.id === p.id ? (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-lg border border-black/10 dark:border-white/15 p-3"
                >
                  <p className="text-sm font-medium">Edit Day {p.day_of_month}</p>
                  {renderFormFields(false)}
                </li>
              ) : (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/10 dark:border-white/15 px-3 py-2"
                >
                  <span className="text-sm">
                    Day {p.day_of_month} — {p.prompt_text}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditForm(p)}
                      disabled={busy}
                      className="text-xs font-medium text-black/50 dark:text-white/50 hover:opacity-70 disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      disabled={busy}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:opacity-70 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
