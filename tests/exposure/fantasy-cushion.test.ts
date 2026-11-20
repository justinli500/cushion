import { describe, expect, it } from "vitest";
import { priceCushion } from "@/domains/cushion/price";
import type { PlayerEntry, StatLines } from "@/domains/exposure/fantasy";
import { gamesSpan, initials, lineupPurchase, lineupSlots, pickableLines, resolvePick, shortUsd, stakeShare } from "@/domains/exposure/fantasy-cushion";
import type { PropLine } from "@/domains/markets/types";

const line = (value: number, bid: number | null, ask: number | null, open = true): PropLine => ({
  line: value,
  contract: { symbol: `S${value}`, label: `${value}`, quote: { bid, ask, last: null }, open },
});

const stat = (metric: string, lines: PropLine[]): StatLines => ({ metric, label: metric, eventTicker: `EV-${metric}`, lines });

const entry = (player: string, stats: StatLines[], over: Partial<PlayerEntry> = {}): PlayerEntry => ({
  player,
  league: "NFL",
  gameId: "g1",
  gameTitle: "Game g1",
  startTime: "2026-11-22T18:00:00.000Z",
  expiry: "2026-11-23T12:00:00.000Z",
  eventTickers: stats.map((s) => s.eventTicker),
  stats,
  ...over,
});

// Chance of going under is 1 - the YES midpoint: 49.5 is 18%, 59.5 is 38%, 69.5 is 68%.
const ladder = [line(49.5, 0.8, 0.84), line(59.5, 0.6, 0.64), line(69.5, 0.3, 0.34)];

describe("lineupSlots", () => {
  const taylor = entry("Jonathan Taylor", []);
  const later = entry("Jonathan Taylor", [], { gameId: "g2", startTime: "2026-11-25T18:00:00.000Z" });
  const now = Date.parse("2026-11-22T12:00:00.000Z");

  it("makes a card per game for each lineup player, in lineup order, and one for a name nothing is listed for", () => {
    const slots = lineupSlots([later, taylor], ["Nobody Listed", "Jonathan Taylor"], now);
    expect(slots.map((s) => [s.key, s.entry?.gameId ?? null])).toEqual([
      ["Nobody Listed", null],
      ["g2|Jonathan Taylor", "g2"],
      ["g1|Jonathan Taylor", "g1"],
    ]);
  });

  it("says how far along each game is", () => {
    const slots = lineupSlots([taylor], ["Jonathan Taylor"], Date.parse("2026-11-23T01:00:00.000Z"));
    expect(slots[0].status).toBe("over");
    expect(lineupSlots([taylor], ["Jonathan Taylor"], now)[0].status).toBe("upcoming");
  });
});

describe("resolvePick", () => {
  const rushing = stat("rushing_yards", ladder);
  const receiving = stat("receiving_yards", [line(29.5, 0.6, 0.64), line(39.5, 0.3, 0.34)]);
  const player = entry("Jonathan Taylor", [rushing, receiving]);

  it("starts on the first stat, at the line the market thinks is about a one-in-three miss", () => {
    const pick = resolvePick(player)!;
    expect(pick.stat.metric).toBe("rushing_yards");
    expect(pick.line.line).toBe(59.5);
  });

  it("keeps the person's stat and line", () => {
    expect(resolvePick(player, { metric: "rushing_yards", line: 49.5 })!.line.line).toBe(49.5);
    expect(resolvePick(player, { metric: "receiving_yards" })!.stat.metric).toBe("receiving_yards");
  });

  it("drops a line that is gone and falls back to the default for the stat", () => {
    expect(resolvePick(player, { metric: "rushing_yards", line: 99.5 })!.line.line).toBe(59.5);
  });

  it("skips a stat with nothing open and takes the next one", () => {
    const closed = stat("rushing_yards", [line(59.5, 0.6, 0.64, false)]);
    expect(resolvePick(entry("Jonathan Taylor", [closed, receiving]))!.stat.metric).toBe("receiving_yards");
    expect(resolvePick(entry("Jonathan Taylor", [closed, receiving]), { metric: "rushing_yards" })!.stat.metric).toBe("receiving_yards");
  });

  it("is null when no line is open and quoted", () => {
    expect(resolvePick(entry("Jonathan Taylor", [stat("rushing_yards", [line(59.5, null, null)])]))).toBeNull();
    expect(resolvePick(entry("Jonathan Taylor", []))).toBeNull();
  });

  it("offers only open, quoted lines to choose from", () => {
    const mixed = stat("rushing_yards", [line(49.5, 0.8, 0.84), line(59.5, null, null), line(69.5, 0.3, 0.34, false)]);
    expect(pickableLines(mixed).map((l) => l.line)).toEqual([49.5]);
  });
});

