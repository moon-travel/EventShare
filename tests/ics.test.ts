import { describe, expect, it } from "vitest";
import {
  buildIcsCalendar,
  escapeIcs,
  feedEntriesForEvents,
  foldIcsLine,
  icsDate,
  type FeedEventInput,
} from "~/.server/ics";

describe("icsDate", () => {
  it("formats UTC basic format", () => {
    expect(icsDate(new Date("2026-12-05T01:30:00Z"))).toBe("20261205T013000Z");
  });
});

describe("escapeIcs", () => {
  it("escapes separators and newlines", () => {
    expect(escapeIcs("a,b;c\nd\\e")).toBe("a\\,b\\;c\\nd\\\\e");
  });
});

describe("foldIcsLine", () => {
  it("keeps short lines unchanged", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds long lines at 75 octets with a leading space", () => {
    const folded = foldIcsLine(`SUMMARY:${"あ".repeat(60)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const [i, line] of lines.entries()) {
      if (i > 0) expect(line.startsWith(" ")).toBe(true);
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

function feedEvent(overrides: Partial<FeedEventInput> & { id: string }): FeedEventInput {
  return {
    title: "高校生AIハッカソン",
    description: "説明",
    startAt: new Date("2026-12-05T01:00:00Z"),
    endAt: null,
    location: "岡山県立図書館",
    applicationDeadline: new Date("2026-11-20T15:00:00Z"),
    ...overrides,
  };
}

describe("feedEntriesForEvents", () => {
  const origin = "https://example.com";

  it("creates an event entry and a deadline entry", () => {
    const entries = feedEntriesForEvents([feedEvent({ id: "e1" })], origin);
    expect(entries).toHaveLength(2);
    const deadline = entries.find((e) => e.uid === "e1-deadline@event-share")!;
    const main = entries.find((e) => e.uid === "e1@event-share")!;
    expect(deadline.summary).toBe("【応募締切】高校生AIハッカソン");
    expect(main.url).toBe("https://example.com/events/e1");
    // Default duration is one hour.
    expect(main.end!.getTime() - main.start.getTime()).toBe(3_600_000);
  });

  it("skips the event entry when there is no start date", () => {
    const entries = feedEntriesForEvents([feedEvent({ id: "e2", startAt: null })], origin);
    expect(entries.map((e) => e.uid)).toEqual(["e2-deadline@event-share"]);
  });

  it("skips the deadline entry when there is no deadline", () => {
    const entries = feedEntriesForEvents(
      [feedEvent({ id: "e3", applicationDeadline: null })],
      origin,
    );
    expect(entries.map((e) => e.uid)).toEqual(["e3@event-share"]);
  });

  it("sorts entries by start time", () => {
    const entries = feedEntriesForEvents(
      [
        feedEvent({ id: "late", startAt: new Date("2027-01-01T00:00:00Z"), applicationDeadline: null }),
        feedEvent({ id: "early", startAt: new Date("2026-06-01T00:00:00Z"), applicationDeadline: null }),
      ],
      origin,
    );
    expect(entries.map((e) => e.uid)).toEqual(["early@event-share", "late@event-share"]);
  });
});

describe("buildIcsCalendar", () => {
  it("produces a valid calendar with CRLF line endings", () => {
    const body = buildIcsCalendar(
      feedEntriesForEvents([feedEvent({ id: "e1" })], "https://example.com"),
      { name: "Event Share", now: new Date("2026-01-01T00:00:00Z") },
    );
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("X-WR-CALNAME:Event Share");
    expect(body).toContain("UID:e1@event-share");
    expect(body).toContain("UID:e1-deadline@event-share");
    expect(body).toContain("DTSTAMP:20260101T000000Z");
    // A deadline is instantaneous: DTEND equals DTSTART.
    expect(body).toContain("DTSTART:20261120T150000Z\r\nDTEND:20261120T150000Z");
  });

  it("omits NAME when no calendar name is given", () => {
    const body = buildIcsCalendar([]);
    expect(body).not.toContain("X-WR-CALNAME");
  });
});
