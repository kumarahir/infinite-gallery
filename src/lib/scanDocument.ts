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

const PAPER_FRACTION_THRESHOLD = 0.3;
const SAMPLE_SIZE = 100;
// How close to the photo's own brightest pixels a pixel must be to count as
// "paper", and the absolute floor below which we don't trust that reference
// at all (a photo with no bright region anywhere is almost certainly not a
// paper photo, regardless of the relative math below).
const RELATIVE_BRIGHTNESS_FACTOR = 0.75;
const MIN_BRIGHT_REFERENCE = 0.25;
const SATURATION_THRESHOLD = 0.45;

// Fast, free, and approximate — downscales onto a tiny canvas and checks how
// much of the photo is "paper-like". Rather than a fixed absolute
// brightness/saturation cutoff, "paper-like" is judged relative to the
// photo's own brightest pixels: paper is always the brightest, least
// saturated thing in a notebook photo relative to *itself*, even when the
// shot is dim, overexposed, or has a warm/cool color cast that shifts its
// absolute brightness or hue. This will still have false negatives (e.g. a
// photo with no bright region at all) — callers should offer an override
// rather than hard-block.
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

  const totalPixels = width * height;
  const lightness = new Float32Array(totalPixels);
  const saturation = new Float32Array(totalPixels);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2 / 255;
    lightness[p] = l;
    saturation[p] = max === min ? 0 : (max - min) / 255 / (1 - Math.abs(2 * l - 1));
  }

  const sortedLightness = Array.from(lightness).sort((a, b) => a - b);
  const brightRef = sortedLightness[Math.floor(totalPixels * 0.85)];
  // No plausibly-bright region anywhere in the frame (e.g. a photo with the
  // lens covered, or of a uniformly dark object) — there's no "paper" to
  // find, so don't let the relative math below treat the least-dark pixels
  // as if they were paper.
  if (brightRef < MIN_BRIGHT_REFERENCE) return false;

  let paperLikeCount = 0;
  for (let p = 0; p < totalPixels; p++) {
    if (
      lightness[p] > brightRef * RELATIVE_BRIGHTNESS_FACTOR &&
      saturation[p] < SATURATION_THRESHOLD
    ) {
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

// Grayscale -> denoise -> blur -> edge detection -> contours -> largest
// 4-point shape. Returns null if nothing confident is found so the caller
// can fall back to the image's own 4 corners (i.e. no crop) rather than a
// dead end — the user can still drag from there in CropAdjuster.
export async function detectPaperCorners(img: HTMLImageElement): Promise<Corners | null> {
  const cv = await loadOpenCv();
  const src = cv.imread(img);
  const gray = new cv.Mat();
  const denoised = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const gradX = new cv.Mat();
  const gradY = new cv.Mat();
  const magnitude = new cv.Mat();
  const magMean = new cv.Mat();
  const magStd = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let result: Corners | null = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // Median blur suppresses sensor/compression noise (salt-and-pepper
    // style) with much less edge-softening than a Gaussian of equivalent
    // strength would cause; the Gaussian pass after it does the smoothing
    // Canny actually wants without erasing the paper's edge.
    cv.medianBlur(gray, denoised, 5);
    cv.GaussianBlur(denoised, blurred, new cv.Size(5, 5), 0);

    // Canny's thresholds are gradient-magnitude cutoffs, not pixel-intensity
    // ones — deriving them from the image's own gradient statistics (via
    // Sobel) adapts properly to a blurred or low-contrast photo, where every
    // edge is inherently weaker, unlike thresholds derived from raw pixel
    // intensity (e.g. Otsu), which stay high even when blur has flattened
    // the actual gradients and end up finding zero edges at all.
    cv.Sobel(blurred, gradX, cv.CV_32F, 1, 0, 3);
    cv.Sobel(blurred, gradY, cv.CV_32F, 0, 1, 3);
    cv.magnitude(gradX, gradY, magnitude);
    cv.meanStdDev(magnitude, magMean, magStd);
    const meanMag = magMean.data64F[0];
    const stdMag = magStd.data64F[0];
    const highThresh = Math.max(20, meanMag + stdMag);
    const lowThresh = highThresh * 0.4;
    cv.Canny(blurred, edges, lowThresh, highThresh);
    // A closing pass (dilate then erode as one op) bridges small gaps left in
    // the paper's edge by blur or noise, without thickening it as much as a
    // plain dilate would.
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
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

    // Blur or noise can soften the paper's edge just enough that nothing
    // approximates to exactly 4 points at the default epsilon. Rather than
    // give up and hand back the full frame, retry with a progressively
    // looser epsilon on the single largest contour — a slightly less precise
    // quad is still a much better starting point for CropAdjuster than no
    // crop at all.
    if (!result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let largestContour: any = null;
      let largestArea = 0;
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        if (area > largestArea && area > minArea) {
          largestArea = area;
          largestContour?.delete();
          largestContour = contour;
        } else {
          contour.delete();
        }
      }
      if (largestContour) {
        const peri = cv.arcLength(largestContour, true);
        for (const epsilonFactor of [0.03, 0.05, 0.08, 0.12, 0.18]) {
          const approx = new cv.Mat();
          cv.approxPolyDP(largestContour, approx, epsilonFactor * peri, true);
          if (approx.rows === 4) {
            result = orderCorners(matToPoints(approx));
            approx.delete();
            break;
          }
          approx.delete();
        }
        largestContour.delete();
      }
    }
  } finally {
    src.delete();
    gray.delete();
    denoised.delete();
    blurred.delete();
    edges.delete();
    gradX.delete();
    gradY.delete();
    magnitude.delete();
    magMean.delete();
    magStd.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }

  return result;
}

