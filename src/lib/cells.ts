import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/client";

export interface CellRow {
  id: number;
  x: number;
  y: number;
  cell_type: "image" | "text";
  text_content: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  theme_id: number | null;
  themes: { name: string } | null;
}

export interface Theme {
  id: number;
  name: string;
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

export async function fetchCellAt(x: number, y: number): Promise<CellRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select(CELL_SELECT)
    .eq("x", x)
    .eq("y", y)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as CellRow) ?? null;
}

export async function deleteCell(cell: CellRow): Promise<void> {
  const supabase = createClient();
  if (cell.cell_type === "image" && cell.image_path) {
    await supabase.storage.from(BUCKET).remove([cell.image_path]);
  }
  const { error } = await supabase.from("cells").delete().eq("id", cell.id);
  if (error) throw error;
}

export async function fetchCellsInRange(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Promise<CellRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select(CELL_SELECT)
    .gte("x", minX)
    .lt("x", maxX)
    .gte("y", minY)
    .lt("y", maxY);

  if (error) throw error;
  return (data ?? []) as unknown as CellRow[];
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
}

// Lightweight — just two integers per row — for the mobile minimap radar,
// which plots every image as a single dot. Fetched once and kept in sync
// client-side afterward rather than re-queried, since the app's current
// scale makes a full fetch far simpler than a proximity query.
export async function fetchAllImageCoords(): Promise<CellCoord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select("x, y")
    .eq("cell_type", "image");

  if (error) throw error;
  return (data ?? []) as CellCoord[];
}

export async function fetchTotalImageCount(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("cells")
    .select("id", { count: "exact", head: true })
    .eq("cell_type", "image");

  if (error) throw error;
  return count ?? 0;
}

export interface UploadCounts {
  images: number;
  text: number;
}

export async function fetchUploadCountsByUser(): Promise<Map<string, UploadCounts>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("cells").select("created_by, cell_type");
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

export async function fetchUploadCountsByTheme(): Promise<Map<number, number>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select("theme_id")
    .eq("cell_type", "image");
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
  image_width?: number;
  image_height?: number;
  theme_id?: number | null;
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
  userId: string
): Promise<CellRow> {
  return insertCell({
    x,
    y,
    cell_type: "text",
    text_content: text,
    created_by: userId,
  });
}

export async function insertImageCell(
  x: number,
  y: number,
  blob: Blob,
  width: number,
  height: number,
  userId: string,
  themeId: number | null
): Promise<CellRow> {
  const supabase = createClient();
  const path = `${userId}/${nanoid()}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/webp" });

  if (uploadError) throw uploadError;

  try {
    return await insertCell({
      x,
      y,
      cell_type: "image",
      image_path: path,
      image_width: width,
      image_height: height,
      theme_id: themeId,
      created_by: userId,
    });
  } catch (err) {
    // Row insert failed (e.g. daily limit, or someone else just took this
    // cell) — clean up the file we just uploaded so it doesn't linger.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw err;
  }
}
