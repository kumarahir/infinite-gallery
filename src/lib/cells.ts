import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/client";

export interface CellRow {
  id: number;
  x: number;
  y: number;
  cell_type: "image" | "text";
  text_content: string | null;
  image_path: string | null;
  // Small dedicated thumbnail generated at upload time (see
  // resizeImageWithThumbnail) — null for cells uploaded before this existed,
  // in which case the grid falls back to image_path.
  thumbnail_path: string | null;
  image_width: number | null;
  image_height: number | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  theme_id: number | null;
  // Set when the uploader picked a specific prompt from the default theme's
  // dropdown (see AddCellModal) — lets consumers show that exact prompt
  // instead of inferring one from the upload date. Null for the "Generic"
  // theme (its keyword-prompts aren't tied to individual sketches) and for
  // cells uploaded before this existed.
  theme_prompt_id: number | null;
  // Null for a community cell; the owner's user id for a cell in that
  // user's private personal gallery — a second, per-user (x,y) plane
  // sharing this same table (see cells_unique_coord_personal_idx and the
  // RLS split in schema.sql's v3.0 section).
  personal_owner_id: string | null;
  themes: { name: string } | null;
}

export interface Theme {
  id: number;
  name: string;
  is_default: boolean;
}

const BUCKET = "cells-images";
const CELL_SELECT = "*, themes(name)";

export async function fetchThemes(): Promise<Theme[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("themes").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Theme[];
}

export async function addTheme(name: string): Promise<Theme> {
  const supabase = createClient();
  const { data, error } = await supabase.from("themes").insert({ name }).select().single();
  if (error) throw error;
  return data as Theme;
}

export async function removeTheme(id: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("themes").delete().eq("id", id);
  if (error) throw error;
}

// Routed through an RPC — the function flips is_default on every row in one
// statement so exactly one theme is ever the default, and re-checks
// is_admin() server-side regardless of what the calling UI restricts to.
export async function setDefaultTheme(id: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_default_theme", { p_theme_id: id });
  if (error) throw error;
}

// `personalOwnerId` selects which (x,y) plane to read: omitted/null means
// the shared community plane, a uuid means that user's own personal plane
// (only ever their own — RLS blocks anyone else's).
export async function fetchCellAt(
  x: number,
  y: number,
  personalOwnerId?: string | null
): Promise<CellRow | null> {
  const supabase = createClient();
  let query = supabase.from("cells").select(CELL_SELECT).eq("x", x).eq("y", y);
  query = personalOwnerId
    ? query.eq("personal_owner_id", personalOwnerId)
    : query.is("personal_owner_id", null);
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return (data as unknown as CellRow) ?? null;
}

// Backs opening the gallery centered on the signed-in artist's own most
// recent upload instead of the default origin — just the coordinates, not
// the full row, since the caller only needs them to center the view (the
// normal chunk-loading path fetches the actual cell once panned there).
export async function fetchLastImageCellByUser(
  userId: string,
  personalOwnerId?: string | null
): Promise<{ x: number; y: number } | null> {
  const supabase = createClient();
  let query = supabase
    .from("cells")
    .select("x, y")
    .eq("created_by", userId)
    .eq("cell_type", "image");
  query = personalOwnerId
    ? query.eq("personal_owner_id", personalOwnerId)
    : query.is("personal_owner_id", null);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function deleteCell(cell: CellRow): Promise<void> {
  const supabase = createClient();
  if (cell.cell_type === "image") {
    const paths = [cell.image_path, cell.thumbnail_path].filter((p): p is string => !!p);
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths);
    }
  }
  const { error } = await supabase.from("cells").delete().eq("id", cell.id);
  if (error) throw error;
}

export async function fetchCellsInRange(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  personalOwnerId?: string | null
): Promise<CellRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("cells")
    .select(CELL_SELECT)
    .gte("x", minX)
    .lt("x", maxX)
    .gte("y", minY)
    .lt("y", maxY);
  query = personalOwnerId
    ? query.eq("personal_owner_id", personalOwnerId)
    : query.is("personal_owner_id", null);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as CellRow[];
}

export interface CellFilter {
  onlyMine?: boolean;
  themeId?: number | null;
  // Caps the result set — used by the landing overlay's theme preview
  // (a handful of thumbnails), left unset for the real clustered/filtered
  // browse mode which still wants every match.
  limit?: number;
}

