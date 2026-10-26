import { Flame } from 'lucide-react';

/** Small teal pill showing the current streak (habits only). */
export function StreakBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent-2/30 bg-accent-2/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-accent-2">
      <Flame size={11} strokeWidth={1.75} />
      {count}
    </span>
  );
}
