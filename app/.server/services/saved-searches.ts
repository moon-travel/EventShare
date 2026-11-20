import { and, asc, count, desc, eq, gte } from "drizzle-orm";
import { truncate } from "~/lib/text";
import type { Database } from "../db";
import { events, savedSearches } from "../db/schema";
import {
  buildSearchConditions,
  getActiveCategories,
  searchParamsSchema,
  type EventSearchParams,
} from "./events";
import { notify } from "./notifications";

export const MAX_SAVED_SEARCHES = 10;

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Query (de)serialization — pure, unit tested
// ---------------------------------------------------------------------------

/** Keeps only the non-default filter fields (sort / page are not saved). */
export function paramsToStored(p: EventSearchParams): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  if (p.q) stored.q = p.q;
  if (p.category.length > 0) stored.category = p.category;
  if (p.from) stored.from = p.from;
  if (p.to) stored.to = p.to;
  if (p.deadline) stored.deadline = p.deadline;
  if (p.location) stored.location = p.location;
  if (p.format) stored.format = p.format;
  if (p.fee) stored.fee = p.fee;
  if (p.audience) stored.audience = p.audience;
  if (p.status !== "upcoming") stored.status = p.status;
  return stored;
}

/** Re-validates a stored query (tolerant: unknown values fall back to defaults). */
export function storedToParams(stored: Record<string, unknown>): EventSearchParams {
  return searchParamsSchema.parse({ category: [], ...stored });
}

/** Query string for linking back to `/events` with the saved filters. */
export function storedToSearchString(stored: Record<string, unknown>) {
  const p = storedToParams(stored);
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  for (const c of p.category) sp.append("category", c);
  if (p.from) sp.set("from", p.from);
  if (p.to) sp.set("to", p.to);
  if (p.deadline) sp.set("deadline", p.deadline);
  if (p.location) sp.set("location", p.location);
  if (p.format) sp.set("format", p.format);
  if (p.fee) sp.set("fee", p.fee);
  if (p.audience) sp.set("audience", p.audience);
  if (p.status !== "upcoming") sp.set("status", p.status);
  return sp.toString();
}

/** Human-readable default name, e.g. 「python」・AI・オンライン・無料 */
export function describeSearch(
  p: EventSearchParams,
  categoryNames: string[],
): string {
  const parts: string[] = [];
  if (p.q) parts.push(`「${p.q}」`);
  parts.push(...categoryNames);
  if (p.format) parts.push(p.format === "online" ? "オンライン" : "会場");
  if (p.fee) parts.push(p.fee === "free" ? "無料" : "有料");
  if (p.location) parts.push(p.location);
  if (p.audience) parts.push(p.audience);
  if (p.deadline === "7d") parts.push("締切7日以内");
  if (p.deadline === "30d") parts.push("締切30日以内");
  if (p.deadline === "open") parts.push("応募受付中");
  if (p.from || p.to) parts.push(`${p.from ?? ""}〜${p.to ?? ""}`);
  if (parts.length === 0) return "すべてのイベント";
  return truncate(parts.join("・"), 50);
}

/** True when the search has no filters at all (not worth saving). */
export function isEmptySearch(p: EventSearchParams) {
  return Object.keys(paramsToStored(p)).length === 0;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listSavedSearches(db: Database, userId: string) {
  return db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(asc(savedSearches.createdAt))
    .limit(MAX_SAVED_SEARCHES);
}

export async function createSavedSearch(
  db: Database,
  userId: string,
  name: string | null,
  params: EventSearchParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isEmptySearch(params)) {
    return { ok: false, error: "絞り込み条件やキーワードを指定してから保存してください" };
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId));
  if (n >= MAX_SAVED_SEARCHES) {
    return {
      ok: false,
      error: `保存できる検索条件は${MAX_SAVED_SEARCHES}件までです。不要なものを削除してください`,
    };
  }
  let finalName = name?.trim().slice(0, 50) || "";
  if (!finalName) {
    const cats = await getActiveCategories(db);
    const names = params.category
      .map((slug) => cats.find((c) => c.slug === slug)?.name)
      .filter((v): v is string => !!v);
    finalName = describeSearch(params, names);
  }
  await db.insert(savedSearches).values({
    id: crypto.randomUUID(),
    userId,
    name: finalName,
    query: paramsToStored(params),
  });
  return { ok: true };
}

export async function deleteSavedSearch(db: Database, userId: string, id: string) {
  await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
}

export async function setSavedSearchNotify(
  db: Database,
  userId: string,
  id: string,
  notifyOn: boolean,
) {
  await db
    .update(savedSearches)
    .set({ notify: notifyOn })
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
}

// ---------------------------------------------------------------------------
// Daily notification job
// ---------------------------------------------------------------------------

/**
 * Notifies users about events posted in the last 24 hours that match their
 * saved searches (at most one notification per saved search per day;
 * idempotent via dedupe keys).
 */
export async function notifySavedSearchMatches(
  db: Database,
  now: Date,
  timeZone: string,
) {
  const since = new Date(now.getTime() - DAY);
  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.notify, true))
    .limit(2000);

  let sent = 0;
  for (const search of rows) {
    const params = storedToParams(search.query);
    const where = await buildSearchConditions(db, params, now, timeZone);
    if (!where) continue;
    const windowed = and(where, gte(events.createdAt, since))!;

    const [{ total }] = await db
      .select({ total: count() })
      .from(events)
      .where(windowed);
    if (total === 0) continue;

    const titles = await db
      .select({ title: events.title })
      .from(events)
      .where(windowed)
      .orderBy(desc(events.createdAt))
      .limit(3);
    const body =
      titles.map((t) => t.title).join("、") +
      (total > titles.length ? ` ほか${total - titles.length}件` : "");

    const dateKey = now.toISOString().slice(0, 10);
    sent += await notify(db, [search.userId], {
      type: "saved_search",
      title: `保存した検索「${search.name}」に新着イベントがあります`,
      body,
      link: `/events?${storedToSearchString(search.query)}`,
      dedupeKey: (u) => `saved_search:${search.id}:${dateKey}:${u}`,
    });
    await db
      .update(savedSearches)
      .set({ lastNotifiedAt: now })
      .where(eq(savedSearches.id, search.id));
  }
  return sent;
}
