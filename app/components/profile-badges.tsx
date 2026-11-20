import { Award, Flag, Heart, Medal, NotebookPen, PencilLine, Send } from "lucide-react";
import { computeBadges, TIER_LABEL, type BadgeCounts, type BadgeMetric, type BadgeTier } from "~/lib/badges";
import { cn } from "~/lib/utils";

const METRIC_ICON: Record<BadgeMetric, typeof Flag> = {
  participated: Flag,
  reports: NotebookPen,
  posted: Send,
  contributions: PencilLine,
  likesReceived: Heart,
};

const TIER_CLASS: Record<BadgeTier, string> = {
  bronze: "border-amber-300 bg-amber-50 text-amber-800",
  silver: "border-slate-300 bg-slate-100 text-slate-700",
  gold: "border-yellow-400 bg-yellow-50 text-yellow-700",
};

export function ProfileBadges({
  counts,
  categories,
  showGoals = false,
}: {
  counts: BadgeCounts;
  categories: { name: string; count: number }[];
  /** Show "next badge" hints (own profile only). */
  showGoals?: boolean;
}) {
  const statuses = computeBadges(counts);
  const earned = statuses.filter((s) => s.earned);
  const nextGoal = showGoals
    ? statuses
        .filter((s) => s.next)
        .sort((a, b) => a.next!.threshold - a.count - (b.next!.threshold - b.count))[0]
    : undefined;

  return (
    <section aria-labelledby="activity-stats" className="rounded-xl border bg-card p-5">
      <h2 id="activity-stats" className="flex items-center gap-1.5 text-sm font-semibold">
        <Award className="size-4" aria-hidden /> 活動の実績
      </h2>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {statuses
          .slice()
          .sort((a, b) => (a.metric > b.metric ? 1 : -1))
          .map((s) => {
            const Icon = METRIC_ICON[s.metric];
            return (
              <div key={s.metric} className="rounded-lg border p-3 text-center">
                <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden />
                  {s.metricLabel}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{s.count}</dd>
              </div>
            );
          })}
      </dl>

      {earned.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="獲得したバッジ">
          {earned.map((s) => (
            <li
              key={s.metric}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                TIER_CLASS[s.earned!.tier],
              )}
              title={`${s.metricLabel} ${s.earned!.threshold}以上（${TIER_LABEL[s.earned!.tier]}）`}
            >
              <Medal className="size-4" aria-hidden />
              {s.earned!.label}
              <span className="text-xs opacity-70">{TIER_LABEL[s.earned!.tier]}</span>
            </li>
          ))}
        </ul>
      )}

      {nextGoal?.next && (
        <p className="mt-3 text-xs text-muted-foreground">
          次のバッジ: {nextGoal.metricLabel}があと
          {nextGoal.next.threshold - nextGoal.count}で「{nextGoal.next.label}」
        </p>
      )}

      {categories.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h3 className="text-xs font-semibold text-muted-foreground">分野別の参加</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <li
                key={c.name}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-0.5 text-xs"
              >
                {c.name}
                <span className="font-semibold tabular-nums">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
