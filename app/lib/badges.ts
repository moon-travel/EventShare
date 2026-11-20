/**
 * Achievement badges computed from activity counts. Pure logic shared by the
 * profile pages (client) and unit tests; the counts themselves are aggregated
 * server-side in `app/.server/services/stats.ts`.
 */

export type BadgeTier = "bronze" | "silver" | "gold";

export type BadgeMetric =
  | "participated"
  | "reports"
  | "posted"
  | "contributions"
  | "likesReceived";

export type BadgeCounts = Record<BadgeMetric, number>;

export type BadgeStatus = {
  metric: BadgeMetric;
  /** What this metric counts, e.g. 参加したイベント */
  metricLabel: string;
  count: number;
  /** Highest earned badge, or null when nothing is earned yet. */
  earned: { tier: BadgeTier; label: string; threshold: number } | null;
  /** Next badge to aim for, or null when gold is reached. */
  next: { tier: BadgeTier; label: string; threshold: number } | null;
};

const TIERS: BadgeTier[] = ["bronze", "silver", "gold"];

export const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: "ブロンズ",
  silver: "シルバー",
  gold: "ゴールド",
};

/** metric → [thresholds per tier, badge names per tier, metric label] */
const DEFINITIONS: Record<
  BadgeMetric,
  { thresholds: [number, number, number]; labels: [string, string, string]; metricLabel: string }
> = {
  participated: {
    thresholds: [1, 5, 15],
    labels: ["はじめの一歩", "挑戦者", "冒険家"],
    metricLabel: "参加したイベント",
  },
  reports: {
    thresholds: [1, 5, 15],
    labels: ["体験をシェア", "レポーター", "記録の達人"],
    metricLabel: "活動報告",
  },
  posted: {
    thresholds: [1, 5, 15],
    labels: ["はじめての投稿", "情報通", "イベントハンター"],
    metricLabel: "投稿したイベント",
  },
  contributions: {
    thresholds: [1, 5, 15],
    labels: ["サポーター", "編集者", "編集マイスター"],
    metricLabel: "情報提供・編集",
  },
  likesReceived: {
    thresholds: [5, 20, 50],
    labels: ["注目の投稿", "人気の投稿者", "みんなの頼れる人"],
    metricLabel: "もらったいいね",
  },
};

export const BADGE_METRICS = Object.keys(DEFINITIONS) as BadgeMetric[];

export function badgeStatus(metric: BadgeMetric, count: number): BadgeStatus {
  const def = DEFINITIONS[metric];
  let earned: BadgeStatus["earned"] = null;
  let next: BadgeStatus["next"] = null;
  for (let i = 0; i < TIERS.length; i++) {
    const entry = { tier: TIERS[i], label: def.labels[i], threshold: def.thresholds[i] };
    if (count >= def.thresholds[i]) {
      earned = entry;
    } else {
      next = entry;
      break;
    }
  }
  return { metric, metricLabel: def.metricLabel, count, earned, next };
}

/** Status for every metric, earned badges first (gold → bronze → none). */
export function computeBadges(counts: BadgeCounts): BadgeStatus[] {
  const rank = (s: BadgeStatus) =>
    s.earned ? TIERS.indexOf(s.earned.tier) + 1 : 0;
  return BADGE_METRICS.map((m) => badgeStatus(m, counts[m])).sort(
    (a, b) => rank(b) - rank(a),
  );
}
