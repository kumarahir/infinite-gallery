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
  created_at: string;
}

const BUCKET = "cells-images";

export async function fetchCellAt(x: number, y: number): Promise<CellRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .select("*")
    .eq("x", x)
    .eq("y", y)
    .maybeSingle();

  if (error) throw error;
  return (data as CellRow) ?? null;
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
    .select("*")
    .gte("x", minX)
    .lt("x", maxX)
    .gte("y", minY)
    .lt("y", maxY);

  if (error) throw error;
  return (data ?? []) as CellRow[];
}

export class CellTakenError extends Error {
  constructor() {
    super("Someone just filled this cell.");
    this.name = "CellTakenError";
  }
}

async function insertCell(row: {
  x: number;
  y: number;
  cell_type: "image" | "text";
  text_content?: string;
  image_path?: string;
  image_width?: number;
  image_height?: number;
  created_by: string;
}): Promise<CellRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cells")
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new CellTakenError();
    throw error;
  }
  return data as CellRow;
}

export function getPublicImageUrl(imagePath: string): string {
  const supabase = createClient();
  return supabase.storage.from(BUCKET).getPublicUrl(imagePath).data.publicUrl;
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
  userId: string
): Promise<CellRow> {
  const supabase = createClient();
  const path = `${userId}/${nanoid()}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/webp" });

  if (uploadError) throw uploadError;

  return insertCell({
    x,
    y,
    cell_type: "image",
    image_path: path,
    image_width: width,
    image_height: height,
    created_by: userId,
  });
}
