import { describe, expect, it } from "vitest";
import { playerUnderLegs, stripLegs, stripPayoutAt, teamLossLegs, temperatureLegs } from "@/domains/cushion/legs";
import { filledLegs, priceCushion, priceLeg, settleLegs } from "@/domains/cushion/price";
import { chanceAtOrAbove, chanceOf, impliedSpot, survivalCurve, yesChance } from "@/domains/cushion/probability";
import type { BucketMarket, Contract, Game, Ladder } from "@/domains/markets/types";

const contract = (symbol: string, bid: number | null = null, ask: number | null = null, open = true): Contract => ({
  symbol,
  label: symbol,
  quote: { bid, ask, last: null },
  open,
});

const ladder = (rungs: [strike: number, bid: number | null, ask: number | null][]): Ladder => ({
  kind: "ladder",
  eventTicker: "TEST",
  title: "Test price on a day",
  underlying: "BTC",
  expiry: "2026-11-20T22:00:00.000Z",
  horizon: "dated",
  rungs: rungs.map(([strike, bid, ask]) => ({ strike, contract: contract(`K${strike}`, bid, ask) })),
});

describe("stripLegs", () => {
  const even = ladder([[60, 0.9, 0.92], [61, 0.7, 0.72], [62, 0.5, 0.52], [63, 0.3, 0.32]]);

  it("covers a fall with NO on each strike at or below the start, sized to the gap below it", () => {
    const { legs, payoutMode } = stripLegs({ ladder: even, direction: "fall", startLevel: 62, dollarsPerPoint: 10 });
    expect(payoutMode).toBe("sum");
    expect(legs.map((l) => [l.strike, l.side, l.quantity])).toEqual([[62, "no", 10], [61, "no", 10], [60, "no", 10]]);
  });

  it("pays at least the loss measured from the first strike, down to the last strike", () => {
    const { legs } = stripLegs({ ladder: even, direction: "fall", startLevel: 62, dollarsPerPoint: 10 });
    for (const settle of [61.99, 61.5, 61, 60.2, 60]) {
      expect(stripPayoutAt(legs, settle)).toBeGreaterThanOrEqual(10 * (62 - settle) - 1e-9);
    }
    expect(stripPayoutAt(legs, 61.5)).toBe(10);
    expect(stripPayoutAt(legs, 62)).toBe(0);
    expect(stripPayoutAt(legs, 50)).toBe(30);
  });

  it("covers a rise with YES on each strike at or above the start", () => {
    const { legs } = stripLegs({ ladder: even, direction: "rise", startLevel: 61, dollarsPerPoint: 10 });
    expect(legs.map((l) => [l.strike, l.side, l.quantity])).toEqual([[61, "yes", 10], [62, "yes", 10], [63, "yes", 10]]);
    expect(stripPayoutAt(legs, 62.4)).toBe(20);
    expect(stripPayoutAt(legs, 60.9)).toBe(0);
  });

  it("sizes uneven ladders by each gap and skips closed rungs", () => {
    const brent = ladder([[84, 0.97, null], [87, 0.91, 0.95], [90, 0.47, 0.5], [93, 0.07, 0.11]]);
    brent.rungs[0].contract.open = false;
    const { legs } = stripLegs({ ladder: brent, direction: "fall", startLevel: 90, dollarsPerPoint: 2 });
    expect(legs.map((l) => [l.strike, l.quantity])).toEqual([[90, 6], [87, 6]]);
  });

  it("returns no legs when nothing is listed past the start level", () => {
    expect(stripLegs({ ladder: even, direction: "fall", startLevel: 59, dollarsPerPoint: 10 }).legs).toEqual([]);
  });
});

describe("priceLeg", () => {
  const book = {
    bids: [{ price: 0.55, size: 100 }, { price: 0.6, size: 10 }],
    asks: [{ price: 0.06, size: 100 }, { price: 0.04, size: 250 }, { price: 0.05, size: 25 }],
  };
  const leg = (side: "yes" | "no", quantity: number) => ({ symbol: "S", side, quantity, label: "S" });

  it("buys YES up the asks, cheapest first", () => {
    expect(priceLeg(leg("yes", 300), book)).toMatchObject({ filled: 300, cost: 12.75 });
  });

  it("buys NO by selling YES into the bids at one minus each bid", () => {
    expect(priceLeg(leg("no", 50), book)).toMatchObject({ filled: 50, cost: 22 });
  });

  it("fills only what the book holds", () => {
    expect(priceLeg(leg("no", 500), book)).toMatchObject({ filled: 110, cost: 49 });
    expect(priceLeg(leg("yes", 5), undefined)).toMatchObject({ filled: 0, cost: 0 });
  });
});

describe("priceCushion", () => {
  const books = { A: { bids: [], asks: [{ price: 0.1, size: 20 }] }, B: { bids: [], asks: [{ price: 0.2, size: 5 }] } };
  const legs = [
    { symbol: "A", side: "yes" as const, quantity: 20, label: "A" },
    { symbol: "B", side: "yes" as const, quantity: 20, label: "B" },
  ];

  it("adds payouts when legs can pay together and reports a thin book", () => {
    const quote = priceCushion({ legs, payoutMode: "sum" }, books);
    expect(quote).toMatchObject({ cost: 3, maxPayout: 25, requestedPayout: 40, partial: true });
    expect(filledLegs(quote).map((l) => l.quantity)).toEqual([20, 5]);
  });

  it("takes the largest leg when only one leg can pay", () => {
    expect(priceCushion({ legs, payoutMode: "one" }, books)).toMatchObject({ maxPayout: 20, requestedPayout: 20 });
  });
});

