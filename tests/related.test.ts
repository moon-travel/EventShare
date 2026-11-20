import { describe, expect, it } from "vitest";
import {
  classifyRelated,
  isUpcoming,
  rankRelated,
  type RelatedComparable,
} from "~/.server/related/rank";

const TZ = "Asia/Tokyo";
const now = new Date("2026-06-01T00:00:00Z");

function event(overrides: Partial<RelatedComparable> & { id: string }): RelatedComparable {
  return {
    title: "高校生AIハッカソン 2026",
    description: "高校生がチームでAIを使ったアプリを開発するハッカソンです。",
    startAt: new Date("2026-12-05T01:00:00Z"),
    organizer: "未来テック財団",
    location: "岡山県立図書館",
    format: "offline",
    officialUrl: null,
    categoryIds: [1, 7],
    ...overrides,
  };
}

const base = event({ id: "base" });

describe("isUpcoming", () => {
  it("is true before the (effective) end of the event", () => {
    expect(isUpcoming({ startAt: new Date("2026-06-02T00:00:00Z") }, now)).toBe(true);
    expect(isUpcoming({ startAt: new Date("2026-05-20T00:00:00Z") }, now)).toBe(false);
    expect(
      isUpcoming(
        { startAt: new Date("2026-05-20T00:00:00Z"), endAt: new Date("2026-06-10T00:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("is false without a start date", () => {
    expect(isUpcoming({ startAt: null }, now)).toBe(false);
  });
});

describe("classifyRelated", () => {
  it("never relates an event to itself", () => {
    expect(classifyRelated(base, base, now, TZ)).toBeNull();
  });

  it("detects another edition of the same series (different year)", () => {
    const r = classifyRelated(
      base,
      event({
        id: "edition-2025",
        title: "高校生AIハッカソン 2025",
        startAt: new Date("2025-12-06T01:00:00Z"),
      }),
      now,
      TZ,
    );
    expect(r?.kind).toBe("series");
  });

  it("detects a same-organizer edition with a looser title", () => {
    const r = classifyRelated(
      base,
      event({
        id: "edition-loose",
        title: "AIハッカソン 2027（高校生向け）",
        startAt: new Date("2027-12-04T01:00:00Z"),
      }),
      now,
      TZ,
    );
    expect(r?.kind).toBe("series");
  });

  it("classifies shared-category events as related", () => {
    const r = classifyRelated(
      base,
      event({
        id: "related-1",
        title: "ロボットプログラミング講座",
        description: "ロボットを動かすプログラミングを学ぶ講座です。",
        organizer: "県立大学",
        startAt: new Date("2026-07-01T01:00:00Z"),
        categoryIds: [1, 7],
      }),
      now,
      TZ,
    );
    expect(r?.kind).toBe("related");
  });

  it("excludes unrelated events", () => {
    const r = classifyRelated(
      base,
      event({
        id: "unrelated",
        title: "吹奏楽コンクール県大会",
        description: "吹奏楽部のためのコンクールです。",
        organizer: "音楽連盟",
        categoryIds: [99],
      }),
      now,
      TZ,
    );
    expect(r).toBeNull();
  });

  it("scores upcoming events higher than ended ones", () => {
    const template = {
      title: "ロボットプログラミング講座",
      description: "ロボットを動かすプログラミングを学ぶ講座です。",
      organizer: "県立大学",
      categoryIds: [1, 7] as number[],
    };
    const upcoming = classifyRelated(
      base,
      event({ ...template, id: "u", startAt: new Date("2026-07-01T01:00:00Z") }),
      now,
      TZ,
    );
    const ended = classifyRelated(
      base,
      event({ ...template, id: "e", startAt: new Date("2026-03-01T01:00:00Z") }),
      now,
      TZ,
    );
    expect(upcoming!.score).toBeGreaterThan(ended!.score);
  });
});

describe("rankRelated", () => {
  const candidates = [
    event({
      id: "edition-past",
      title: "高校生AIハッカソン 2025",
      startAt: new Date("2025-12-06T01:00:00Z"),
    }),
    event({
      id: "edition-upcoming",
      title: "高校生AIハッカソン 2027",
      startAt: new Date("2027-12-04T01:00:00Z"),
    }),
    event({
      id: "related-upcoming",
      title: "ロボットプログラミング講座",
      description: "ロボットを動かすプログラミングを学ぶ講座です。",
      organizer: "県立大学",
      startAt: new Date("2026-07-01T01:00:00Z"),
      categoryIds: [1],
    }),
    event({
      id: "unrelated",
      title: "吹奏楽コンクール県大会",
      description: "吹奏楽部のためのコンクールです。",
      organizer: "音楽連盟",
      categoryIds: [99],
    }),
  ];

  it("splits candidates into series and related, excluding noise", () => {
    const r = rankRelated(base, candidates, now, TZ);
    expect(r.series.map((e) => e.id)).toEqual(["edition-upcoming", "edition-past"]);
    expect(r.related.map((e) => e.id)).toEqual(["related-upcoming"]);
  });

  it("respects limits", () => {
    const r = rankRelated(base, candidates, now, TZ, { series: 1, related: 6 });
    expect(r.series).toHaveLength(1);
    expect(r.series[0].id).toBe("edition-upcoming");
  });
});
