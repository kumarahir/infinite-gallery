"use client";

import { useEffect, useState } from "react";
import { getPublicImageUrl, type CellRow } from "@/lib/cells";
import { fetchPromptForDay } from "@/lib/themePrompts";

function buildShareUrl(x: number, y: number): string {
  return `${window.location.origin}/?cell=${x},${y}`;
}

// "Check out this sketch on <prompt> on <theme> by <artist first name>" —
// each clause is only included if that piece of data actually exists (an
// older cell might predate theme_prompts, have no theme, or have no
// created_by_name), so this degrades gracefully instead of ever showing a
// broken-looking "on on by" sentence.
function buildShareText(cell: CellRow, promptText: string | null): string {
  if (cell.cell_type === "text") return cell.text_content ?? "";

  const parts: string[] = ["Check out this sketch"];
  if (promptText) parts.push(`on ${promptText}`);
  if (cell.themes?.name) parts.push(`on ${cell.themes.name}`);
  const firstName = cell.created_by_name?.trim().split(/\s+/)[0];
  if (firstName) parts.push(`by ${firstName}`);
  return parts.length > 1 ? parts.join(" ") : "Check out this sketch on Infinite Gallery";
}

async function tryAttachImageFile(
  cell: CellRow,
  shareData: ShareData
): Promise<ShareData> {
  if (cell.cell_type !== "image" || !cell.image_path) return shareData;
  try {
    const res = await fetch(getPublicImageUrl(cell.image_path));
    const blob = await res.blob();
    const file = new File([blob], "image.webp", { type: blob.type || "image/webp" });
    const withFile = { ...shareData, files: [file] };
    if (navigator.canShare?.(withFile)) return withFile;
  } catch {
    // Fall back to sharing the link/text without the attached file.
  }
  return shareData;
}

export default function ShareButton({ cell }: { cell: CellRow }) {
  const [copied, setCopied] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const url = buildShareUrl(cell.x, cell.y);
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    if (cell.cell_type !== "image" || cell.theme_id == null) return;
    // Whichever day was live when this was uploaded, not "today" — a share
    // of an old sketch should still credit the prompt it was actually made
    // for.
    const dayOfMonth = new Date(cell.created_at).getUTCDate();
    fetchPromptForDay(cell.theme_id, dayOfMonth)
      .then((p) => setPromptText(p?.prompt_text ?? null))
      .catch(() => setPromptText(null));
  }, [cell.cell_type, cell.theme_id, cell.created_at]);

  const text = buildShareText(cell, promptText);

  const share = async () => {
    let shareData: ShareData = { title: "Infinite Gallery", text, url };
    shareData = await tryAttachImageFile(cell, shareData);
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (canNativeShare) {
    return (
      <button
        type="button"
        onClick={share}
        className="rounded-lg border border-black/10 dark:border-white/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
      >
        Share
      </button>
    );
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={copyLink}
        className="rounded-lg border border-black/10 dark:border-white/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
      <div className="flex items-center gap-3 text-xs text-black/50 dark:text-white/50">
        <a
          href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-black dark:hover:text-white"
        >
          X / Twitter
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-black dark:hover:text-white"
        >
          Facebook
        </a>
        <a
          href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-black dark:hover:text-white"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