// Backs the clustered/filtered browse mode — always image cells (themes and
// "my sketches" both only make sense for images), ordered newest-first, no
// pagination yet since the app's current scale makes a full fetch simplest.
// `personalOwnerId` scopes the whole query to that user's personal plane
// instead of the shared community one.
export async function fetchFilteredCells(
  filter: CellFilter,
  userId?: string,
  personalOwnerId?: string | null
): Promise<CellRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("cells")
    .select(CELL_SELECT)
    .eq("cell_type", "image")
    .order("created_at", { ascending: false });
  query = personalOwnerId
    ? query.eq("personal_owner_id", personalOwnerId)
    : query.is("personal_owner_id", null);

  if (filter.onlyMine && userId) {
    query = query.eq("created_by", userId);
  }
  if (filter.themeId != null) {
    query = query.eq("theme_id", filter.themeId);
  }
  if (filter.limit != null) {
    query = query.limit(filter.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as CellRow[];
}

// Lightweight head-count for the landing overlay's "this month's theme"
// badge — a plain count query rather than fetchUploadCountsByTheme's
// fetch-every-row approach, since this only ever needs one theme's total.
// Community-only (landing overlay's "this month's theme" badge is about the
// shared gallery, not anyone's private practice space) — hardcoded rather
// than parameterized since this is never meant to count personal cells.
export async function fetchThemeImageCount(themeId: number): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("cells")
    .select("id", { count: "exact", head: true })
    .eq("cell_type", "image")
    .eq("theme_id", themeId)
    .is("personal_owner_id", null);
  if (error) throw error;
  return count ?? 0;
}

// Backs the landing overlay's "consistent artists" thumbnails — one query
// for every artist rather than one per card. Ordered newest-first so the
// first row seen per user, kept via the Map's insert-if-absent below, is
// their latest. Community-only, hardcoded — showing someone's private
// personal sketch on a public "consistent artists" showcase would be wrong
// even for the artist's own account (RLS lets you see your own personal
// rows, but this view is specifically about the shared gallery).
export async function fetchLatestImageCellByUsers(
  userIds: string[]
): Promise<Map<string, CellRow>> {
  if (userIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select(CELL_SELECT)
    .eq("cell_type", "image")
    .in("created_by", userIds)
    .is("personal_owner_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const latest = new Map<string, CellRow>();
  for (const row of (data ?? []) as unknown as CellRow[]) {
    if (!latest.has(row.created_by)) latest.set(row.created_by, row);
  }
  return latest;
}

export class CellTakenError extends Error {
  constructor() {
    super("Someone just filled this cell.");
    this.name = "CellTakenError";
  }
}

export class DailyLimitError extends Error {
  constructor() {
    super("Daily image upload limit reached.");
    this.name = "DailyLimitError";
  }
}

// Non-admins may upload at most 5 images per UTC calendar day — this is
// also enforced in the `cells_insert_authenticated` RLS policy (the real
// guarantee, since it can't be bypassed), but checking here first avoids
// uploading a file to storage just to have the row insert rejected. Mirrors
// the policy's own cutoff: whichever is later, start of today or an
// admin-set upload_limit_reset_at (an admin "reset the limit" action).
export async function fetchTodayImageUploadCount(userId: string): Promise<number> {
  const supabase = createClient();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { data: profile } = await supabase
    .from("profiles")
    .select("upload_limit_reset_at")
    .eq("id", userId)
    .maybeSingle();

  const resetAt = profile?.upload_limit_reset_at ? new Date(profile.upload_limit_reset_at) : null;
  const cutoff = resetAt && resetAt > startOfDay ? resetAt : startOfDay;

  const { count, error } = await supabase
    .from("cells")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .eq("cell_type", "image")
    .gte("created_at", cutoff.toISOString());

  if (error) throw error;
  return count ?? 0;
}

export interface CellCoord {
  x: number;
  y: number;
  created_by: string;
}

// Lightweight — just two integers plus the uploader id per row — for the
// minimap radar, which plots every image as a single dot (colored
// differently for the current user's own uploads). Fetched once and kept in
// sync client-side afterward rather than re-queried, since the app's current
// scale makes a full fetch far simpler than a proximity query.
export async function fetchAllImageCoords(personalOwnerId?: string | null): Promise<CellCoord[]> {
  const supabase = createClient();
  let query = supabase.from("cells").select("x, y, created_by").eq("cell_type", "image");
  query = personalOwnerId
    ? query.eq("personal_owner_id", personalOwnerId)
    : query.is("personal_owner_id", null);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CellCoord[];
}

// All occupied community coordinates (any cell type) — used by the admin
// bulk-upload flow (always community-scoped) to pick genuinely empty cells,
// and by publishToCommunity's placement search below. Community-only,
// hardcoded: both callers are exclusively about the shared plane.
export async function fetchOccupiedCoords(): Promise<{ x: number; y: number }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select("x, y")
    .is("personal_owner_id", null);
  if (error) throw error;
  return (data ?? []) as { x: number; y: number }[];
}

// Community-only, hardcoded — this backs the About popup's public "sketches
// so far" count, not a per-user total.
export async function fetchTotalImageCount(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("cells")
    .select("id", { count: "exact", head: true })
    .eq("cell_type", "image")
    .is("personal_owner_id", null);

  if (error) throw error;
  return count ?? 0;
}

export interface UploadCounts {
  images: number;
  text: number;
}

// Community-only, hardcoded — the admin panel's per-user counts are about
// moderating the shared gallery, not a census of everyone's private sketches.
export async function fetchUploadCountsByUser(): Promise<Map<string, UploadCounts>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select("created_by, cell_type")
    .is("personal_owner_id", null);
  if (error) throw error;

  const counts = new Map<string, UploadCounts>();
  for (const row of data ?? []) {
    const entry = counts.get(row.created_by) ?? { images: 0, text: 0 };
    if (row.cell_type === "image") entry.images += 1;
    else entry.text += 1;
    counts.set(row.created_by, entry);
  }
  return counts;
}

