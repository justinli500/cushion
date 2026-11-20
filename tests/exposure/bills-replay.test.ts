import { describe, expect, it } from "vitest";
import {
  dailySigma,
  dailyTicker,
  estimateYesPrice,
  firstTradedPrice,
  normalCdf,
  replay,
  replayDay,
  settledDates,
  toSettledDay,
  withReferences,
  type ReplayInput,
  type SettledDay,
} from "@/domains/exposure/bills-replay";
import { rawEventSchema } from "@/domains/markets/schemas";
import type { Ladder } from "@/domains/markets/types";
import settledBrent from "../fixtures/bills-settled-brent.json";

const ladder: Ladder = {
  kind: "ladder",
  eventTicker: "BRENT2611182200",
  title: "Test",
  underlying: "BRENT",
  expiry: "2026-11-18T22:00:00.000Z",
  horizon: "dated",
  rungs: [90, 91, 92, 93, 94, 95].map((strike) => ({
    strike,
    contract: { symbol: `K${strike}`, label: `$${strike} or above`, quote: { bid: null, ask: null, last: null }, open: true },
  })),
};

const wins = (through: number) => Object.fromEntries([90, 91, 92, 93, 94, 95].map((k) => [`K${k}`, k <= through ? "yes" : "no"] as const));
const traded = { K90: 0.9, K91: 0.7, K92: 0.5, K93: 0.2, K94: 0.1 };
const options = { dollarsPerPoint: 10, sigma: 1, firstTrade: traded };

describe("which days to replay", () => {
  it("lists the last days whose ladder has expired and settled, oldest first", () => {
    expect(settledDates(Date.parse("2026-11-20T02:14:00Z"), 3)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
  });

  it("leaves out today's ladder until 22:05 UTC", () => {
    expect(settledDates(Date.parse("2026-11-19T22:04:00Z"), 1)).toEqual(["2026-11-18"]);
    expect(settledDates(Date.parse("2026-11-19T22:05:00Z"), 1)).toEqual(["2026-11-19"]);
  });

  it("builds the event ticker from the expiry date", () => {
    expect(dailyTicker("BRENT", "2026-11-19")).toBe("BRENT2611192200");
    expect(dailyTicker("NGAS", "2026-01-05")).toBe("NGAS2601052200");
  });
});

describe("toSettledDay", () => {
  it("reads Gemini's real settled event: settlement, results and every rung open", () => {
    const day = toSettledDay(rawEventSchema.parse(settledBrent))!;
    expect(day.date).toBe("2026-11-18");
    expect(day.settle).toBeCloseTo(88.6957, 4);
    expect(day.ladder.rungs.map((r) => r.strike)).toEqual([86, 87, 88, 89, 90, 91, 92, 93]);
    expect(day.ladder.rungs.every((r) => r.contract.open)).toBe(true);
    expect(day.resolutions["GEMI-BRENT2611182200-HI88"]).toBe("yes");
    expect(day.resolutions["GEMI-BRENT2611182200-HI89"]).toBe("no");
  });

  it("returns null for an event that has not settled", () => {
    const open = rawEventSchema.parse({
      ...settledBrent,
      contracts: settledBrent.contracts.map((c) => ({ ...c, resolutionSide: undefined, settlementValue: undefined })),
    });
    expect(toSettledDay(open)).toBeNull();
  });
});

describe("withReferences", () => {
  const day = (date: string, settle: number): SettledDay => ({ date, settle, ladder, resolutions: {} });

  it("opens each day at the previous day's settlement and drops a day with none before it", () => {
    const inputs = withReferences([day("2026-11-15", 93.5), day("2026-11-16", 89.4), day("2026-11-18", 88.7)]);
    expect(inputs.map((d) => [d.date, d.reference])).toEqual([["2026-11-16", 93.5]]);
  });
});

describe("the estimate model", () => {
  it("takes the root mean square of day-to-day changes as one day's typical move", () => {
    expect(dailySigma([100, 102, 99, 101])).toBeCloseTo(Math.sqrt(17 / 3), 10);
    expect(dailySigma([100])).toBe(0);
  });

  it("is the normal curve", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 6);
    expect(normalCdf(-1.96)).toBeCloseTo(0.0249979, 6);
  });

  it("prices a strike at the opening price at 50 cents and one move above it at 16", () => {
    expect(estimateYesPrice(90, 90, 2)).toBe(0.5);
    expect(estimateYesPrice(92, 90, 2)).toBe(0.16);
    expect(estimateYesPrice(94, 90, 2)).toBe(0.02);
  });

  it("stays within 1 cent and 99 cents, even with no movement in the series", () => {
    expect(estimateYesPrice(200, 90, 2)).toBe(0.01);
    expect(estimateYesPrice(0, 90, 2)).toBe(0.99);
    expect(estimateYesPrice(91, 90, 0)).toBe(0.01);
  });

  it("takes the first traded price as the close of the first candle with volume", () => {
    const candle = (close: number, volume: number) => ({ time: 0, close, volume });
    expect(firstTradedPrice([candle(0.79, 0), candle(0.77, 12), candle(0.88, 3)])).toBe(0.77);
    expect(firstTradedPrice([candle(0.79, 0)])).toBeUndefined();
  });
});

