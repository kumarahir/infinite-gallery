import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// Called once daily by Vercel Cron (see vercel.json). A scheduled job has no
// logged-in user, so it can't go through the normal per-user RLS path the
// rest of the app uses — it authenticates with the same shared-secret model
// as the welcome-email webhook instead, just passed as an RPC parameter
// (compared against a Postgres GUC) rather than an HTTP header, since the
// checks it needs live in the database. See get_streak_reminder_candidates
// and mark_streak_reminders_sent in supabase/schema.sql.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: candidates, error } = await supabase.rpc("get_streak_reminder_candidates", {
    p_secret: process.env.CRON_SECRET,
  });

  if (error) {
    console.error("Failed to fetch streak reminder candidates", error);
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

  const resend = new Resend(process.env.RESEND_API_KEY);
  const remindedIds: string[] = [];

  for (const row of rows) {
    const name = row.display_name || row.email.split("@")[0];
    try {
      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "AtomicSketches <onboarding@resend.dev>",
        to: row.email,
        subject: "Your AtomicSketches streak is waiting for you",
        html: `<p>Hi ${name},</p><p>You had a ${row.current_streak}-day sketching streak going, but it's been a couple of days since your last upload. Jump back in and pick it back up: <a href="https://infinite-gallery-snowy-omega.vercel.app/">infinite-gallery-snowy-omega.vercel.app</a></p><p>Happy sketching!</p>`,
      });

      if (sendError) {
        console.error("Resend rejected a streak reminder", row.id, sendError);
      } else {
        remindedIds.push(row.id);
      }
    } catch (err) {
      console.error("Failed to send streak reminder", row.id, err);
    }
  }

  if (remindedIds.length > 0) {
    const { error: markError } = await supabase.rpc("mark_streak_reminders_sent", {
      p_secret: process.env.CRON_SECRET,
      p_user_ids: remindedIds,
    });
    if (markError) {
      console.error("Failed to mark streak reminders as sent", markError);
    }
  }

  return NextResponse.json({ ok: true, sent: remindedIds.length });
}
