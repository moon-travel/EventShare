import { data } from "react-router";
import { getConfig } from "~/.server/config";
import { createDb } from "~/.server/db";
import { buildIcsCalendar, feedEntriesForEvents } from "~/.server/ics";
import {
  getFeedByToken,
  listFeedEvents,
} from "~/.server/services/calendar-feed";
import type { Route } from "./+types/calendar-feed.$token";

/**
 * ICS subscription feed. The token in the URL is the only credential (same
 * model as Google Calendar's "secret address"), so responses must never be
 * cached by shared caches and the token can be rotated from the settings page.
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const db = createDb();
  const feed = await getFeedByToken(db, params.token);
  if (!feed) throw data("Not found", { status: 404 });

  const origin = new URL(getConfig().baseUrl || request.url).origin;
  const rows = await listFeedEvents(db, feed.userId);
  const body = buildIcsCalendar(feedEntriesForEvents(rows, origin), {
    name: "Event Share",
  });

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="event-share.ics"',
      "cache-control": "private, max-age=300",
    },
  });
}
