const MAX_DIMENSION = 1200;
const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
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

  let quality = INITIAL_QUALITY;
  let blob = await encode(canvas, quality);
  if (!blob) throw new Error("Failed to encode image");

  // Only step quality down as far as actually needed to fit under the size
  // cap — most images never hit this loop at all, so quality is otherwise
  // left at INITIAL_QUALITY.
  while (blob.size > MAX_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
    const next = await encode(canvas, quality);
    if (!next) break;
    blob = next;
    if (quality === MIN_QUALITY) break;
  }

  return { blob, width, height };
}
