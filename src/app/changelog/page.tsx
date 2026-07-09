import Link from "next/link";

// Curated, user-facing summary of what's shipped — grouped by day, newest
// first. Not a raw commit log: same-day fixes/iterations on one feature are
// folded into a single entry rather than listed as separate churn.
const CHANGELOG: { date: string; changes: string[] }[] = [
  {
    date: "July 9, 2026",
    changes: ["Moved the sketch filters into quick-access icons in the main toolbar."],
  },
  {
    date: "July 8, 2026",
    changes: [
      "Added a welcome email for new signups.",
      "Added a way to view just your own sketches, or filter by theme, clustered together for easy browsing.",
    ],
  },
  {
    date: "July 7, 2026",
    changes: ["Added the recenter (home) button on desktop."],
  },
  {
    date: "July 6, 2026",
    changes: [
      "Brought the mobile minimap radar to desktop too, shown while panning.",
      "Polished the radar's sweep animation and colors.",
      "Highlighted your own uploaded sketches with a colored border, both on the minimap and in the gallery grid.",
      "Added anonymous usage analytics.",
    ],
  },
  {
    date: "July 5, 2026",
    changes: ["Re-enabled swipe-to-pan on mobile, alongside the joystick."],
  },
  {
    date: "July 4, 2026",
    changes: [
      "Added a subtle hover animation on desktop.",
      "Fixed a bug that was briefly breaking all image uploads.",
      "Added a mobile minimap radar, shown while panning.",
    ],
  },
  {
    date: "July 3, 2026",
    changes: [
      "Added a confetti celebration and thank-you message on successful uploads.",
      "Capped uploaded images at 2MB with a loading spinner while they load.",
      "Showed the uploader's name on each sketch, without exposing their email.",
      "Replaced double-tap recenter with a dedicated recenter button.",
      "Added sketch themes and an admin page to manage them.",
      "Fixed mobile popup layout issues (stacking, close button, oversized images).",
      "Added user management (login/upload permissions) to the admin page.",
      "Added per-user and per-theme upload counts, plus a way to reset daily limits.",
      "Clarified the message shown when upload permission is denied.",
    ],
  },
  {
    date: "July 2, 2026",
    changes: [
      "Launched AtomicSketches — a shared, infinite canvas gallery for sketch artists.",
      "Added a lightbox view, sharing, and admin moderation tools.",
      "Replaced touch-drag panning with a joystick control on mobile.",
      "Limited non-admin users to 5 image uploads per day.",
      "Added an About popup explaining the app and upload rules.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-dvh p-6 max-w-lg mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">What&rsquo;s new</h1>
        <Link href="/" className="text-sm underline text-black/60 dark:text-white/60">
          Back to gallery
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {CHANGELOG.map((entry) => (
          <div key={entry.date} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
              {entry.date}
            </h2>
            <ul className="list-disc pl-5 flex flex-col gap-1 text-sm leading-relaxed text-black/80 dark:text-white/80">
              {entry.changes.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
