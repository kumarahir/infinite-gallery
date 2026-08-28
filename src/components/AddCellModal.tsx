"use client";

import { useState } from "react";
import { useEffect } from "react";
import confetti from "canvas-confetti";
import type { User } from "@supabase/supabase-js";
import {
  CellTakenError,
  DailyLimitError,
  fetchThemes,
  fetchTodayImageUploadCount,
  insertImageCell,
  insertTextCell,
  publishToCommunity,
  type CellRow,
  type Theme,
} from "@/lib/cells";
import { fetchCanUpload, fetchMyStreak } from "@/lib/profiles";
import { resizeImageWithThumbnail } from "@/lib/resizeImage";
import { colorCorrectImage, cropImage, detectPaperCorners, type Corners } from "@/lib/scanDocument";
import {
  addGenericThemeKeywords,
  fetchThemePrompts,
  stripQuoteMarks,
  type ThemePrompt,
} from "@/lib/themePrompts";
import CropAdjuster from "./CropAdjuster";
import SignInPanel from "./SignInPanel";
import type { GalleryMode } from "./GalleryModeToggle";

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

// Drives what the "image" tab shows, between picking a file and having a
// cropped image ready to submit alongside the theme picker. Cropping and
// color-correcting are deliberately separate operations — "cropped" is the
// single review step for both the plain crop and (once the user flips the
// enhance toggle) the color-corrected result, so a bad crop is caught
// before spending time enhancing it.
type ImageStep = "picker" | "scanning" | "adjusting" | "cropping" | "cropped";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load that image."));
    img.src = url;
  });
}

