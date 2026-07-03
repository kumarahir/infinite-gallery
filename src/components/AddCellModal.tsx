"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import type { User } from "@supabase/supabase-js";
import {
  CellTakenError,
  DailyLimitError,
  fetchThemes,
  fetchTodayImageUploadCount,
  insertImageCell,
  insertTextCell,
  type CellRow,
  type Theme,
} from "@/lib/cells";
import { fetchCanUpload } from "@/lib/profiles";
import { resizeImage } from "@/lib/resizeImage";
import SignInPanel from "./SignInPanel";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TEXT_LENGTH = 280;
const DAILY_IMAGE_LIMIT = 5;
const DAILY_LIMIT_MESSAGE = `You've reached today's limit of ${DAILY_IMAGE_LIMIT} image uploads. Try again tomorrow.`;
const ADMIN_EMAIL = "kumar.ahir@gmail.com";

export default function AddCellModal({
  x,
  y,
  user,
  isAdmin,
  onClose,
  onCreated,
}: {
  x: number;
  y: number;
  user: User | null;
  isAdmin: boolean;
  onClose: () => void;
  onCreated: (cell: CellRow) => void;
}) {
  const [tab, setTab] = useState<"image" | "text">("image");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [uploadBlocked, setUploadBlocked] = useState(false);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeId, setThemeId] = useState<number | null>(null);

  useEffect(() => {
    if (!user || isAdmin) return;
    fetchTodayImageUploadCount(user.id)
      .then((count) => setLimitReached(count >= DAILY_IMAGE_LIMIT))
      .catch(() => {
        // If the check itself fails, let the (server-enforced) insert
        // attempt decide — don't block the user on a transient error.
      });
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) return;
    fetchCanUpload(user.id)
      .then((allowed) => setUploadBlocked(!allowed))
      .catch(() => {
        // If the check itself fails, let the (server-enforced) insert
        // attempt decide — don't block the user on a transient error.
      });
  }, [user]);

  useEffect(() => {
    fetchThemes()
      .then((list) => {
        setThemes(list);
        const generic = list.find((t) => t.name === "Generic");
        setThemeId(generic?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {
        // Leave themes empty — the submit button stays disabled in that case.
      });
  }, []);

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!ALLOWED_TYPES.has(f.type)) {
      setError("Unsupported file type.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError("File is too large (max 20MB).");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const submitImage = async () => {
    if (!file || !user || themeId == null) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await fetchCanUpload(user.id))) {
        setUploadBlocked(true);
        setBusy(false);
        return;
      }
      if (!isAdmin) {
        const count = await fetchTodayImageUploadCount(user.id);
        if (count >= DAILY_IMAGE_LIMIT) {
          setLimitReached(true);
          setBusy(false);
          return;
        }
      }
      const { blob, width, height } = await resizeImage(file);
      const cell = await insertImageCell(x, y, blob, width, height, user.id, themeId);
      onCreated(cell);
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
      // Deliberately no onClose() here — the parent grid now has this cell
      // in its cache, so it re-renders this same pendingCell coordinate as
      // ViewCellModal (showing the image + thank-you banner) instead of
      // this form. Closing here would immediately undo that hand-off.
    } catch (err) {
      if (err instanceof CellTakenError) {
        setTaken(true);
      } else if (err instanceof DailyLimitError) {
        setLimitReached(true);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitText = async () => {
    if (!text.trim() || !user) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await fetchCanUpload(user.id))) {
        setUploadBlocked(true);
        setBusy(false);
        return;
      }
      const cell = await insertTextCell(x, y, text.trim(), user.id);
      onCreated(cell);
      onClose();
    } catch (err) {
      if (err instanceof CellTakenError) {
        setTaken(true);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-black/50 dark:text-white/50">
            Add to this cell
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-black/40 dark:text-white/40 hover:opacity-70"
          >
            ×
          </button>
        </div>

        {taken ? (
          <p className="text-sm text-black/70 dark:text-white/70">
            Someone just filled this cell — reload to see what they added.
          </p>
        ) : !user ? (
          <SignInPanel title="Sign in to add something here" />
        ) : uploadBlocked ? (
          <p className="text-sm text-black/70 dark:text-white/70">
            You don&rsquo;t have permission to upload right now. Contact{" "}
            <a href={`mailto:${ADMIN_EMAIL}`} className="underline">
              {ADMIN_EMAIL}
            </a>{" "}
            to request access.
          </p>
        ) : (
          <>
            <div className="flex rounded-lg bg-black/5 dark:bg-white/5 p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setTab("image")}
                className={`flex-1 rounded-md py-1.5 transition-colors ${
                  tab === "image" ? "bg-background shadow-sm" : "opacity-60"
                }`}
              >
                Upload Image
              </button>
              <button
                type="button"
                onClick={() => setTab("text")}
                className={`flex-1 rounded-md py-1.5 transition-colors ${
                  tab === "text" ? "bg-background shadow-sm" : "opacity-60"
                }`}
              >
                Write Text
              </button>
            </div>

            {tab === "image" ? (
              limitReached ? (
                <p className="text-sm text-black/70 dark:text-white/70 py-4">
                  {DAILY_LIMIT_MESSAGE}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt=""
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-1 aspect-square rounded-lg border-2 border-dashed border-black/15 dark:border-white/20 cursor-pointer hover:border-black/30 dark:hover:border-white/40 transition-colors">
                      <span className="text-sm text-black/50 dark:text-white/50">
                        Click to choose an image
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-black/50 dark:text-white/50">
                      Theme
                    </span>
                    <select
                      value={themeId ?? ""}
                      onChange={(e) => setThemeId(Number(e.target.value))}
                      className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
                    >
                      {themes.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <button
                    type="button"
                    onClick={submitImage}
                    disabled={!file || busy || themeId == null}
                    className="rounded-lg bg-foreground text-background text-sm font-medium py-2 disabled:opacity-40 hover:opacity-90"
                  >
                    {busy ? "Uploading…" : "Add image"}
                  </button>
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                  placeholder="Write something…"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-black/40 dark:text-white/40">
                    {text.length}/{MAX_TEXT_LENGTH}
                  </span>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="button"
                  onClick={submitText}
                  disabled={!text.trim() || busy}
                  className="rounded-lg bg-foreground text-background text-sm font-medium py-2 disabled:opacity-40 hover:opacity-90"
                >
                  {busy ? "Saving…" : "Add text"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