describe("replayDay", () => {
  const day: ReplayInput = { date: "2026-11-18", settle: 93.5, reference: 90, ladder, resolutions: wins(93) };

  it("spikes only: YES on 93, 94 and 95 at 10 contracts, one leg never traded so it is estimated at 1 cent", () => {
    // cost 10 x 0.20 + 10 x 0.10 + 10 x 0.01 = 3.10, and only 93 pays: 10
    expect(replayDay(day, "spike", options)).toEqual({ date: "2026-11-18", settle: 93.5, cost: 3.1, payout: 10, estimated: true });
  });

  it("full: adds 90, 91 and 92 at their traded prices, and pays on every rung the price passed", () => {
    // cost 9 + 7 + 5 + 3.10 = 24.10, and 90 to 93 pay: 40
    expect(replayDay(day, "full", options)).toEqual({ date: "2026-11-18", settle: 93.5, cost: 24.1, payout: 40, estimated: true });
  });

  it("is not estimated when every leg traded", () => {
    const allTraded = { ...options, firstTrade: { ...traded, K95: 0.02 } };
    expect(replayDay(day, "spike", allTraded)).toMatchObject({ cost: 3.2, estimated: false });
  });

  it("costs nothing when no strike is listed past the 3% jump", () => {
    expect(replayDay({ ...day, reference: 93 }, "spike", options)).toMatchObject({ cost: 0, payout: 0, estimated: false });
  });

  it("is null when Gemini has not resolved one of the legs", () => {
    const partial = Object.fromEntries(Object.entries(wins(93)).filter(([symbol]) => symbol !== "K94"));
    expect(replayDay({ ...day, resolutions: partial }, "spike", options)).toBeNull();
  });
});

describe("replay", () => {
  const a: ReplayInput = { date: "2026-11-18", settle: 93.5, reference: 90, ladder, resolutions: wins(93) };
  const b: ReplayInput = { date: "2026-11-19", settle: 94.2, reference: 91, ladder, resolutions: wins(94) };

  it("totals cost, payout and net for each level across the days", () => {
    const { spike, full } = replay([a, b], options);
    // day b spikes: YES on 94 and 95 for 10 x 0.10 + 10 x 0.01 = 1.10, 94 pays 10
    expect(spike.days.map((d) => [d.date, d.cost, d.payout])).toEqual([["2026-11-18", 3.1, 10], ["2026-11-19", 1.1, 10]]);
    expect(spike.totals).toEqual({ cost: 4.2, payout: 20, net: 15.8 });
    // day b full: 7 + 5 + 2 + 1 + 0.10 = 15.10, and 91 to 94 pay 40
    expect(full.totals).toEqual({ cost: 39.2, payout: 80, net: 40.8 });
  });

  it("skips a day whose results are incomplete and reports empty totals for no days", () => {
    const { spike } = replay([a, { ...b, resolutions: {} }], options);
    expect(spike.days).toHaveLength(1);
    expect(replay([], options).full).toEqual({ days: [], totals: { cost: 0, payout: 0, net: 0 } });
  });
});
