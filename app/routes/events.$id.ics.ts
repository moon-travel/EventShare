import { data } from "react-router";
import { getConfig } from "~/.server/config";
import { createDb } from "~/.server/db";
import { buildIcsCalendar } from "~/.server/ics";
import { getEvent } from "~/.server/services/events";
import type { Route } from "./+types/events.$id.ics";

export async function loader({ params, request }: Route.LoaderArgs) {
  const event = await getEvent(createDb(), params.id);
  if (!event || event.status !== "published" || !event.startAt) {
    throw data("Not found", { status: 404 });
  }
  const origin = new URL(getConfig().baseUrl || request.url).origin;
  const url = `${origin}/events/${event.id}`;
  const body = buildIcsCalendar([
    {
      uid: `${event.id}@event-share`,
      start: event.startAt,
      end: event.endAt ?? new Date(event.startAt.getTime() + 60 * 60 * 1000),
      summary: event.title,
      location: event.location,
      description: `${(event.description ?? "").slice(0, 500)}\n\n${url}`,
      url,
    },
  ]);

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="event-${event.id.slice(0, 8)}.ics"`,
    },
  });
}