// colorCorrectImage runs a long chain of synchronous OpenCV/WASM calls with
// no internal yield back to the browser, which blocks the main thread for
// the whole ~1-4s it takes — long enough that a state update made right
// before calling it (e.g. showing a spinner) never actually gets painted to
// the screen; the browser only paints once the call stack is empty, and it
// never goes empty until that synchronous work finishes. Waiting two
// animation frames guarantees a real paint happens first.
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export default function AddCellModal({
  x,
  y,
  user,
  isAdmin,
  galleryMode,
  onClose,
  onCreated,
}: {
  x: number;
  y: number;
  user: User | null;
  isAdmin: boolean;
  galleryMode: GalleryMode;
  onClose: () => void;
  onCreated: (cell: CellRow, streak?: number, publishError?: string) => void;
}) {
  const [tab, setTab] = useState<"image" | "text">("image");

  const [imageStep, setImageStep] = useState<ImageStep>("picker");
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [rawImageSize, setRawImageSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [corners, setCorners] = useState<Corners | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Off by default (showing the plain cropped original); flipping it on
  // triggers color correction the first time and then just displays the
  // cached result — whichever is showing when the user submits is what
  // actually gets uploaded.
  const [enhanceOn, setEnhanceOn] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [uploadBlocked, setUploadBlocked] = useState(false);
  // Starts true so the upload form never flashes before we know whether
  // this user is allowed to upload at all.
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeId, setThemeId] = useState<number | null>(null);
  // Prompts for whichever theme is currently selected in the dropdown below
  // (refetched on every theme change — see the effect further down) — backs
  // both the "Prompt" dropdown and the quote/instructions card. Empty for
  // "Generic" (that theme uses the keyword box instead) and for any theme
  // with no prompts of its own.
  const [selectedThemePrompts, setSelectedThemePrompts] = useState<ThemePrompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  // Free-text keywords typed for the "Generic" theme — each becomes its own
  // new prompt row for that theme on submit (see addGenericThemeKeywords),
  // not attached to this particular sketch.
  const [genericKeywords, setGenericKeywords] = useState("");
  // Personal-gallery only: also places a copy of this sketch into the
  // community gallery on submit (see publishToCommunity in cells.ts).
  const [publishToCommunityChecked, setPublishToCommunityChecked] = useState(false);

  const defaultTheme = themes.find((t) => t.is_default) ?? null;
  const genericTheme = themes.find((t) => t.name === "Generic") ?? null;
  const selectedPrompt = selectedThemePrompts.find((p) => p.id === selectedPromptId) ?? null;

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
    if (!user) {
      setCheckingPermission(false);
      return;
    }
    fetchCanUpload(user.id)
      .then((allowed) => setUploadBlocked(!allowed))
      .catch(() => {
        // If the check itself fails, let the (server-enforced) insert
        // attempt decide — don't block the user on a transient error.
      })
      .finally(() => setCheckingPermission(false));
  }, [user]);

  useEffect(() => {
    fetchThemes()
      .then((list) => {
        setThemes(list);
        const defaultTheme = list.find((t) => t.is_default);
        setThemeId(defaultTheme?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {
        // Leave themes empty — the submit button stays disabled in that case.
      });
  }, []);

  // Refetches whenever the theme dropdown changes — any theme can have its
  // own prompt list, not just the current default. "Generic" has none (it
  // uses the keyword box instead, see below). Only the default theme also
  // auto-selects "today's" prompt; other themes start on "No specific
  // prompt" since there's no meaningful "today" for a theme that isn't the
  // one currently featured.
  useEffect(() => {
    if (themeId == null || (genericTheme && themeId === genericTheme.id)) {
      setSelectedThemePrompts([]);
      setSelectedPromptId(null);
      return;
    }
    let cancelled = false;
    fetchThemePrompts(themeId)
      .then((prompts) => {
        if (cancelled) return;
        setSelectedThemePrompts(prompts);
        if (defaultTheme && themeId === defaultTheme.id) {
          const dayOfMonth = new Date(
            new Date().toISOString().slice(0, 10) + "T00:00:00Z"
          ).getUTCDate();
          const today = prompts.find((p) => p.day_of_month === dayOfMonth);
          setSelectedPromptId(today?.id ?? null);
        } else {
          setSelectedPromptId(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedThemePrompts([]);
          setSelectedPromptId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, defaultTheme?.id, genericTheme?.id]);

  const resetImageFlow = () => {
    setImageStep("picker");
    setRawImageUrl(null);
    setRawImageSize(null);
    setCorners(null);
    setCroppedBlob(null);
    setCroppedPreviewUrl(null);
    setProcessedBlob(null);
    setPreviewUrl(null);
    setEnhanceOn(false);
    setEnhancing(false);
    setScanError(null);
    setError(null);
  };

  const runScan = async (f: File) => {
    setScanError(null);
    setImageStep("scanning");
    try {
      const url = URL.createObjectURL(f);
      const img = await loadImage(url);
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      setRawImageUrl(url);
      setRawImageSize(size);

      const detected = await detectPaperCorners(img).catch(() => null);
      const fallback: Corners = [
        { x: 0, y: 0 },
        { x: size.width, y: 0 },
        { x: size.width, y: size.height },
        { x: 0, y: size.height },
      ];
      setCorners(detected ?? fallback);
      setImageStep("adjusting");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Couldn't process that photo.");
      setImageStep("picker");
    }
  };

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!ALLOWED_TYPES.has(f.type)) {
      setError("Unsupported file type.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError("File is too large (max 20MB).");
      return;
    }
    runScan(f);
  };

  const confirmCrop = async (finalCorners: Corners) => {
    if (!rawImageUrl) return;
    setCorners(finalCorners);
    setScanError(null);
    setImageStep("cropping");
    await waitForPaint();
    try {
      const img = await loadImage(rawImageUrl);
      const blob = await cropImage(img, finalCorners);
      setCroppedBlob(blob);
      setCroppedPreviewUrl(URL.createObjectURL(blob));
      // Redoing the crop invalidates whatever was enhanced from the old one.
      setProcessedBlob(null);
      setPreviewUrl(null);
      setEnhanceOn(false);
      setImageStep("cropped");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Couldn't crop that photo.");
      setImageStep("adjusting");
    }
  };

  // The toggle itself is what triggers color correction — the first time
  // it's flipped on, it runs colorCorrectImage and caches the result;
  // flipping it on again (or off) afterward is instant.
  const toggleEnhance = async () => {
    const next = !enhanceOn;
    setEnhanceOn(next);
    if (!next || processedBlob || !croppedPreviewUrl) return;
    setEnhancing(true);
    setScanError(null);
    await waitForPaint();
    try {
      const img = await loadImage(croppedPreviewUrl);
      const blob = await colorCorrectImage(img);
      setProcessedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Couldn't enhance that photo.");
      setEnhanceOn(false);
    } finally {
      setEnhancing(false);
    }
  };

  const submitImage = async () => {
    // Uploads whichever version is currently toggled visible — the enhanced
    // result if the toggle is on and ready, otherwise the plain crop.
    const blobToUpload = enhanceOn && processedBlob ? processedBlob : croppedBlob;
    // Theme is required in the community gallery, but "No theme" is a
    // deliberate, valid choice in the personal one (see the Theme select).
    if (!blobToUpload || !user || (galleryMode === "community" && themeId == null)) return;
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
      if (genericTheme && themeId === genericTheme.id && genericKeywords.trim()) {
        // Non-critical — grows the Generic theme's keyword pool for next
        // time, but shouldn't block this sketch from uploading if it fails.
        await addGenericThemeKeywords(genericTheme.id, genericKeywords.split(",")).catch(() => {});
      }
      const { full, thumbnail } = await resizeImageWithThumbnail(blobToUpload);
      const personalOwnerId = galleryMode === "personal" ? user.id : undefined;
      const cell = await insertImageCell({
        x,
        y,
        blob: full.blob,
        width: full.width,
        height: full.height,
        thumbnailBlob: thumbnail.blob,
        userId: user.id,
        themeId,
        themePromptId: selectedThemePrompts.length > 0 ? selectedPromptId : null,
        personalOwnerId,
      });

      // Best-effort — doesn't undo the personal upload, which already
      // succeeded — see publishToCommunity in cells.ts. Passed through to
      // onCreated rather than shown inline here: onCreated immediately
      // hands this cell to the parent grid, which swaps this modal out for
      // ViewCellModal on the very next render, so any local state set
      // afterward would never actually be seen.
      let publishError: string | undefined;
      if (personalOwnerId && publishToCommunityChecked && cell.image_path && cell.thumbnail_path) {
        try {
          await publishToCommunity({
            imagePath: cell.image_path,
            thumbnailPath: cell.thumbnail_path,
            width: full.width,
            height: full.height,
            themeId,
            themePromptId: selectedThemePrompts.length > 0 ? selectedPromptId : null,
            userId: user.id,
          });
        } catch {
          publishError = "Couldn't publish to the community gallery — try again from your personal gallery.";
        }
      }

      const streak = await fetchMyStreak(user.id).catch(() => undefined);
      onCreated(cell, streak, publishError);
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
      const cell = await insertTextCell(
        x,
        y,
        text.trim(),
        user.id,
        galleryMode === "personal" ? user.id : undefined
      );
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

  // Shared between the transient scanning/cropping steps (shown near the
  // top, unchanged position) and the picker step (shown further down, after
  // the theme/prompt pickers — see the render tree below) so the two spots
  // can't drift out of sync with each other. Hidden entirely during
  // adjusting/cropped — the "Prompt" dropdown already names the day's
  // prompt there, so a second copy would just repeat it.
  const promptCard =
    selectedPrompt && imageStep !== "adjusting" && imageStep !== "cropped" ? (
      <div className="rounded-lg border border-black/10 dark:border-white/15 px-3 py-2 flex flex-col gap-1">
        <p className="text-sm font-semibold">{selectedPrompt.prompt_text}</p>
        {selectedPrompt.quote && (
          <p className="text-xs italic text-black/60 dark:text-white/60">
            &ldquo;{stripQuoteMarks(selectedPrompt.quote)}&rdquo;
          </p>
        )}
        <div className="flex flex-col gap-0.5 text-xs">
          {selectedPrompt.simple_instruction && (
            <p>
              <span className="font-medium text-green-700 dark:text-green-400">Simple —</span>{" "}
              {selectedPrompt.simple_instruction}
            </p>
          )}
          {selectedPrompt.medium_instruction && (
            <p>
              <span className="font-medium text-amber-700 dark:text-amber-400">Medium —</span>{" "}
              {selectedPrompt.medium_instruction}
            </p>
          )}
          {selectedPrompt.stretch_instruction && (
            <p>
              <span className="font-medium text-red-700 dark:text-red-400">Stretch —</span>{" "}
              {selectedPrompt.stretch_instruction}
            </p>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="self-end text-black/40 dark:text-white/40 hover:opacity-70"
        >
          ×
        </button>

        {taken ? (
          <p className="text-sm text-black/70 dark:text-white/70">
            Someone just filled this cell — reload to see what they added.
          </p>
        ) : !user ? (
          <SignInPanel title="Sign in to add something here" />
        ) : checkingPermission ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-black/15 dark:border-white/15 border-t-black/60 dark:border-t-white/70 animate-spin" />
          </div>
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
                Upload Sketch
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

            {tab === "image" &&
              imageStep !== "picker" &&
              imageStep !== "cropped" &&
              promptCard}

            {tab === "image" ? (
              limitReached ? (
                <p className="text-sm text-black/70 dark:text-white/70 py-4">
                  {DAILY_LIMIT_MESSAGE}
                </p>
              ) : imageStep === "scanning" ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <div className="w-6 h-6 rounded-full border-2 border-black/15 dark:border-white/15 border-t-black/60 dark:border-t-white/70 animate-spin" />
                  <span className="text-sm text-black/50 dark:text-white/50">
                    Preparing scan…
                  </span>
                </div>
              ) : imageStep === "cropping" ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <div className="w-6 h-6 rounded-full border-2 border-black/15 dark:border-white/15 border-t-black/60 dark:border-t-white/70 animate-spin" />
                  <span className="text-sm text-black/50 dark:text-white/50">Cropping…</span>
                </div>
              ) : imageStep === "adjusting" && rawImageUrl && rawImageSize && corners ? (
                <div className="flex flex-col gap-3">
                  <CropAdjuster
                    imageUrl={rawImageUrl}
                    imageWidth={rawImageSize.width}
                    imageHeight={rawImageSize.height}
                    initialCorners={corners}
                    onConfirm={confirmCrop}
                    onCancel={resetImageFlow}
                  />
                  {scanError && <p className="text-sm text-red-500">{scanError}</p>}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-black/50 dark:text-white/50">
                      Theme
                    </span>
                    <select
                      value={themeId ?? ""}
                      onChange={(e) => setThemeId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
                    >
                      {galleryMode === "personal" && <option value="">No theme</option>}
                      {themes.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {galleryMode === "personal" && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={publishToCommunityChecked}
                        onChange={(e) => setPublishToCommunityChecked(e.target.checked)}
                        className="rounded border-black/20 dark:border-white/30"
                      />
                      Also publish to community gallery
                    </label>
                  )}

                  {selectedThemePrompts.length > 0 && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/50 dark:text-white/50">
                        Prompt
                      </span>
                      <select
                        value={selectedPromptId ?? ""}
                        onChange={(e) =>
                          setSelectedPromptId(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
                      >
                        <option value="">No specific prompt</option>
                        {selectedThemePrompts.map((prompt) => (
                          <option key={prompt.id} value={prompt.id}>
                            Day {prompt.day_of_month} — {prompt.prompt_text}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {themeId === genericTheme?.id && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/50 dark:text-white/50">
                        Add keywords (comma separated)
                      </span>
                      <input
                        type="text"
                        value={genericKeywords}
                        onChange={(e) => setGenericKeywords(e.target.value)}
                        placeholder="sunset, ocean, calm"
                        className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:focus:border-white/40"
                      />
                    </label>
                  )}

                  {promptCard}

                  {imageStep === "cropped" && croppedPreviewUrl ? (
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={enhanceOn && previewUrl ? previewUrl : croppedPreviewUrl}
                          alt=""
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                        {enhancing && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                            <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-black/60 dark:text-white/60 shrink-0">
                          {enhancing ? "Enhancing…" : "Enhance"}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enhanceOn}
                          aria-label="Enhance image"
                          onClick={toggleEnhance}
                          disabled={enhancing}
                          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                            enhanceOn ? "bg-green-500" : "bg-black/15 dark:bg-white/20"
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                              enhanceOn ? "translate-x-[22px]" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageStep("adjusting")}
                          className="flex-1 rounded-lg border border-green-600 bg-stone-50 text-green-700 text-xs font-medium py-2 hover:bg-stone-100 dark:bg-white/5 dark:border-green-500 dark:text-green-400 dark:hover:bg-white/10"
                        >
                          Redo crop
                        </button>
                        <button
                          type="button"
                          onClick={resetImageFlow}
                          className="flex-1 rounded-lg border border-green-600 bg-stone-50 text-green-700 text-xs font-medium py-2 hover:bg-stone-100 dark:bg-white/5 dark:border-green-500 dark:text-green-400 dark:hover:bg-white/10"
                        >
                          Start over
                        </button>
                      </div>
                      {scanError && <p className="text-sm text-red-500">{scanError}</p>}
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-black/15 dark:border-white/20 cursor-pointer hover:border-black/30 dark:hover:border-white/40 transition-colors p-2 text-center h-32">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-7 h-7 text-black/40 dark:text-white/40"
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span className="text-sm text-black/50 dark:text-white/50">
                        Upload a Sketch
                      </span>
                      {/* No `capture` attribute — leaving the picker choice to
                          the OS shows both "Take Photo" and "Photo Library"
                          (iOS) or camera/gallery (Android) from one input,
                          instead of forcing straight to the camera. */}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}

                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <button
                    type="button"
                    onClick={submitImage}
                    disabled={
                      !(enhanceOn && processedBlob ? processedBlob : croppedBlob) ||
                      enhancing ||
                      busy ||
                      (galleryMode === "community" && themeId == null)
                    }
                    className="rounded-lg bg-green-500 text-white text-sm font-medium py-2 disabled:opacity-40 hover:bg-green-600"
                  >
                    {busy ? "Uploading…" : "Share Sketch"}
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