describe("stakeShare", () => {
  it("splits the stake evenly and rounds down to the cent", () => {
    expect(stakeShare(50, 4)).toBe(12.5);
    expect(stakeShare(50, 3)).toBe(16.66);
    expect(stakeShare(50, 3) * 3).toBeLessThanOrEqual(50);
  });

  it("gives the whole stake to a lineup of one, and does not divide by zero", () => {
    expect(stakeShare(50, 1)).toBe(50);
    expect(stakeShare(50, 0)).toBe(50);
  });
});

describe("lineupPurchase", () => {
  const taylor = entry("Jonathan Taylor", [stat("rushing_yards", ladder)]);
  const stroud = entry("C.J. Stroud", [stat("passing_yards", [line(199.5, 0.6, 0.64), line(249.5, 0.3, 0.34)])], {
    gameId: "g2",
    expiry: "2026-11-24T12:00:00.000Z",
  });
  const covered = [taylor, stroud].map((e) => ({ entry: e, pick: resolvePick(e)! }));

  it("is one cushion with a NO leg per covered player, all paying their share", () => {
    const { cushion } = lineupPurchase(covered, 12.5);
    expect(cushion?.payoutMode).toBe("sum");
    expect(cushion?.legs.map((l) => [l.symbol, l.side, l.quantity])).toEqual([
      ["S59.5", "no", 12.5],
      ["S199.5", "no", 12.5],
    ]);
  });

  it("carries every event ticker once, and the latest expiry", () => {
    const both = lineupPurchase([...covered, covered[0]], 10);
    expect(both.eventTickers).toEqual(["EV-rushing_yards", "EV-passing_yards"]);
    expect(both.expiry).toBe("2026-11-24T12:00:00.000Z");
  });

  it("is null with nobody covered", () => {
    expect(lineupPurchase([], 10)).toEqual({ cushion: null, eventTickers: [], expiry: "" });
  });

  it("pays the shares together when priced against books", () => {
    const { cushion } = lineupPurchase(covered, 10);
    const books = {
      "S59.5": { bids: [{ price: 0.6, size: 100 }], asks: [] },
      "S199.5": { bids: [{ price: 0.5, size: 100 }], asks: [] },
    };
    const quote = priceCushion(cushion!, books);
    expect(quote.maxPayout).toBe(20);
    expect(quote.cost).toBe(9);
  });
});

describe("gamesSpan", () => {
  it("is the first and last kickoff", () => {
    const games = [{ startTime: "2026-11-23T01:00:00.000Z" }, { startTime: "2026-11-22T18:00:00.000Z" }, { startTime: "2026-11-27T18:00:00.000Z" }];
    expect(gamesSpan(games)).toEqual({ first: "2026-11-22T18:00:00.000Z", last: "2026-11-27T18:00:00.000Z" });
  });

  it("is null with no games", () => {
    expect(gamesSpan([])).toBeNull();
  });
});

describe("initials", () => {
  it("takes the first letter of the first and last word", () => {
    expect(initials("Brandon Miller")).toBe("BM");
    expect(initials("Amon-Ra St. Brown")).toBe("AB");
    expect(initials("C.J. Stroud")).toBe("CS");
  });

  it("takes two letters of a single name", () => {
    expect(initials("Nene")).toBe("NE");
    expect(initials("")).toBe("");
  });
});

describe("shortUsd", () => {
  it("drops .00 and keeps real cents", () => {
    expect(shortUsd(30)).toBe("$30");
    expect(shortUsd(12.5)).toBe("$12.50");
  });
});
