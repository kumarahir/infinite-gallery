import { NextResponse } from "next/server";
import { Resend } from "resend";

// Called by a Supabase Database Webhook on INSERT into public.profiles,
// which already fires for every new signup via the existing
// handle_new_user() trigger. Guarded by a shared secret header (set the
// same value in the webhook config and SUPABASE_WEBHOOK_SECRET) since this
// endpoint is publicly reachable and would otherwise let anyone trigger
// emails with an arbitrary address.
export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    type?: string;
    table?: string;
    record?: { email?: string; display_name?: string | null };
  };

  if (payload.table !== "profiles" || payload.type !== "INSERT") {
    return NextResponse.json({ error: "Ignored" }, { status: 200 });
  }

  const email = payload.record?.email;
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const name = payload.record?.display_name || email.split("@")[0];
  const resend = new Resend(process.env.RESEND_API_KEY);

  // The Resend SDK returns { data, error } rather than throwing on API-level
  // failures (bad key, unverified domain, etc.) — only network-level faults
  // throw. Both cases need handling here.
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "AtomicSketches <onboarding@resend.dev>",
      to: email,
      subject: "Welcome to AtomicSketches!",
      html: `<p>Hi ${name},</p><p>Welcome to AtomicSketches — a shared, infinite canvas where sketch artists post and browse each other's work.</p><p>Jump back in any time: <a href="https://infinite-gallery-snowy-omega.vercel.app/">infinite-gallery-snowy-omega.vercel.app</a></p><p>Happy sketching!</p>`,
    });

    if (error) {
      console.error("Resend rejected the welcome email", error);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }
  } catch (err) {
    console.error("Failed to send welcome email", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