// Scales each RGB channel so its mean matches the overall gray mean (the
// "gray-world" assumption) — neutralizes warm/cool color casts from indoor
// lighting. Reasonable here specifically because paper dominates the frame
// after cropping, so the frame's average color really should be close to
// neutral. Mutates `rgb` in place. The correction is clamped so a very
// strong single-channel cast doesn't get overcorrected into visible noise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function grayWorldWhiteBalance(cv: any, rgb: any): void {
  const channels = new cv.MatVector();
  cv.split(rgb, channels);
  const means = [0, 1, 2].map((i) => cv.mean(channels.get(i))[0]);
  const gray = (means[0] + means[1] + means[2]) / 3;
  const scaled = [];
  for (let i = 0; i < 3; i++) {
    const channel = channels.get(i);
    const scale = Math.min(1.5, Math.max(0.67, gray / Math.max(1, means[i])));
    const out = new cv.Mat();
    channel.convertTo(out, -1, scale, 0);
    channels.set(i, out);
    scaled.push(out);
    channel.delete();
  }
  cv.merge(channels, rgb);
  channels.delete();
  scaled.forEach((m) => m.delete());
}

// Estimates the page's background lighting, then divides the original by
// that estimate — this flattens uneven lighting across the page much more
// effectively than CLAHE alone, which only reacts to *local* contrast and
// still leaves a shadow's or gradient's broad light-to-dark sweep visible.
// The estimate itself comes from a morphological closing (dilate then
// erode) rather than a plain Gaussian blur: a blur wide enough to smooth out
// a shadow is *not* automatically wide enough to fully "erase" a thick
// stroke or a large filled-in shape, so the background estimate ends up
// partially tracking that ink too — dividing it out then leaves a visible
// halo/patch around exactly those features. Closing with an elliptical
// kernel wider than any realistic ink feature genuinely eliminates dark
// shapes up to that width from the estimate, not just partially blurs them.
// Returns a new Mat the caller must delete.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeIllumination(cv: any, lChannel: any, outWidth: number, outHeight: number): any {
  // The background lighting field is inherently low-frequency/smooth, so
  // estimating it doesn't need full photo resolution — a real upload can
  // easily be 3000-4000px on a side, and running a morphological closing
  // with a kernel sized relative to *that* (the previous approach) meant an
  // elliptical structuring element hundreds of pixels wide over a
  // multi-megapixel image, which is prohibitively slow (this is what made
  // "Confirm crop" appear to hang). Doing the estimate on a small downscaled
  // copy keeps the cost constant regardless of the source photo's
  // resolution, then upscaling the result back loses nothing since it has
  // no fine detail to begin with.
  const WORK_SIZE = 400;
  const workScale = Math.min(1, WORK_SIZE / Math.min(outWidth, outHeight));
  const workWidth = Math.max(1, Math.round(outWidth * workScale));
  const workHeight = Math.max(1, Math.round(outHeight * workScale));

  const small = new cv.Mat();
  cv.resize(lChannel, small, new cv.Size(workWidth, workHeight), 0, 0, cv.INTER_AREA);

  // The closing kernel's *radius* (half its size) needs to comfortably
  // exceed half the width of the largest realistic ink feature (a thick
  // marker fill, a bold heading) — undersized here was exactly what produced
  // visible glowing halos around large filled shapes: the kernel closed over
  // most of the shape but not quite all of it, leaving a ring where the
  // background estimate transitions between "true paper" and "still sees
  // some of the shape" right at its edge.
  let k = Math.floor(Math.min(workWidth, workHeight) / 2.5);
  if (k % 2 === 0) k += 1;
  if (k < 15) k = 15;

  const closeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k));
  const closedSmall = new cv.Mat();
  cv.morphologyEx(small, closedSmall, cv.MORPH_CLOSE, closeKernel);
  // The closing operation's result is blocky at the scale of the kernel —
  // a modest smoothing pass (much smaller than the closing kernel itself, so
  // it doesn't reintroduce the same halo) turns it into a continuous field
  // before dividing it out.
  let smoothK = Math.floor(k / 5);
  if (smoothK % 2 === 0) smoothK += 1;
  if (smoothK < 5) smoothK = 5;
  const smoothedSmall = new cv.Mat();
  cv.GaussianBlur(closedSmall, smoothedSmall, new cv.Size(smoothK, smoothK), 0);

  const background = new cv.Mat();
  cv.resize(smoothedSmall, background, new cv.Size(outWidth, outHeight), 0, 0, cv.INTER_LINEAR);

  const lFloat = new cv.Mat();
  lChannel.convertTo(lFloat, cv.CV_32F);
  const bgFloat = new cv.Mat();
  background.convertTo(bgFloat, cv.CV_32F);
  const meanBackground = cv.mean(bgFloat)[0];
  const normalized = new cv.Mat();
  // scale=meanBackground rescales the ~1.0-centered ratio back up to the
  // page's own average brightness instead of leaving it near black.
  cv.divide(lFloat, bgFloat, normalized, meanBackground);
  const result = new cv.Mat();
  normalized.convertTo(result, cv.CV_8U);

  small.delete();
  closeKernel.delete();
  closedSmall.delete();
  smoothedSmall.delete();
  background.delete();
  lFloat.delete();
  bgFloat.delete();
  normalized.delete();
  return result;
}

