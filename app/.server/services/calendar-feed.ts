import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db";
import {
  calendarFeeds,
  eventBookmarks,
  eventParticipations,
  events,
  type Event,
} from "../db/schema";

const FEED_LIMIT = 500;

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getCalendarFeed(db: Database, userId: string) {
  return db.query.calendarFeeds.findFirst({
    where: eq(calendarFeeds.userId, userId),
  });
}

/** Issues the feed token, replacing (= invalidating) any previous one. */
export async function rotateCalendarFeed(db: Database, userId: string) {
  const token = generateToken();
  await db
    .insert(calendarFeeds)
    .values({ userId, token })
    .onConflictDoUpdate({
      target: calendarFeeds.userId,
      set: { token, createdAt: new Date() },
    });
  return token;
}

export async function deleteCalendarFeed(db: Database, userId: string) {
  await db.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId));
}

export async function getFeedByToken(db: Database, token: string) {
  if (!token) return undefined;
  return db.query.calendarFeeds.findFirst({
    where: eq(calendarFeeds.token, token),
  });
}

/** Published events the user bookmarked or plans to join (deduplicated). */
export async function listFeedEvents(db: Database, userId: string) {
  const [bookmarked, participating] = await Promise.all([
    db
      .select({ event: events })
      .from(eventBookmarks)
      .innerJoin(events, eq(events.id, eventBookmarks.eventId))
      .where(and(eq(eventBookmarks.userId, userId), eq(events.status, "published")))
      .orderBy(desc(eventBookmarks.createdAt))
      .limit(FEED_LIMIT),
    db
      .select({ event: events })
      .from(eventParticipations)
      .innerJoin(events, eq(events.id, eventParticipations.eventId))
      .where(
        and(eq(eventParticipations.userId, userId), eq(events.status, "published")),
      )
      .orderBy(desc(eventParticipations.createdAt))
      .limit(FEED_LIMIT),
  ]);
  const byId = new Map<string, Event>();
  for (const row of [...bookmarked, ...participating]) {
    byId.set(row.event.id, row.event);
  }
  return [...byId.values()];
}
