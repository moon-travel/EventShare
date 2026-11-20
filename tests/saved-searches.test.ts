import { describe, expect, it } from "vitest";
import { parseSearchParams } from "~/.server/services/events";
import {
  describeSearch,
  isEmptySearch,
  paramsToStored,
  storedToParams,
  storedToSearchString,
} from "~/.server/services/saved-searches";

function params(search: string) {
  return parseSearchParams(new URLSearchParams(search));
}

describe("paramsToStored", () => {
  it("keeps only non-default filter fields", () => {
    const stored = paramsToStored(
      params("q=python&category=ai&category=programming&format=online&fee=free&sort=popular&page=3"),
    );
    expect(stored).toEqual({
      q: "python",
      category: ["ai", "programming"],
      format: "online",
      fee: "free",
    });
  });

  it("is empty for the default search", () => {
    expect(paramsToStored(params(""))).toEqual({});
    expect(isEmptySearch(params("sort=popular&page=2"))).toBe(true);
    expect(isEmptySearch(params("q=ai"))).toBe(false);
  });

  it("keeps a non-default status", () => {
    expect(paramsToStored(params("status=all"))).toEqual({ status: "all" });
  });
});

describe("storedToParams", () => {
  it("round-trips through storage", () => {
    const original = params("q=ロボット&category=science&deadline=7d&location=岡山");
    const restored = storedToParams(paramsToStored(original));
    expect(paramsToStored(restored)).toEqual(paramsToStored(original));
  });

  it("tolerates invalid stored values", () => {
    const restored = storedToParams({ q: "x", deadline: "nonsense", page: -1 });
    expect(restored.q).toBe("x");
    expect(restored.deadline).toBeUndefined();
    expect(restored.page).toBe(1);
  });
});

describe("storedToSearchString", () => {
  it("builds a /events query string", () => {
    const qs = storedToSearchString({
      q: "AI",
      category: ["ai", "contest"],
      fee: "free",
    });
    const sp = new URLSearchParams(qs);
    expect(sp.get("q")).toBe("AI");
    expect(sp.getAll("category")).toEqual(["ai", "contest"]);
    expect(sp.get("fee")).toBe("free");
    expect(sp.get("sort")).toBeNull();
  });
});

describe("describeSearch", () => {
  it("builds a readable name from filters", () => {
    const name = describeSearch(
      params("q=python&format=online&fee=free"),
      ["プログラミング"],
    );
    expect(name).toBe("「python」・プログラミング・オンライン・無料");
  });

  it("falls back for the empty search", () => {
    expect(describeSearch(params(""), [])).toBe("すべてのイベント");
  });

  it("truncates very long names to 50 characters", () => {
    const name = describeSearch(params(`q=${"あ".repeat(80)}`), []);
    expect(name.length).toBeLessThanOrEqual(50);
  });
});