// Community-only, hardcoded — same reasoning as fetchUploadCountsByUser.
export async function fetchUploadCountsByTheme(): Promise<Map<number, number>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select("theme_id")
    .eq("cell_type", "image")
    .is("personal_owner_id", null);
  if (error) throw error;

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    if (row.theme_id == null) continue;
    counts.set(row.theme_id, (counts.get(row.theme_id) ?? 0) + 1);
  }
  return counts;
}

async function insertCell(row: {
  x: number;
  y: number;
  cell_type: "image" | "text";
  text_content?: string;
  image_path?: string;
  thumbnail_path?: string;
  image_width?: number;
  image_height?: number;
  theme_id?: number | null;
  theme_prompt_id?: number | null;
  personal_owner_id?: string | null;
  created_by: string;
}): Promise<CellRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .insert(row)
    .select(CELL_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") throw new CellTakenError();
    if (error.code === "42501") throw new DailyLimitError();
    throw error;
  }
  return data as unknown as CellRow;
}

// Public storage URLs are deterministic — build the string directly rather
// than spinning up a full Supabase client (auth/storage/realtime setup) on
// every call. This runs once per image cell on every render, so avoiding
// that overhead matters a lot on slower mobile CPUs.
export function getPublicImageUrl(imagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${imagePath}`;
}

export async function insertTextCell(
  x: number,
  y: number,
  text: string,
  userId: string,
  personalOwnerId?: string | null
): Promise<CellRow> {
  return insertCell({
    x,
    y,
    cell_type: "text",
    text_content: text,
    created_by: userId,
    personal_owner_id: personalOwnerId ?? null,
  });
}

export async function insertImageCell(params: {
  x: number;
  y: number;
  blob: Blob;
  width: number;
  height: number;
  thumbnailBlob: Blob;
  userId: string;
  themeId: number | null;
  themePromptId?: number | null;
  personalOwnerId?: string | null;
}): Promise<CellRow> {
  const {
    x,
    y,
    blob,
    width,
    height,
    thumbnailBlob,
    userId,
    themeId,
    themePromptId,
    personalOwnerId,
  } = params;
  const supabase = createClient();
  const path = `${userId}/${nanoid()}.webp`;
  const thumbnailPath = `${userId}/${nanoid()}-thumb.webp`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/webp" });
  if (uploadError) throw uploadError;

  const { error: thumbnailUploadError } = await supabase.storage
    .from(BUCKET)
    .upload(thumbnailPath, thumbnailBlob, { contentType: "image/webp" });
  if (thumbnailUploadError) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw thumbnailUploadError;
  }

  try {
    return await insertCell({
      x,
      y,
      cell_type: "image",
      image_path: path,
      thumbnail_path: thumbnailPath,
      image_width: width,
      image_height: height,
      theme_id: themeId,
      theme_prompt_id: themePromptId ?? null,
      personal_owner_id: personalOwnerId ?? null,
      created_by: userId,
    });
  } catch (err) {
    // Row insert failed (e.g. daily limit, or someone else just took this
    // cell) — clean up the files we just uploaded so they don't linger.
    await Promise.all([
      supabase.storage.from(BUCKET).remove([path]).catch(() => {}),
      supabase.storage.from(BUCKET).remove([thumbnailPath]).catch(() => {}),
    ]);
    throw err;
  }
}

// Neighbor offsets for one Chebyshev-distance ring around (0,0) — ring 1 is
// the 8 immediate neighbors, ring 2 the 16 cells at distance 2, etc. Walks
// the ring's own perimeter rather than a full (2r+1)^2 box scan.
function ringOffsets(radius: number): { dx: number; dy: number }[] {
  const offsets: { dx: number; dy: number }[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) offsets.push({ dx, dy });
    }
  }
  return offsets;
}

const MAX_PLACEMENT_RING = 30;
const MAX_PLACEMENT_ATTEMPTS = 3;

// Picks a random empty community cell adjacent to whichever cell the
// community most recently added, expanding outward ring by ring if the
// immediate neighbors are all taken. `occupied` is mutated in place (adding
// a coordinate that just lost an insert race) so a retry never recomputes
// the exact same already-failed pick.
function pickPlacement(
  center: { x: number; y: number },
  occupied: Set<string>
): { x: number; y: number } | null {
  for (let radius = 1; radius <= MAX_PLACEMENT_RING; radius++) {
    const candidates = ringOffsets(radius)
      .map(({ dx, dy }) => ({ x: center.x + dx, y: center.y + dy }))
      .filter((c) => !occupied.has(`${c.x}:${c.y}`));
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  return null;
}

export class PublishPlacementError extends Error {
  constructor() {
    super("Couldn't find a spot to publish this sketch — try again.");
    this.name = "PublishPlacementError";
  }
}

// Publishes an already-uploaded personal sketch into the community gallery,
// reusing the same image/thumbnail (no re-upload) at a random empty cell
// next to the community's most recently added cell. This is a second
// image-row insert, so — deliberately, per product decision — it counts
// against the same shared 5-per-day upload budget as any other image.
export async function publishToCommunity(params: {
  imagePath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  themeId: number | null;
  themePromptId: number | null;
  userId: string;
}): Promise<CellRow> {
  const { imagePath, thumbnailPath, width, height, themeId, themePromptId, userId } = params;
  const supabase = createClient();

  const { data: recent, error: recentError } = await supabase
    .from("cells")
    .select("x, y")
    .is("personal_owner_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentError) throw recentError;
  const center = recent ?? { x: 0, y: 0 };

  const occupiedRows = await fetchOccupiedCoords();
  const occupied = new Set(occupiedRows.map((c) => `${c.x}:${c.y}`));

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
    const spot = pickPlacement(center, occupied);
    if (!spot) throw new PublishPlacementError();
    try {
      return await insertCell({
        x: spot.x,
        y: spot.y,
        cell_type: "image",
        image_path: imagePath,
        thumbnail_path: thumbnailPath,
        image_width: width,
        image_height: height,
        theme_id: themeId,
        theme_prompt_id: themePromptId,
        personal_owner_id: null,
        created_by: userId,
      });
    } catch (err) {
      if (!(err instanceof CellTakenError)) throw err;
      // Someone else took that exact cell in the race between the occupied
      // fetch above and this insert — record it locally and retry the
      // search rather than re-fetching from the DB.
      occupied.add(`${spot.x}:${spot.y}`);
      lastError = err;
    }
  }
  throw lastError ?? new PublishPlacementError();
}
