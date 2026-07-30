const COLUMNS = 7;
const CELL_SIZE = 220;
const GAP = 8;
const PADDING = 24;
const HEADER_HEIGHT = 90;

export interface CollageSketch {
  imageUrl: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required for canvas.toBlob() to succeed on images from another origin
    // (Supabase storage) — without it the canvas is "tainted" and export
    // throws a SecurityError. Relies on the storage bucket's public objects
    // sending Access-Control-Allow-Origin, which Supabase does by default.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load one of the sketches."));
    img.src = url;
  });
}

// object-fit: cover equivalent — crops to fill the target square without
// distorting the source image's own aspect ratio.
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number
) {
  const imgRatio = img.width / img.height;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > 1) {
    sw = img.height;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "sketches";
}

export function collageFilename(name: string, themeName: string): string {
  return `atomicsketches-${slugify(name)}-${slugify(themeName)}.png`;
}

// Builds a PNG collage: a title/theme/count header above the sketches
// packed left-to-right, top-to-bottom, 7 per row (per COLUMNS), wrapping to
// as many rows as needed for the last partial row.
export async function buildCollage(params: {
  name: string;
  themeName: string;
  sketches: CollageSketch[];
}): Promise<Blob> {
  const { name, themeName, sketches } = params;
  const count = sketches.length;
  if (count === 0) throw new Error("No sketches to build a collage from.");

  const rows = Math.ceil(count / COLUMNS);
  const width = PADDING * 2 + COLUMNS * CELL_SIZE + (COLUMNS - 1) * GAP;
  const height = PADDING * 2 + HEADER_HEIGHT + rows * CELL_SIZE + (rows - 1) * GAP;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#111111";
  ctx.font = "600 30px Arial, sans-serif";
  ctx.fillText(`${name}'s sketches`, width / 2, PADDING + 34);

  ctx.fillStyle = "#666666";
  ctx.font = "18px Arial, sans-serif";
  ctx.fillText(`${themeName} · ${count} sketch${count === 1 ? "" : "es"}`, width / 2, PADDING + 62);

  const images = await Promise.all(sketches.map((s) => loadImage(s.imageUrl)));
  images.forEach((img, i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x = PADDING + col * (CELL_SIZE + GAP);
    const y = PADDING + HEADER_HEIGHT + row * (CELL_SIZE + GAP);
    drawCover(ctx, img, x, y, CELL_SIZE);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate the collage image."));
    }, "image/png");
  });
}
