import { describe, expect, it } from "vitest";
import {
  BADGE_METRICS,
  badgeStatus,
  computeBadges,
  type BadgeCounts,
} from "~/lib/badges";

const zero: BadgeCounts = {
  participated: 0,
  reports: 0,
  posted: 0,
  contributions: 0,
  likesReceived: 0,
};

describe("badgeStatus", () => {
  it("earns nothing at zero and aims for bronze", () => {
    const s = badgeStatus("participated", 0);
    expect(s.earned).toBeNull();
    expect(s.next).toEqual({ tier: "bronze", label: "はじめの一歩", threshold: 1 });
  });

  it("earns bronze at the first threshold", () => {
    const s = badgeStatus("participated", 1);
    expect(s.earned?.tier).toBe("bronze");
    expect(s.next?.tier).toBe("silver");
  });

  it("keeps the highest earned tier between thresholds", () => {
    const s = badgeStatus("participated", 7);
    expect(s.earned).toEqual({ tier: "silver", label: "挑戦者", threshold: 5 });
    expect(s.next).toEqual({ tier: "gold", label: "冒険家", threshold: 15 });
  });

  it("has no next badge after gold", () => {
    const s = badgeStatus("participated", 100);
    expect(s.earned?.tier).toBe("gold");
    expect(s.next).toBeNull();
  });

  it("uses higher thresholds for likes", () => {
    expect(badgeStatus("likesReceived", 4).earned).toBeNull();
    expect(badgeStatus("likesReceived", 5).earned?.tier).toBe("bronze");
  });
});

describe("computeBadges", () => {
  it("returns a status for every metric", () => {
    const statuses = computeBadges(zero);
    expect(statuses.map((s) => s.metric).sort()).toEqual([...BADGE_METRICS].sort());
  });

  it("sorts earned badges first, highest tier first", () => {
    const statuses = computeBadges({
      ...zero,
      participated: 20, // gold
      reports: 1, // bronze
      posted: 6, // silver
    });
    expect(statuses.slice(0, 3).map((s) => s.metric)).toEqual([
      "participated",
      "posted",
      "reports",
    ]);
    expect(statuses[0].earned?.tier).toBe("gold");
  });
});
