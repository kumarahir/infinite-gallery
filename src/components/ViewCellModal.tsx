"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { deleteCell, getPublicImageUrl, type CellRow } from "@/lib/cells";
import { fetchPublicProfile, type PublicProfile } from "@/lib/profiles";
import ShareButton from "./ShareButton";

function SocialLinks({ profile }: { profile: PublicProfile }) {
  const links: { href: string; label: string; content: React.ReactNode }[] = [];

  if (profile.website_url) {
    links.push({
      href: profile.website_url,
      label: "Website",
      content: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    });
  }
  if (profile.instagram_handle) {
    links.push({
      href: `https://instagram.com/${profile.instagram_handle}`,
      label: "Instagram",
      content: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      ),
    });
  }
  if (profile.twitter_handle) {
    links.push({
      href: `https://x.com/${profile.twitter_handle}`,
      label: "X / Twitter",
      content: <span className="text-[11px] font-bold leading-none">X</span>,
    });
  }

  if (links.length === 0) return null;

  return (
    <span className="flex items-center gap-1">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60 hover:opacity-70"
        >
          {link.content}
        </a>
      ))}
    </span>
  );
}

export default function ViewCellModal({
  cell,
  isAdmin,
  celebrateTotal,
  onClose,
  onDeleted,
}: {
  cell: CellRow;
  isAdmin: boolean;
  celebrateTotal?: number | null;
  onClose: () => void;
  onDeleted: (x: number, y: number) => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [uploaderProfile, setUploaderProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    if (cell.cell_type !== "image") return;
    fetchPublicProfile(cell.created_by)
      .then(setUploaderProfile)
      .catch(() => {
        // Social links just won't show if this fails.
      });
  }, [cell.cell_type, cell.created_by]);

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await deleteCell(cell);
      onDeleted(cell.x, cell.y);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setRemoving(false);
      setConfirmingRemove(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-background border border-black/10 dark:border-white/15 shadow-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {celebrateTotal !== undefined && (
          <p className="text-sm font-medium text-center">
            Thank you for adding one more AtomicSketch
            {celebrateTotal != null ? ` to make it total of ${celebrateTotal}` : ""}
          </p>
        )}

        {cell.cell_type === "image" && cell.themes?.name && (
          <span className="self-center rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 text-xs font-medium text-black/50 dark:text-white/50">
            {cell.themes.name}
          </span>
        )}

        {cell.cell_type === "image" && cell.image_path ? (
          <div className="relative flex items-center justify-center max-h-[70vh] overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-black/15 dark:border-white/15 border-t-black/60 dark:border-t-white/70 animate-spin" />
              </div>
            )}
            <Image
              src={getPublicImageUrl(cell.image_path)}
              alt=""
              width={cell.image_width ?? 800}
              height={cell.image_height ?? 800}
              onLoad={() => setImageLoaded(true)}
              className={`max-w-full max-h-[70vh] w-auto h-auto object-contain transition-opacity duration-200 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        ) : (
          <p className="text-lg leading-snug break-words whitespace-pre-wrap py-4">
            {cell.text_content}
          </p>
        )}

        {cell.cell_type === "image" && cell.created_by_name && (
          <div className="flex items-center justify-center text-xs text-black/50 dark:text-white/50 text-center -mt-2">
            <span className="flex items-center gap-1.5">
              Uploaded by {cell.created_by_name}
              {uploaderProfile && <SocialLinks profile={uploaderProfile} />}
            </span>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <ShareButton cell={cell} />

          {isAdmin && (
            <div className="flex items-center gap-2">
              {confirmingRemove ? (
                <>
                  <span className="text-xs text-black/50 dark:text-white/50">Remove for everyone?</span>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={removing}
                    className="rounded-lg bg-red-600 text-white text-sm font-medium px-3 py-2 disabled:opacity-40 hover:opacity-90"
                  >
                    {removing ? "Removing…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={removing}
                    className="text-sm text-black/50 dark:text-white/50 hover:opacity-70"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  className="rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-medium px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex items-center justify-center self-center w-9 h-9 rounded-full border border-black/10 dark:border-white/15 text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
