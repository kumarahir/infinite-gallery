// Client-side "document scanner" pipeline for sketch uploads: a cheap
// heuristic check that a photo looks like a sketch/notebook page, paper-edge
// detection (for an initial crop guess), and the perspective warp + cleanup
// filter that actually produces the final image. OpenCV.js is only ever
// loaded (dynamically, ~8-10MB) once a user is actually uploading an image —
// never as part of the app's main bundle.

export interface Point {
  x: number;
  y: number;
}

// Always ordered [top-left, top-right, bottom-right, bottom-left].
export type Corners = [Point, Point, Point, Point];

const PAPER_FRACTION_THRESHOLD = 0.35;
const SAMPLE_SIZE = 100;

// Fast, free, and approximate — downscales onto a tiny canvas and checks how
// much of the photo is "paper-like" (bright, low-saturation), which is true
// of essentially every notebook/sketchbook photo regardless of pen/marker
// color, but false for most other kinds of photos. This will have false
// negatives (a very shadowed or tightly-cropped page might dip under the
// threshold) — callers should offer an override rather than hard-block.
export async function looksLikeSketch(file: File): Promise<boolean> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true; // fail open — don't block uploads over an environment quirk

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);

  let paperLikeCount = 0;
  const totalPixels = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2 / 255;
    const saturation =
      max === min ? 0 : (max - min) / 255 / (1 - Math.abs(2 * lightness - 1));
    if (lightness > 0.55 && saturation < 0.35) {
      paperLikeCount++;
    }
  }

  return paperLikeCount / totalPixels > PAPER_FRACTION_THRESHOLD;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cvPromise: Promise<any> | null = null;

// The opencv.js module export can be a Promise, an already-ready module, or
// one that needs to wait for onRuntimeInitialized — this normalizes all
// three cases (per the package's own documented usage pattern) and caches
// the result so the ~8-10MB module is only ever fetched/instantiated once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadOpenCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = import("./opencvLoader").then((mod) => {
      const cvModule = mod.default;
      if (cvModule.Mat) return cvModule;
      if (typeof cvModule.then === "function") return cvModule;
      return new Promise((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve(cvModule);
      });
    });
  }
  return cvPromise;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matToPoints(mat: any): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < mat.rows; i++) {
    points.push({ x: mat.data32S[i * 2], y: mat.data32S[i * 2 + 1] });
  }
  return points;
}

// Sum of coordinates is smallest at the top-left corner and largest at the
// bottom-right; the difference (x - y) is largest at top-right and smallest
// at bottom-left — a standard, orientation-independent way to label 4
// unordered corner points.
function orderCorners(points: Point[]): Corners {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.x - p.y);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[diffs.indexOf(Math.max(...diffs))],
    points[sums.indexOf(Math.max(...sums))],
    points[diffs.indexOf(Math.min(...diffs))],
  ];
}

// Grayscale -> blur -> edge detection -> contours -> largest 4-point shape.
// Returns null if nothing confident is found so the caller can fall back to
// the image's own 4 corners (i.e. no crop) rather than a dead end — the
// user can still drag from there in CropAdjuster.
export async function detectPaperCorners(img: HTMLImageElement): Promise<Corners | null> {
  const cv = await loadOpenCv();
  const src = cv.imread(img);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let result: Corners | null = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const minArea = img.naturalWidth * img.naturalHeight * 0.15;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      const peri = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const area = cv.contourArea(approx);
        if (area > bestArea && area > minArea) {
          bestArea = area;
          result = orderCorners(matToPoints(approx));
        }
      }
      approx.delete();
      contour.delete();
    }
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }

  return result;
}

// Perspective-warps the (possibly user-adjusted) quadrilateral into a
// straight rectangle — this single step handles both cropping out
// everything but the paper and correcting rotation/skew — then applies a
// contrast-enhancement pass (CLAHE) so pen/pencil strokes read crisp against
// a bright, even background.
export async function warpAndClean(img: HTMLImageElement, corners: Corners): Promise<Blob> {
  const cv = await loadOpenCv();
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;

  const outWidth = Math.round(
    Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight))
  );
  const outHeight = Math.round(
    Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight))
  );

  const src = cv.imread(img);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    topLeft.x,
    topLeft.y,
    topRight.x,
    topRight.y,
    bottomRight.x,
    bottomRight.y,
    bottomLeft.x,
    bottomLeft.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    outWidth,
    0,
    outWidth,
    outHeight,
    0,
    outHeight,
  ]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  const gray = new cv.Mat();
  const enhanced = new cv.Mat();
  const result = new cv.Mat();
  let clahe: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

  let outCanvas: HTMLCanvasElement;
  try {
    cv.warpPerspective(src, warped, transform, new cv.Size(outWidth, outHeight));
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(gray, enhanced);
    cv.cvtColor(enhanced, result, cv.COLOR_GRAY2RGBA);

    outCanvas = document.createElement("canvas");
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    cv.imshow(outCanvas, result);
  } finally {
    src.delete();
    srcTri.delete();
    dstTri.delete();
    transform.delete();
    warped.delete();
    gray.delete();
    enhanced.delete();
    result.delete();
    clahe?.delete();
  }

  return new Promise((resolve, reject) => {
    outCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode the processed image."));
    }, "image/webp", 0.9);
  });
}
