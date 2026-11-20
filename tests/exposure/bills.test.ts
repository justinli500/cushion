import { describe, expect, it } from "vitest";
import { priceCushion } from "@/domains/cushion/price";
import type { CushionQuote } from "@/domains/cushion/types";
import { autopilotStatus, billCushion, coverDay, dollarsPerPoint, pickLadders, startLevel } from "@/domains/exposure/bills";
import type { Book, Ladder } from "@/domains/markets/types";

const ladder = (expiry: string, underlying: Ladder["underlying"] = "BRENT", horizon: Ladder["horizon"] = "dated"): Ladder => ({
  kind: "ladder",
  eventTicker: `${underlying}${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}2200`,
  title: "Test",
  underlying,
  expiry,
  horizon,
  rungs: [90, 93, 96, 99].map((strike) => ({
    strike,
    contract: { symbol: `K${strike}`, label: `$${strike} or above`, quote: { bid: null, ask: null, last: null }, open: true },
  })),
});

describe("sizing", () => {
  it("sizes gas at 2.4 cents a gallon for each $1 on a barrel", () => {
    expect(dollarsPerPoint("gas", 50, 90)).toBeCloseTo(1.2, 10);
  });

  it("sizes heating at 40% of the bill spread over the gas price", () => {
    expect(dollarsPerPoint("heating", 150, 3.75)).toBeCloseTo(16, 10);
  });

  it("starts spikes-only cover 3% above the price and full cover at the price", () => {
    expect(startLevel("spike", 100)).toBeCloseTo(103, 10);
    expect(startLevel("full", 100)).toBe(100);
  });
});

describe("billCushion", () => {
  const books: Record<string, Book> = Object.fromEntries(
    [["K90", 0.52], ["K93", 0.13], ["K96", 0.04], ["K99", 0.03]].map(([symbol, ask]) => [symbol, { bids: [], asks: [{ price: ask as number, size: 100 }] }]),
  );
  const live = ladder("2026-11-20T22:00:00.000Z");

  it("spikes only buys YES from the first strike past the 3% jump, 3.6 contracts a rung for $1.20 a point", () => {
    const { legs } = billCushion({ ladder: live, spot: 90, level: "spike", dollarsPerPoint: 1.2 });
    expect(legs.map((l) => [l.symbol, l.side, l.quantity])).toEqual([["K93", "yes", 3.6], ["K96", "yes", 3.6], ["K99", "yes", 3.6]]);
  });

  it("full also buys the strike at the price, and costs several times more against the same book", () => {
    const spike = priceCushion(billCushion({ ladder: live, spot: 90, level: "spike", dollarsPerPoint: 1.2 }), books);
    const full = priceCushion(billCushion({ ladder: live, spot: 90, level: "full", dollarsPerPoint: 1.2 }), books);
    // 3.6 x (0.13 + 0.04 + 0.03) = 0.72, and the strike at 90 adds 3.6 x 0.52 = 1.87
    expect(spike.cost).toBe(0.72);
    expect(full.cost).toBe(2.59);
    expect(full.maxPayout).toBe(14.4);
  });
});

describe("pickLadders", () => {
  const now = Date.parse("2026-11-20T02:14:00Z");
  const today = ladder("2026-11-20T22:00:00.000Z");
  const monthEnd = ladder("2026-11-30T22:00:00.000Z");

  it("splits the day ladder from the month-end ladder and ignores other underlyings, intraday ladders and expired ones", () => {
    const picked = pickLadders(
      [monthEnd, today, ladder("2026-11-20T22:00:00.000Z", "NGAS"), ladder("2026-11-20T04:00:00.000Z", "BRENT", "intraday"), ladder("2026-11-19T22:00:00.000Z")],
      "BRENT",
      now,
    );
    expect(picked.daily?.expiry).toBe(today.expiry);
    expect(picked.monthEnd?.expiry).toBe(monthEnd.expiry);
  });

  it("takes tomorrow's ladder once it lists, an hour before today's closes", () => {
    const tomorrow = ladder("2026-11-21T22:00:00.000Z");
    const picked = pickLadders([today, tomorrow, monthEnd], "BRENT", Date.parse("2026-11-20T21:30:00Z"));
    expect(picked.daily?.expiry).toBe(tomorrow.expiry);
  });

  it("has no day ladder between one closing and the next listing", () => {
    expect(pickLadders([monthEnd], "BRENT", Date.parse("2026-11-20T22:30:00Z"))).toEqual({ daily: null, monthEnd });
  });
});

describe("autopilotStatus", () => {
  const quote = (cost: number, maxPayout = 10): CushionQuote => ({ legs: [], payoutMode: "sum", cost, maxPayout, requestedPayout: maxPayout, partial: false });
  const daily = { expiry: "2026-11-20T22:00:00.000Z" };
  const ready = { on: true, lastRun: "2026-11-19", daily, quote: quote(1.84), balance: 1000 };

  it("buys when on, a day ladder is open, it has not run for that day and the quote fits the balance", () => {
    expect(autopilotStatus(ready)).toBe("ready");
    expect(autopilotStatus({ ...ready, lastRun: null })).toBe("ready");
  });

  it("buys at exactly the balance", () => {
    expect(autopilotStatus({ ...ready, quote: quote(1000), balance: 1000 })).toBe("ready");
  });

  it("does nothing when off, with no ladder, or already run for that ladder's day", () => {
    expect(autopilotStatus({ ...ready, on: false })).toBe("off");
    expect(autopilotStatus({ ...ready, daily: null })).toBe("between-days");
    expect(autopilotStatus({ ...ready, lastRun: coverDay(daily) })).toBe("done");
  });

  it("waits for the book, and does nothing without a fill or past the balance", () => {
    expect(autopilotStatus({ ...ready, quote: null })).toBe("pricing");
    expect(autopilotStatus({ ...ready, quote: quote(0, 0) })).toBe("no-cover");
    expect(autopilotStatus({ ...ready, quote: quote(1.84, 0) })).toBe("no-cover");
    expect(autopilotStatus({ ...ready, quote: quote(1000.01), balance: 1000 })).toBe("too-expensive");
  });

  it("buys tomorrow's ladder after 22:00 UTC but never the same ladder twice across midnight", () => {
    const tomorrow = { expiry: "2026-11-21T22:00:00.000Z" };
    expect(autopilotStatus({ ...ready, lastRun: "2026-11-20", daily: tomorrow })).toBe("ready");
    expect(autopilotStatus({ ...ready, lastRun: "2026-11-21", daily: tomorrow })).toBe("done");
  });
});
