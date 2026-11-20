/**
 * iCalendar (RFC 5545) generation, shared by the single-event download
 * (`/events/:id/calendar.ics`) and the per-user subscription feed
 * (`/calendar/feed/:token`). Pure module so it can be unit tested.
 */

export type IcsEvent = {
  uid: string;
  start: Date;
  /** Defaults to `start` (an instantaneous event such as a deadline). */
  end?: Date | null;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
};

export function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding (75 octets). */
export function foldIcsLine(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcsCalendar(
  items: IcsEvent[],
  options: { name?: string | null; now?: Date } = {},
) {
  const stamp = icsDate(options.now ?? new Date());
  const lines: (string | null)[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Event Share//JA",
    "CALSCALE:GREGORIAN",
    options.name ? `NAME:${escapeIcs(options.name)}` : null,
    options.name ? `X-WR-CALNAME:${escapeIcs(options.name)}` : null,
  ];
  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(item.start)}`,
      `DTEND:${icsDate(item.end ?? item.start)}`,
      `SUMMARY:${escapeIcs(item.summary)}`,
      item.location ? `LOCATION:${escapeIcs(item.location)}` : null,
      item.description ? `DESCRIPTION:${escapeIcs(item.description)}` : null,
      item.url ? `URL:${item.url}` : null,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return (
    lines
      .filter((l): l is string => l !== null)
      .map(foldIcsLine)
      .join("\r\n") + "\r\n"
  );
}

export type FeedEventInput = {
  id: string;
  title: string;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  location: string | null;
  applicationDeadline: Date | null;
};

const HOUR = 3_600_000;

/**
 * Feed entries for a user's bookmarked / joined events: one entry per event
 * with a start date (default duration 1 hour), plus one "【応募締切】" entry
 * per application deadline so reminders show up on the right day.
 */
export function feedEntriesForEvents(
  events: FeedEventInput[],
  origin: string,
): IcsEvent[] {
  const entries: IcsEvent[] = [];
  for (const e of events) {
    const url = `${origin}/events/${e.id}`;
    if (e.startAt) {
      entries.push({
        uid: `${e.id}@event-share`,
        start: e.startAt,
        end: e.endAt ?? new Date(e.startAt.getTime() + HOUR),
        summary: e.title,
        location: e.location,
        description: `${(e.description ?? "").slice(0, 300)}\n\n${url}`,
        url,
      });
    }
    if (e.applicationDeadline) {
      entries.push({
        uid: `${e.id}-deadline@event-share`,
        start: e.applicationDeadline,
        summary: `【応募締切】${e.title}`,
        description: url,
        url,
      });
    }
  }
  return entries.sort((a, b) => a.start.getTime() - b.start.getTime());
}
