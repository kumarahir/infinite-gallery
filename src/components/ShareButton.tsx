"use client";

import { useState } from "react";
import { getPublicImageUrl, type CellRow } from "@/lib/cells";

function buildShareUrl(x: number, y: number): string {
  return `${window.location.origin}/?cell=${x},${y}`;
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
  const url = buildShareUrl(cell.x, cell.y);
  const text = cell.cell_type === "text" ? cell.text_content ?? "" : "Check this out on Infinite Gallery";
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

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
