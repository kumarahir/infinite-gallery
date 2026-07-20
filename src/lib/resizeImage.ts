const MAX_DIMENSION = 1200;
const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

// Grid cells only ever display a thumbnail at 80-160 CSS px — this covers
// that at up to ~2.5x device pixel ratio without ever approaching the full
// upload's size, so the gallery grid (by far the most-viewed surface) never
// needs Next's Image Optimization to downsize the full-size original.
const THUMBNAIL_MAX_DIMENSION = 400;
const THUMBNAIL_MAX_BYTES = 150 * 1024; // 150KB

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

async function encodeAtSize(
  bitmap: ImageBitmap,
  maxDimension: number,
  maxBytes: number
): Promise<ResizedImage> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);

  let quality = INITIAL_QUALITY;
  let blob = await encode(canvas, quality);
  if (!blob) throw new Error("Failed to encode image");

  // Only step quality down as far as actually needed to fit under the size
  // cap — most images never hit this loop at all, so quality is otherwise
  // left at INITIAL_QUALITY.
  while (blob.size > maxBytes && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
    const next = await encode(canvas, quality);
    if (!next) break;
    blob = next;
    if (quality === MIN_QUALITY) break;
  }

  return { blob, width, height };
}

export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);
  const result = await encodeAtSize(bitmap, MAX_DIMENSION, MAX_BYTES);
  bitmap.close();
  return result;
}

// Decodes the source once and produces both the normal upload-quality image
// and a small dedicated thumbnail from the same bitmap — used for gallery
// image uploads, where the grid should never have to ask the server to
// downsize the full-size original just to show an 80-160px cell.
export async function resizeImageWithThumbnail(
  file: File
): Promise<{ full: ResizedImage; thumbnail: ResizedImage }> {
  const bitmap = await createImageBitmap(file);
  const full = await encodeAtSize(bitmap, MAX_DIMENSION, MAX_BYTES);
  const thumbnail = await encodeAtSize(bitmap, THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_BYTES);
  bitmap.close();
  return { full, thumbnail };
}
