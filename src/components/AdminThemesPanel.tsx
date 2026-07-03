"use client";

import { useEffect, useState } from "react";
import { addTheme, fetchThemes, removeTheme, type Theme } from "@/lib/cells";

export default function AdminThemesPanel() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetchThemes()
      .then(setThemes)
      .catch(() => setError("Failed to load themes."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const theme = await addTheme(name);
      setThemes((prev) => [...prev, theme].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(code === "23505" ? "A theme with that name already exists." : "Failed to add theme.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (theme: Theme) => {
    setBusy(true);
    setError(null);
    try {
      await removeTheme(theme.id);
      setThemes((prev) => prev.filter((t) => t.id !== theme.id));
    } catch {
      setError("Failed to remove theme.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New theme name"
          className="flex-1 rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="rounded-lg bg-foreground text-background text-sm font-medium px-4 py-2 disabled:opacity-40 hover:opacity-90"
        >
          Add
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {themes.map((theme) => (
            <li
              key={theme.id}
              className="flex items-center justify-between rounded-lg border border-black/10 dark:border-white/15 px-3 py-2"
            >
              <span className="text-sm">{theme.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(theme)}
                disabled={busy}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:opacity-70 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
