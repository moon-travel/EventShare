import {
  DEFAULT_DUPLICATE_CONFIG,
  scoreDuplicate,
  type DuplicateComparable,
} from "../duplicates/score";

/**
 * Related-event ranking for the event detail page. Reuses the duplicate
 * detection similarity primitives, but answers a different question: not
 * "is this the same event?" but "what else could this reader be interested
 * in?". Pure logic so it can be unit tested without a database.
 */

export type RelatedComparable = DuplicateComparable & {
  id: string;
  endAt?: Date | null;
  categoryIds: number[];
};

export type RelatedKind = "series" | "related";

const DAY = 86_400_000;

/** Score >= this is shown in the "似ているイベント" section. */
const RELATED_THRESHOLD = 25;
/** Title similarity >= this is treated as the same series (another edition). */
const SERIES_TITLE_SIMILARITY = 0.6;

export function isUpcoming(
  e: { startAt?: Date | null; endAt?: Date | null },
  now: Date,
) {
  if (!e.startAt) return false;
  const end = e.endAt ?? new Date(e.startAt.getTime() + DAY - 1);
  return end.getTime() >= now.getTime();
}

export function classifyRelated(
  base: RelatedComparable,
  candidate: RelatedComparable,
  now: Date,
  timeZone: string,
): { kind: RelatedKind; score: number } | null {
  if (candidate.id === base.id) return null;

  const dup = scoreDuplicate(base, candidate, DEFAULT_DUPLICATE_CONFIG, timeZone);
  const w = DEFAULT_DUPLICATE_CONFIG.weights;
  const titleSim = dup.breakdown.title / w.title;
  const organizerSim = dup.breakdown.organizer / w.organizer;
  const descriptionSim = dup.breakdown.description / w.description;

  // Same series: near-identical titles (e.g. "ハッカソン 2025" / "ハッカソン 2026"),
  // or a similar title by the same organizer held at a clearly different time.
  if (
    titleSim >= SERIES_TITLE_SIMILARITY ||
    (titleSim >= 0.45 && organizerSim >= 0.8 && dup.differentEdition)
  ) {
    return { kind: "series", score: Math.round(titleSim * 100) };
  }

  const shared = base.categoryIds.filter((id) =>
    candidate.categoryIds.includes(id),
  ).length;
  // Overlap coefficient: full score when the smaller category set is covered.
  const categoryOverlap =
    shared / Math.max(1, Math.min(base.categoryIds.length || 1, candidate.categoryIds.length || 1));

  let score =
    categoryOverlap * 40 +
    organizerSim * 20 +
    titleSim * 15 +
    descriptionSim * 15;
  if (isUpcoming(candidate, now)) score += 10;
  score = Math.round(score);

  return score >= RELATED_THRESHOLD ? { kind: "related", score } : null;
}

/** Upcoming editions first (soonest first), then past editions (latest first). */
function compareSeries(a: RelatedComparable, b: RelatedComparable, now: Date) {
  const ua = isUpcoming(a, now);
  const ub = isUpcoming(b, now);
  if (ua !== ub) return ua ? -1 : 1;
  const ta = a.startAt?.getTime() ?? 0;
  const tb = b.startAt?.getTime() ?? 0;
  return ua ? ta - tb : tb - ta;
}

export function rankRelated<T extends RelatedComparable>(
  base: RelatedComparable,
  candidates: T[],
  now: Date,
  timeZone: string,
  limits = { series: 3, related: 6 },
): { series: T[]; related: T[] } {
  const series: { item: T; score: number }[] = [];
  const related: { item: T; score: number }[] = [];
  for (const candidate of candidates) {
    const r = classifyRelated(base, candidate, now, timeZone);
    if (!r) continue;
    (r.kind === "series" ? series : related).push({ item: candidate, score: r.score });
  }
  series.sort(
    (a, b) => b.score - a.score || compareSeries(a.item, b.item, now),
  );
  related.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return compareSeries(a.item, b.item, now);
  });
  return {
    series: series.slice(0, limits.series).map((s) => s.item),
    related: related.slice(0, limits.related).map((s) => s.item),
  };
}
