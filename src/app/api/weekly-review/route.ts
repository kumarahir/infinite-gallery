import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { getPublicImageUrl } from "@/lib/cells";
import { buildWeeklyReviewEmail, type WeeklyReviewPosition } from "@/lib/weeklyReviewEmail";
import type { Emotion } from "@/lib/reactions";

const APP_URL = "https://infinite-gallery-snowy-omega.vercel.app/";

// Called once a week by Vercel Cron (see vercel.json — Saturday 18:00 IST,
// a single fixed timezone for v1 rather than per-user). Only artists with
// 3+ image uploads in the trailing 7 days qualify (see
// get_weekly_review_candidates in schema.sql); anyone with 1-2 uploads
// keeps getting the existing streak-reminders email instead — these two
// crons deliberately target non-overlapping segments.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: candidates, error } = await supabase.rpc("get_weekly_review_candidates", {
    p_secret: process.env.CRON_SECRET,
  });

  if (error) {
    console.error("Failed to fetch weekly review candidates", error);
    return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
  }

  const rows = (candidates ?? []) as {
    id: string;
    email: string;
    display_name: string | null;
    current_streak: number;
  }[];

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const { data: defaultTheme } = await supabase
    .from("themes")
    .select("id, name")
    .eq("is_default", true)
    .maybeSingle();

  // No explicit theme start/end date exists yet (themes aren't month-scoped
  // — see the earlier discussion on adding that), so this approximates
  // "day X of the theme" as the calendar day-of-month, same convention
  // theme_prompts already uses for "today's prompt".
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();

  let todaysPromptText: string | null = null;
  if (defaultTheme) {
    const { data: prompt } = await supabase
      .from("theme_prompts")
      .select("prompt_text")
      .eq("theme_id", defaultTheme.id)
      .eq("day_of_month", dayOfMonth)
      .maybeSingle();
    todaysPromptText = prompt?.prompt_text ?? null;
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sentIds: string[] = [];

  for (const row of rows) {
    try {
      const { data: weekCells } = await supabase
        .from("cells")
        .select("id, x, y, image_path, thumbnail_path, created_at")
        .eq("created_by", row.id)
        .eq("cell_type", "image")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false });

      const cellsThisWeek = (weekCells ?? []).filter((c) => c.image_path || c.thumbnail_path);
      // Guards against a race between candidate selection and this fetch
      // (e.g. a sketch deleted in between) rather than sending a hollow email.
      if (cellsThisWeek.length === 0) continue;

      const positions: WeeklyReviewPosition[] = cellsThisWeek.map((c) => ({ x: c.x, y: c.y }));
      const thumbnailUrls = cellsThisWeek
        .slice(0, 4)
        .map((c) => getPublicImageUrl(c.thumbnail_path ?? c.image_path ?? ""));

      const highlight = cellsThisWeek[0];
      const highlightThumbnailUrl = getPublicImageUrl(
        highlight.thumbnail_path ?? highlight.image_path ?? ""
      );

      const { data: reactionRows } = await supabase
        .from("cell_reactions")
        .select("emotion")
        .eq("cell_id", highlight.id);

      let reactionCounts: Record<Emotion, number> | null = null;
      if (reactionRows && reactionRows.length > 0) {
        reactionCounts = { inspired: 0, proud: 0, joyful: 0, confident: 0, loved: 0 };
        for (const r of reactionRows) {
          const emotion = r.emotion as Emotion;
          reactionCounts[emotion] = (reactionCounts[emotion] ?? 0) + 1;
        }
      }

      const name = row.display_name || row.email.split("@")[0];
      const { subject, html } = buildWeeklyReviewEmail({
        name,
        currentStreak: row.current_streak,
        sketchCount: cellsThisWeek.length,
        weekPositions: positions,
        thumbnailUrls,
        highlightThumbnailUrl,
        reactionCounts,
        themeName: defaultTheme?.name ?? null,
        dayOfMonth,
        daysInMonth,
        todaysPromptText,
        appUrl: APP_URL,
      });

      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "AtomicSketches <onboarding@resend.dev>",
        to: row.email,
        subject,
        html,
      });

      if (sendError) {
        console.error("Resend rejected a weekly review email", row.id, sendError);
      } else {
        sentIds.push(row.id);
      }
    } catch (err) {
      console.error("Failed to build/send weekly review email", row.id, err);
    }
  }

  if (sentIds.length > 0) {
    const { error: markError } = await supabase.rpc("mark_weekly_review_sent", {
      p_secret: process.env.CRON_SECRET,
      p_user_ids: sentIds,
    });
    if (markError) {
      console.error("Failed to mark weekly review emails as sent", markError);
    }
  }

  return NextResponse.json({ ok: true, sent: sentIds.length });
}
