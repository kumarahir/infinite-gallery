"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { getPublicAvatarUrl, uploadMyAvatar } from "@/lib/profiles";
import { resizeImage } from "@/lib/resizeImage";
import DefaultAvatar from "./DefaultAvatar";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export default function ProfileAvatar({
  userId,
  initialAvatarPath,
  seed,
  size = 64,
}: {
  userId: string;
  initialAvatarPath: string | null;
  seed: string;
  size?: number;
}) {
  const [avatarPath, setAvatarPath] = useState(initialAvatarPath);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Unsupported file type.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("File is too large (max 20MB).");
      return;
    }
    setUploading(true);
    try {
      const { blob } = await resizeImage(file);
      const path = await uploadMyAvatar(userId, blob);
      setAvatarPath(path);
    } catch {
      setError("Failed to upload. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Change profile picture"
        disabled={uploading}
        className="relative rounded-full overflow-hidden border border-black/10 dark:border-white/15 hover:opacity-90 disabled:opacity-70"
        style={{ width: size, height: size }}
      >
        {avatarPath ? (
          <Image
            src={getPublicAvatarUrl(avatarPath)}
            alt=""
            width={size}
            height={size}
            className="w-full h-full object-cover"
          />
        ) : (
          <DefaultAvatar seed={seed} size={size} />
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
