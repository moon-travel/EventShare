import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "../db";
import { eventCategories, events, type Event } from "../db/schema";
import {
  getCategoriesForEvents,
  getEventCategoryIds,
  toEventCard,
  type EventCard,
} from "../services/events";
import { rankRelated } from "./rank";

const POOL_SIZE = 250;

export type RelatedEvents = { series: EventCard[]; related: EventCard[] };

/**
 * Finds events related to `event` for the detail page: other editions of the
 * same series, and similar events (shared categories / organizer / wording).
 * Candidates come from two pools — events sharing a category and recently
 * created events — then are ranked in JS (same approach as duplicate search).
 */
export async function findRelatedEvents(
  db: Database,
  event: Event,
  now: Date,
  timeZone: string,
): Promise<RelatedEvents> {
  const baseCategoryIds = await getEventCategoryIds(db, event.id);
  const scope = and(eq(events.status, "published"), ne(events.id, event.id));

  const pools = await Promise.all([
    db
      .select()
      .from(events)
      .where(scope)
      .orderBy(desc(events.createdAt))
      .limit(POOL_SIZE),
    baseCategoryIds.length > 0
      ? db
          .select()
          .from(events)
          .where(
            and(
              scope,
              inArray(
                events.id,
                db
                  .select({ id: eventCategories.eventId })
                  .from(eventCategories)
                  .where(inArray(eventCategories.categoryId, baseCategoryIds)),
              ),
            ),
          )
          .orderBy(desc(events.createdAt))
          .limit(POOL_SIZE)
      : [],
  ]);

  const byId = new Map<string, Event>();
  for (const row of pools.flat()) byId.set(row.id, row);
  if (byId.size === 0) return { series: [], related: [] };

  const rows = [...byId.values()];
  const cats = await getCategoriesForEvents(
    db,
    rows.map((r) => r.id),
  );
  const candidates = rows.map((row) => ({
    ...row,
    categoryIds: (cats.get(row.id) ?? []).map((c) => c.id),
  }));

  const ranked = rankRelated(
    { ...event, categoryIds: baseCategoryIds },
    candidates,
    now,
    timeZone,
  );
  const toCard = (e: Event) => toEventCard(e, cats.get(e.id) ?? [], now);
  return {
    series: ranked.series.map(toCard),
    related: ranked.related.map(toCard),
  };
}
