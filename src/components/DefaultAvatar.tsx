const PALETTE = [
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#8B5CF6",
  "#6366F1",
  "#3B82F6",
  "#06B6D4",
  "#10B981",
  "#84CC16",
  "#F59E0B",
];

// A handful of loose squiggle paths, picked by seed alongside the color —
// just visual variety, not meant to represent anything.
const SCRIBBLES = [
  "M20,60 Q30,20 50,50 T80,40",
  "M15,50 Q40,10 50,50 Q60,90 85,50",
  "M20,30 Q50,80 80,30 Q60,60 40,20",
  "M20,70 C30,20 70,20 80,70 C60,50 40,50 20,70",
  "M25,25 Q75,25 25,75 Q75,75 25,25",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Deterministic per-seed (typically a user id) so the same person always
// gets the same placeholder rather than a new random one on every render.
export default function DefaultAvatar({ seed, size = 40 }: { seed: string; size?: number }) {
  const hash = hashString(seed);
  const color = PALETTE[hash % PALETTE.length];
  const scribble = SCRIBBLES[Math.floor(hash / PALETTE.length) % SCRIBBLES.length];

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="block">
      <circle cx="50" cy="50" r="50" fill={color} />
      <path
        d={scribble}
        fill="none"
        stroke="white"
        strokeOpacity={0.85}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
