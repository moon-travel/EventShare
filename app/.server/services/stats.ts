import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { BadgeCounts } from "~/lib/badges";
import type { Database } from "../db";
import {
  activityReports,
  categories,
  eventCategories,
  eventContributions,
  eventParticipations,
  events,
} from "../db/schema";

export type UserStats = BadgeCounts & {
  /** Categories of the events the user participates in, most active first. */
  categories: { name: string; count: number }[];
};

export async function getUserStats(db: Database, userId: string): Promise<UserStats> {
  const [participated, reports, posted, contributions, likes, byCategory] =
    await Promise.all([
      db
        .select({ n: count() })
        .from(eventParticipations)
        .innerJoin(events, eq(events.id, eventParticipations.eventId))
        .where(
          and(eq(eventParticipations.userId, userId), eq(events.status, "published")),
        ),
      db
        .select({ n: count() })
        .from(activityReports)
        .where(
          and(eq(activityReports.userId, userId), eq(activityReports.status, "visible")),
        ),
      db
        .select({ n: count() })
        .from(events)
        .where(and(eq(events.createdById, userId), eq(events.status, "published"))),
      db
        .select({ n: count() })
        .from(eventContributions)
        .where(
          and(
            eq(eventContributions.userId, userId),
            inArray(eventContributions.type, ["add_info", "edit"]),
          ),
        ),
      db
        .select({ n: sql<number>`coalesce(sum(${events.likeCount}), 0)` })
        .from(events)
        .where(and(eq(events.createdById, userId), eq(events.status, "published"))),
      db
        .select({ name: categories.name, n: count() })
        .from(eventParticipations)
        .innerJoin(events, eq(events.id, eventParticipations.eventId))
        .innerJoin(eventCategories, eq(eventCategories.eventId, events.id))
        .innerJoin(categories, eq(categories.id, eventCategories.categoryId))
        .where(
          and(eq(eventParticipations.userId, userId), eq(events.status, "published")),
        )
        .groupBy(categories.id)
        .orderBy(desc(count()))
        .limit(6),
    ]);

  return {
    participated: participated[0]?.n ?? 0,
    reports: reports[0]?.n ?? 0,
    posted: posted[0]?.n ?? 0,
    contributions: contributions[0]?.n ?? 0,
    likesReceived: Number(likes[0]?.n ?? 0),
    categories: byCategory.map((c) => ({ name: c.name, count: c.n })),
  };
}