// Perspective-warps the (possibly user-adjusted) quadrilateral into a
// straight rectangle — this single step handles both cropping out
// everything but the paper and correcting rotation/skew — then cleans up
// the result: gray-world white balance corrects color casts, a bilateral
// filter suppresses sensor noise while preserving stroke edges, illumination
// normalization flattens gradients/shadows, and CLAHE adds a final local
// contrast punch. The white balance and contrast steps operate on RGB/Lab's
// color and lightness channels respectively — never a grayscale conversion —
// so colored sketches keep their color.
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
  const rgb = new cv.Mat();
  const denoisedRgb = new cv.Mat();
  const lab = new cv.Mat();
  const channels = new cv.MatVector();
  const enhancedL = new cv.Mat();
  const rgbOut = new cv.Mat();
  const result = new cv.Mat();
  let clahe: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  let lChannel: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  let normalizedL: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

  let outCanvas: HTMLCanvasElement;
  try {
    cv.warpPerspective(src, warped, transform, new cv.Size(outWidth, outHeight));
    cv.cvtColor(warped, rgb, cv.COLOR_RGBA2RGB);
    grayWorldWhiteBalance(cv, rgb);
    // d=7 keeps this fast (a bounded, one-shot per-upload operation); sigma
    // values are large enough to smooth sensor grain but small enough that
    // strong stroke/text edges still survive.
    cv.bilateralFilter(rgb, denoisedRgb, 7, 45, 45);
    cv.cvtColor(denoisedRgb, lab, cv.COLOR_RGB2Lab);
    cv.split(lab, channels);
    lChannel = channels.get(0);
    normalizedL = normalizeIllumination(cv, lChannel, outWidth, outHeight);
    clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(normalizedL, enhancedL);
    channels.set(0, enhancedL);
    cv.merge(channels, lab);
    cv.cvtColor(lab, rgbOut, cv.COLOR_Lab2RGB);
    cv.cvtColor(rgbOut, result, cv.COLOR_RGB2RGBA);

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
    rgb.delete();
    denoisedRgb.delete();
    lab.delete();
    channels.delete();
    enhancedL.delete();
    rgbOut.delete();
    result.delete();
    clahe?.delete();
    lChannel?.delete();
    normalizedL?.delete();
  }

  return new Promise((resolve, reject) => {
    outCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode the processed image."));
    }, "image/webp", 0.9);
  });
}
