import { describe, expect, it } from "vitest";
import { addLivePoint, mergeHistory, sinceFor } from "@/domains/scores/series";
import { game } from "./helpers";

const c = (time: number, close: number) => ({ time, close, volume: 1 });

describe("merging traded-price histories", () => {
  it("carries each team's last price forward across the other team's timestamps", () => {
    const home = [c(100, 0.6), c(300, 0.7)];
    const away = [c(200, 0.4)];
    expect(mergeHistory(home, away, 0)).toEqual([
      { t: 100, home: 0.6, away: null },
      { t: 200, home: 0.6, away: 0.4 },
      { t: 300, home: 0.7, away: 0.4 },
    ]);
  });

  it("starts at the window with the price that was standing then", () => {
    const home = [c(50, 0.55), c(150, 0.6)];
    const away = [c(60, 0.45), c(160, 0.4)];
    const points = mergeHistory(home, away, 100);
    expect(points[0]).toEqual({ t: 150, home: 0.6, away: 0.45 });
  });

  it("returns nothing for a game with no trades", () => {
    expect(mergeHistory([], [], 0)).toEqual([]);
  });
});

describe("adding the live midpoint", () => {
  const base = [{ t: 100, home: 0.6, away: 0.4 }];

  it("appends a point when the chance moved", () => {
    expect(addLivePoint(base, 200, 0.62, 0.38)).toEqual([...base, { t: 200, home: 0.62, away: 0.38 }]);
  });

  it("keeps the series as is when nothing moved", () => {
    expect(addLivePoint(base, 200, 0.6, 0.4)).toBe(base);
  });

  it("holds a side's last value when its book has no price", () => {
    expect(addLivePoint(base, 200, null, 0.35)).toEqual([...base, { t: 200, home: 0.6, away: 0.35 }]);
  });

  it("ignores a poll with no price on either side", () => {
    expect(addLivePoint(base, 200, null, null)).toBe(base);
  });

  it("starts a series from nothing", () => {
    expect(addLivePoint([], 200, 0.5, null)).toEqual([{ t: 200, home: 0.5, away: null }]);
  });
});

describe("where the chart starts", () => {
  it("starts 90 minutes before a game that has begun", () => {
    const g = game({ startTime: "2026-11-20T01:00:00.000Z" });
    expect(sinceFor(g, Date.parse("2026-11-20T02:00:00.000Z"))).toBe(Date.parse("2026-11-19T23:30:00.000Z"));
  });

  it("starts a day back for a game that has not", () => {
    const g = game({ startTime: "2026-11-22T01:00:00.000Z" });
    const now = Date.parse("2026-11-20T02:00:00.000Z");
    expect(sinceFor(g, now)).toBe(now - 24 * 3600_000);
  });
});
