export interface ContributionDay {
  date: string;
  count: number;
}

// Bucket boundaries are arbitrary — just enough steps to make more-active
// days visibly darker than a single upload, GitHub-heatmap style.
function levelFor(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

const LEVEL_CLASSES = [
  "bg-black/5 dark:bg-white/10",
  "bg-amber-200 dark:bg-amber-900/60",
  "bg-amber-400 dark:bg-amber-700",
  "bg-amber-500 dark:bg-amber-600",
  "bg-amber-600 dark:bg-amber-500",
];

// First letter of each day, Sunday-first — matches how `days` is aligned
// by the caller (profile page).
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function dateOf(day: ContributionDay): Date {
  // Dates are plain "YYYY-MM-DD" strings meant as UTC calendar days — the
  // explicit T00:00:00Z avoids the browser's local timezone shifting which
  // day (and therefore which date-of-month/month) a cell reads as.
  return new Date(`${day.date}T00:00:00Z`);
}

// Labels a week row with a month name only when that week contains the 1st
// of a month — matches GitHub's own convention of labeling only where a
// month actually starts, rather than repeating the label on every row.
function monthLabelForWeek(week: ContributionDay[]): string | null {
  const firstOfMonth = week.find((day) => dateOf(day).getUTCDate() === 1);
  if (!firstOfMonth) return null;
  return MONTH_LABELS[dateOf(firstOfMonth).getUTCMonth()];
}

// Purely presentational — the caller (profile page) already produced one
// entry per day covering the full range, aligned so `days` starts on a
// Sunday, so this just needs to chunk it into 7-day week rows.
export default function ContributionCalendar({ days }: { days: ContributionDay[] }) {
  const weeks: ContributionDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
        Contribution activity
      </h2>
      <div className="overflow-x-auto">
        <div className="flex flex-col gap-[3px] w-max">
          <div className="flex items-center gap-[3px]">
            <div className="w-8 shrink-0" />
            <div className="grid grid-cols-7 gap-[3px]">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="w-6 h-6 flex items-center justify-center text-[9px] leading-none text-black/40 dark:text-white/40"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
          {weeks.map((week, i) => (
            <div key={i} className="flex items-center gap-[3px]">
              <div className="w-8 shrink-0 pr-1 text-right text-[9px] leading-none text-black/40 dark:text-white/40">
                {monthLabelForWeek(week)}
              </div>
              <div className="grid grid-cols-7 gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.count} upload${day.count === 1 ? "" : "s"}`}
                    className={`w-6 h-6 rounded-sm flex items-center justify-center text-[9px] leading-none text-black/60 dark:text-white/70 ${LEVEL_CLASSES[levelFor(day.count)]}`}
                  >
                    {dateOf(day).getUTCDate()}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-black/40 dark:text-white/40 self-end">
        <span>Less</span>
        {LEVEL_CLASSES.map((cls, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
