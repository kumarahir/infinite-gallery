"use client";

import { useEffect, useState } from "react";
import { fetchThemes, type Theme } from "@/lib/cells";
import {
  deleteThemePrompt,
  fetchThemePrompts,
  parseThemePromptsText,
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
          }}
          className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
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
          className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm font-mono outline-none focus:border-black/30 dark:focus:border-white/40"
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
        <p className="text-sm font-medium">Saved prompts for this theme</p>
        {savedPrompts.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">No prompts saved yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {savedPrompts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-black/10 dark:border-white/15 px-3 py-2"
              >
                <span className="text-sm">
                  Day {p.day_of_month} — {p.prompt_text}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  disabled={busy}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:opacity-70 disabled:opacity-40"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
