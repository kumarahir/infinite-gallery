import type { Emotion } from "@/lib/reactions";

// Numeric HTML character references rather than literal emoji characters
// in source — some email clients ignore/mishandle a document's charset and
// mangle literal UTF-8 multi-byte characters into mojibake, but numeric
// references render correctly regardless of the declared charset.
const EMOTION_EMOJI: Record<Emotion, string> = {
  inspired: "&#129321;",
  proud: "&#128588;",
  joyful: "&#128522;",
  confident: "&#128170;",
  loved: "&#10084;&#65039;",
};
const EMOTION_ORDER: Emotion[] = ["inspired", "proud", "joyful", "confident", "loved"];

export interface WeeklyReviewPosition {
  x: number;
  y: number;
}

export interface WeeklyReviewData {
  name: string;
  currentStreak: number;
  sketchCount: number;
  weekPositions: WeeklyReviewPosition[];
  thumbnailUrls: string[];
  highlightThumbnailUrl: string | null;
  reactionCounts: Record<Emotion, number> | null;
  themeName: string | null;
  dayOfMonth: number;
  daysInMonth: number;
  todaysPromptText: string | null;
  appUrl: string;
}

const GRID_COLS = 6;
const GRID_ROWS = 3;
const FILLED = "#639922";
const EMPTY = "#f0efe8";

// Buckets this week's real (x,y) canvas coordinates into a small fixed
// grid, scaled to their own bounding box — email can't render the literal
// infinite canvas, but this keeps "where you landed" genuine (derived from
// real positions) rather than decorative filler.
function buildPositionGrid(positions: WeeklyReviewPosition[]): boolean[][] {
  const grid: boolean[][] = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
  if (positions.length === 0) return grid;

  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;

  for (const p of positions) {
    const col = Math.min(GRID_COLS - 1, Math.floor(((p.x - minX) / spanX) * GRID_COLS));
    const row = Math.min(GRID_ROWS - 1, Math.floor(((p.y - minY) / spanY) * GRID_ROWS));
    grid[row][col] = true;
  }
  return grid;
}

// Table-based, not CSS grid/flexbox — those aren't reliably supported by
// Outlook desktop's Word rendering engine. `bgcolor` is set alongside the
// inline `background-color` for the same reason.
function renderPositionGrid(positions: WeeklyReviewPosition[]): string {
  const grid = buildPositionGrid(positions);
  const cellsRows = grid
    .map((row) =>
      row
        .map(
          (filled) =>
            `<td width="40" height="40" bgcolor="${filled ? FILLED : EMPTY}" style="background-color:${filled ? FILLED : EMPTY}; border-radius:4px; font-size:0; line-height:0;">&nbsp;</td>`
        )
        .join('<td width="4" style="font-size:0; line-height:0;">&nbsp;</td>')
    )
    .map((row) => `<tr>${row}</tr>`)
    .join(
      `<tr><td colspan="${GRID_COLS * 2 - 1}" height="4" style="font-size:0; line-height:0;">&nbsp;</td></tr>`
    );
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">${cellsRows}</table>`;
}

