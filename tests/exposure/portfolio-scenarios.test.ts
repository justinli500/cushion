import { describe, expect, it } from "vitest";
import type { Exposure, HoldingRead } from "@/domains/exposure/portfolio";
import { buildScenarios, outOfPocket, type ScenarioInput } from "@/domains/exposure/portfolio-scenarios";
import type { Contract, EventMarket, Ladder } from "@/domains/markets/types";

const contract = (symbol: string, label: string, bid: number, ask: number): Contract => ({ symbol, label, quote: { bid, ask, last: null }, open: true });

/** Chance of finishing at or above each strike falls from 1 to 0; the even-money point is 62,500. */
const btcLadder = (expiry: string, horizon: Ladder["horizon"] = "dated"): Ladder => ({
  kind: "ladder",
  eventTicker: `BTC-${expiry}`,
  title: "BTC price on November 30",
  underlying: "BTC",
  expiry,
  horizon,
  rungs: [
    [55000, 0.97],
    [57500, 0.9],
    [60000, 0.7],
    [62500, 0.5],
    [65000, 0.25],
    [67500, 0.1],
    [70000, 0.03],
  ].map(([strike, p]) => ({ strike, contract: contract(`BTC-${expiry}-${strike}`, `$${strike} or above`, p - 0.01, p + 0.01) })),
});

const read = (symbol: string, value: number, status: "direct" | "index"): HoldingRead =>
  status === "direct" ? { symbol, value, status, underlying: "BTC" } : { symbol, value, status, fit: { beta: 1, r2: 0.9, days: 100 } };

const btcExposure = (dollars: number): Exposure => ({ underlying: "BTC", dollars, holdings: [read("BTC", Math.abs(dollars), "direct")] });

const spxLow: EventMarket = {
  kind: "event",
  eventTicker: "SPXLOW26",
  title: "How low will the S&P get this year?",
  category: "Economics",
  expiry: "2026-12-31T21:00:00.000Z",
  volume: 1000,
  // Gemini lists these out of order.
  outcomes: [
    ["6,200 or below", 6200],
    ["6,000 or below", 6000],
    ["6,100 or below", 6100],
  ].map(([label, level]) => ({ label: String(label), contract: contract(`GEMI-SPXLOW26-LE${level}`, String(label), 0.05, 0.1) })),
};

const input = (over: Partial<ScenarioInput>): ScenarioInput => ({ exposures: [], index: null, ladders: [], events: [], indexSpot: 7000, ...over });