describe("settleLegs", () => {
  const legs = [
    { symbol: "A", side: "no" as const, quantity: 10, label: "A", filled: 10, cost: 4 },
    { symbol: "B", side: "no" as const, quantity: 10, label: "B", filled: 6, cost: 3 },
  ];

  it("waits until every leg has resolved", () => {
    expect(settleLegs(legs, { A: "no" })).toBeNull();
  });

  it("pays the filled size of each leg that resolved on its side", () => {
    expect(settleLegs(legs, { A: "no", B: "yes" })).toBe(10);
    expect(settleLegs(legs, { A: "no", B: "no" })).toBe(16);
  });
});

describe("probability", () => {
  it("uses the midpoint and flags a wide spread", () => {
    const tight = yesChance({ bid: 0.4, ask: 0.44, last: null });
    expect(tight.p).toBeCloseTo(0.42);
    expect(tight).toMatchObject({ low: 0.4, high: 0.44, uncertain: false });
    expect(yesChance({ bid: 0.62, ask: 0.98, last: null }).uncertain).toBe(true);
    expect(yesChance({ bid: null, ask: null, last: null }).p).toBeNull();
  });

  it("flips the range for the NO side", () => {
    const no = chanceOf({ bid: 0.89, ask: 0.91, last: null }, "no");
    expect(no.p).toBeCloseTo(0.1);
    expect(no.low).toBeCloseTo(0.09);
    expect(no.high).toBeCloseTo(0.11);
  });

  it("forces the ladder to fall as the strike rises", () => {
    const wobbly = ladder([[60, 0.7, 0.74], [61, 0.62, 0.65], [62, 0.64, 0.68], [63, 0.38, 0.42]]);
    expect(survivalCurve(wobbly).map((p) => p.p)).toEqual([0.72, 0.635, 0.635, 0.4]);
  });

  it("interpolates the chance and the implied price between rungs", () => {
    const smooth = ladder([[60, 0.78, 0.82], [62, 0.58, 0.62], [64, 0.38, 0.42]]);
    expect(chanceAtOrAbove(smooth, 61)).toBeCloseTo(0.7);
    expect(impliedSpot(smooth)).toBeCloseTo(63);
    expect(chanceAtOrAbove(ladder([[60, null, null]]), 60)).toBeNull();
  });
});

describe("temperatureLegs", () => {
  const market: BucketMarket = {
    kind: "buckets", unit: "F",
    eventTicker: "WX",
    title: "Highest temperature in Austin on a day",
    city: "Austin",
    expiry: "2026-11-21T04:59:59.000Z",
    buckets: [
      { lo: null, hi: 73, contract: contract("LO73", 0.02, 0.04) },
      { lo: 74, hi: 75, contract: contract("74TO75", 0.34, 0.39) },
      { lo: 76, hi: 77, contract: contract("76TO77", 0.51, 0.56) },
      { lo: 78, hi: null, contract: contract("HI78", 0.06, 0.08) },
    ],
  };

  it("buys every bucket wholly below the threshold, and only one of them can pay", () => {
    const cold = temperatureLegs({ market, direction: "below", threshold: 76, payout: 100 });
    expect(cold.payoutMode).toBe("one");
    expect(cold.legs.map((l) => [l.symbol, l.side, l.quantity])).toEqual([["LO73", "yes", 100], ["74TO75", "yes", 100]]);
  });

  it("buys every bucket wholly above the threshold", () => {
    const hot = temperatureLegs({ market, direction: "above", threshold: 75, payout: 50 });
    expect(hot.legs.map((l) => l.symbol)).toEqual(["76TO77", "HI78"]);
  });
});

describe("teamLossLegs", () => {
  const game = (hasDraw: boolean): Game => ({
    kind: "game",
    gameId: "g",
    eventTicker: "NFL-TEST",
    league: "NFL",
    title: "Away vs Home",
    startTime: "2026-11-20T01:15:00.000Z",
    expiry: "2026-11-21T13:15:00.000Z",
    isLive: false,
    hasDraw,
    volume: 0,
    teams: [
      { abbr: "HOM", name: "Home", side: "home", contract: contract("HOM", 0.62, 0.64) },
      { abbr: "AWY", name: "Away", side: "away", contract: contract("AWY", 0.33, 0.4) },
    ],
  });

  it("uses whichever contract is cheaper when there are no draws", () => {
    // Home loses: YES on Away costs 0.40, NO on Home costs 1 - 0.62 = 0.38.
    expect(teamLossLegs(game(false), "HOM", 20).legs).toMatchObject([{ symbol: "HOM", side: "no", quantity: 20 }]);
    // Away loses: YES on Home costs 0.64, NO on Away costs 1 - 0.33 = 0.67.
    expect(teamLossLegs(game(false), "AWY", 20).legs).toMatchObject([{ symbol: "HOM", side: "yes", quantity: 20 }]);
  });

  it("only backs the opponent when a draw is possible", () => {
    expect(teamLossLegs(game(true), "HOM", 20).legs).toMatchObject([{ symbol: "AWY", side: "yes" }]);
  });
});

describe("playerUnderLegs", () => {
  it("buys NO on the line", () => {
    const line = { line: 59.5, contract: contract("TAYLOR60", 0.5, 0.54) };
    expect(playerUnderLegs(line, 15).legs).toMatchObject([{ symbol: "TAYLOR60", side: "no", quantity: 15 }]);
  });
});