function renderThumbnails(urls: string[]): string {
  if (urls.length === 0) return "";
  const cells = urls
    .map(
      (url) =>
        `<td width="64" style="padding:0 4px;"><img src="${url}" width="64" height="64" alt="" style="display:block; width:64px; height:64px; border-radius:8px; object-fit:cover;" /></td>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${cells}</tr></table>`;
}

function renderReactionChips(counts: Record<Emotion, number>): string {
  const cells = EMOTION_ORDER.filter((e) => counts[e] > 0)
    .map(
      (e) =>
        `<td style="padding:0 8px 0 0; font-size:13px; color:#444444;">${EMOTION_EMOJI[e]} ${counts[e]}</td>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

export function buildWeeklyReviewEmail(data: WeeklyReviewData): { subject: string; html: string } {
  const subject = "Your sketching week in review";

  const statsRow = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%">
      <tr>
        <td align="center" style="padding:0 20px;">
          <p style="margin:0; font-size:20px; font-weight:600; color:#412402;">${data.sketchCount}</p>
          <p style="margin:2px 0 0; font-size:11px; color:#854F0B;">sketches</p>
        </td>
        <td align="center" style="padding:0 20px;">
          <p style="margin:0; font-size:20px; font-weight:600; color:#412402;">&#128293; ${data.currentStreak}</p>
          <p style="margin:2px 0 0; font-size:11px; color:#854F0B;">day streak</p>
        </td>
      </tr>
    </table>`;

  const reactionsSection =
    data.highlightThumbnailUrl && data.reactionCounts
      ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e3da; border-radius:12px; margin-top:20px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 10px; font-size:13px; font-weight:600; color:#111111; text-align:center;">Loved this week</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              <td style="padding-right:12px;">
                <img src="${data.highlightThumbnailUrl}" width="56" height="56" alt="" style="display:block; width:56px; height:56px; border-radius:8px; object-fit:cover;" />
              </td>
              <td>${renderReactionChips(data.reactionCounts)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`
      : "";

  const thumbnailsSection =
    data.thumbnailUrls.length > 0
      ? `
    <p style="margin:20px 0 8px; font-size:13px; font-weight:600; color:#111111; text-align:center;">This week&rsquo;s sketches</p>
    ${renderThumbnails(data.thumbnailUrls)}`
      : "";

  const themeProgressPct = Math.round((data.dayOfMonth / data.daysInMonth) * 100);
  const themeSection = data.themeName
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f7f6f2; border-radius:12px; margin-top:20px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px; font-size:13px; font-weight:600; color:#111111; text-align:center;">
            Day ${data.dayOfMonth} of ${data.daysInMonth} into &ldquo;${data.themeName}&rdquo;
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td height="8" bgcolor="#e5e3da" style="background-color:#e5e3da; border-radius:999px; font-size:0; line-height:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${themeProgressPct}%">
                  <tr><td height="8" bgcolor="${FILLED}" style="background-color:${FILLED}; border-radius:999px; font-size:0; line-height:0;">&nbsp;</td></tr>
                </table>
              </td>
            </tr>
          </table>
          ${
            data.todaysPromptText
              ? `<p style="margin:12px 0 0; font-size:12px; color:#555555; text-align:center;">Today&rsquo;s prompt: <strong>${data.todaysPromptText}</strong></p>`
              : ""
          }
        </td>
      </tr>
    </table>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject}</title>
</head>
<body style="margin:0; padding:0;">
<div style="background-color:#ffffff; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;">
          <tr>
            <td style="padding-bottom:16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:14px; font-weight:600; color:#111111;">AtomicSketches</td>
                  <td align="right">
                    <span style="background-color:#FAEEDA; color:#854F0B; border-radius:999px; padding:3px 10px; font-size:12px;">&#128293; ${data.currentStreak}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <p style="margin:0; font-size:22px; color:#111111;">Your sketching</p>
              <p style="margin:0; font-size:22px; color:#3B6D11; font-weight:600;">week in review</p>
              <p style="margin:12px 0 0; font-size:13px; color:#666666; line-height:1.6;">
                Hi ${data.name}, you showed up for your sketchnoting practice this week. Here&rsquo;s what you made and who it reached.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <a href="${data.appUrl}" style="background-color:#639922; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; padding:12px 28px; border-radius:8px; display:inline-block;">Open the gallery</a>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FAEEDA; border-radius:12px; padding:16px 0;">
              <p style="margin:0 0 10px; font-size:13px; font-weight:600; color:#412402; text-align:center;">What your week looked like</p>
              ${statsRow}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:20px;">
              <p style="margin:0 0 8px; font-size:13px; font-weight:600; color:#111111;">Where you landed this week</p>
              ${renderPositionGrid(data.weekPositions)}
            </td>
          </tr>
          <tr>
            <td>${reactionsSection}</td>
          </tr>
          <tr>
            <td align="center">${thumbnailsSection}</td>
          </tr>
          <tr>
            <td>${themeSection}</td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 0 16px;">
              <p style="margin:0 0 4px; font-size:16px; font-weight:600; color:#111111;">Keep the streak alive</p>
              <p style="margin:0 0 14px; font-size:12px; color:#666666;">One sketch a day keeps the practice going.</p>
              <a href="${data.appUrl}" style="background-color:#639922; color:#ffffff; text-decoration:none; font-size:13px; font-weight:600; padding:10px 22px; border-radius:8px; display:inline-block;">Sketch today</a>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e5e3da; padding-top:12px;">
              <p style="margin:0; font-size:11px; color:#999999; text-align:center; line-height:1.6;">
                You&rsquo;re getting this because you sketched 3+ times this week.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;

  return { subject, html };
}
