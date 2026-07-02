const MAX_DIMENSION = 1200;
const QUALITY = 0.85;

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY)
  );
  if (!blob) throw new Error("Failed to encode image");

  return { blob, width, height };
}