describe("buildScenarios: coins and commodities", () => {
  const ladders = [btcLadder("2026-11-20T22:00:00.000Z"), btcLadder("2026-11-30T22:00:00.000Z"), btcLadder("2026-11-20T09:00:00.000Z", "intraday")];

  it("covers a fall with NO on the rungs below the expected close, on the latest dated ladder", () => {
    const [scenario] = buildScenarios(input({ exposures: [btcExposure(1000)], ladders }));
    expect(scenario.eventTicker).toBe("BTC-2026-11-30T22:00:00.000Z");
    expect(scenario.cushion.payoutMode).toBe("sum");
    expect(scenario.cushion.legs.map((l) => [l.side, l.strike])).toEqual([
      ["no", 60000],
      ["no", 57500],
      ["no", 55000],
    ]);
    expect(scenario.title).toBe("Bitcoin drops 12% by Nov 30");
    expect(scenario.hurts).toBe("Hits your BTC");
    expect(scenario.estimate).toBe(false);
    // $1,000 riding on a price expected at 62,500; the cover reaches 55,000.
    expect(scenario.loss).toBeCloseTo((1000 * 7500) / 62500, 5);
  });

  it("starts cover at the level the person moved it to, and lists every level for the chart", () => {
    const [scenario] = buildScenarios(input({ exposures: [btcExposure(1000)], ladders }), { "ladder:BTC": 57500 });
    expect(scenario.cushion.legs.map((l) => [l.side, l.strike])).toEqual([
      ["no", 57500],
      ["no", 55000],
    ]);
    expect(scenario.chart).toMatchObject({ symbol: "BTC", unit: "price", spot: 62500, falling: true, start: 57500, end: 55000 });
    // The outermost level on each side is left out: there is nothing beyond it to size a cover against.
    expect(scenario.chart.levels).toEqual([67500, 65000, 62500, 60000, 57500]);
    expect(scenario.protective).toBe(true);
    // A level the market does not list is ignored.
    expect(buildScenarios(input({ exposures: [btcExposure(1000)], ladders }), { "ladder:BTC": 58000 })[0].chart.start).toBe(60000);
  });

  it("keeps the same market when the furthest level is asked for, instead of jumping to another one", () => {
    const [scenario] = buildScenarios(input({ exposures: [btcExposure(1000)], ladders }), { "ladder:BTC": 55000 });
    // 55,000 is the last level, so it is not on offer: the cover stays on the month-end market at its usual start.
    expect(scenario.eventTicker).toBe("BTC-2026-11-30T22:00:00.000Z");
    expect(scenario.chart.start).toBe(60000);
    expect(scenario.cushion.legs.length).toBeGreaterThan(0);
  });

  it("pays on a rise when the level is moved above the price, and says that is a bet for someone who holds it", () => {
    const [scenario] = buildScenarios(input({ exposures: [btcExposure(1000)], ladders }), { "ladder:BTC": 67500 });
    expect(scenario.cushion.legs.map((l) => [l.side, l.strike])).toEqual([
      ["yes", 67500],
      ["yes", 70000],
    ]);
    expect(scenario).toMatchObject({ protective: false, loss: 0, title: "Bitcoin climbs 12% by Nov 30" });
    expect(scenario.hurts).toBe("A rise helps your BTC, so this is a bet on top, not a cushion");
    expect(scenario.chart).toMatchObject({ falling: false, start: 67500, end: 70000 });
  });

  it("covers a rise with YES for a holding that moves against the market, and says it is an estimate", () => {
    const against: Exposure = { underlying: "BTC", dollars: -500, holdings: [{ symbol: "SHORT", value: 500, status: "tracks", underlying: "BTC", fit: { beta: -1, r2: 0.5, days: 100 } }] };
    const [scenario] = buildScenarios(input({ exposures: [against], ladders }));
    expect(scenario.cushion.legs.every((l) => l.side === "yes")).toBe(true);
    expect(scenario.title).toMatch(/^Bitcoin climbs/);
    expect(scenario.estimate).toBe(true);
  });

  it("leaves out an exposure with no dated ladder", () => {
    expect(buildScenarios(input({ exposures: [btcExposure(1000)], ladders: [btcLadder("2026-11-20T09:00:00.000Z", "intraday")] }))).toEqual([]);
  });
});

describe("buildScenarios: the S&P 500", () => {
  const index = { dollars: 3500, holdings: [read("SPY", 3500, "index"), read("NVDA", 2000, "index")] };

  it("buys YES on each level from the nearest down, sized so the cover pays the loss at whichever level is reached", () => {
    const [scenario] = buildScenarios(input({ index, events: [spxLow] }));
    const legs = scenario.cushion.legs;
    expect(legs.map((l) => [l.side, l.strike])).toEqual([
      ["yes", 6200],
      ["yes", 6100],
      ["yes", 6000],
    ]);
    // $3,500 over a 7,000 index: 0.5 contracts per index point. 800 points to the first level, then 100 each.
    expect(legs.map((l) => l.quantity)).toEqual([400, 50, 50]);
    expect(legs.reduce((sum, l) => sum + l.quantity, 0)).toBeCloseTo(scenario.loss, 5);
    expect(scenario.loss).toBe(500);
    expect(scenario.estimate).toBe(true);
    expect(scenario.title).toBe("Stocks drop 14% by Dec 31");
    expect(scenario.hurts).toBe("Hits your SPY and NVDA");
    expect(scenario.market).toContain("even if it recovers");
  });

  it("is left out when Gemini lists no S&P market or the index price is unknown", () => {
    expect(buildScenarios(input({ index, events: [] }))).toEqual([]);
    expect(buildScenarios(input({ index, events: [spxLow], indexSpot: null }))).toEqual([]);
  });

  it("lists the biggest possible loss first across coins and the index", () => {
    const ladders = [btcLadder("2026-11-30T22:00:00.000Z")];
    const scenarios = buildScenarios(input({ exposures: [btcExposure(100)], index, events: [spxLow], ladders }));
    expect(scenarios.map((s) => s.id)).toEqual(["index", "ladder:BTC"]);
  });
});

describe("outOfPocket", () => {
  it("is the cost when the cover pays the whole loss, and the uncovered part plus the cost when it does not", () => {
    expect(outOfPocket(600, 66, 600)).toBe(66);
    expect(outOfPocket(600, 66, 900)).toBe(66);
    expect(outOfPocket(600, 66, 400)).toBe(266);
    expect(outOfPocket(600, 0, 0)).toBe(600);
  });
});
