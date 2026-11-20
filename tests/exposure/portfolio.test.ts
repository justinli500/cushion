import { describe, expect, it } from "vitest";
import { cleanSymbol, exposures, indexExposure, readHolding, regress, type PricePoint } from "@/domains/exposure/portfolio";

/** Deterministic pseudo-random daily moves (mulberry32), so each seed is an independent series. */
function moves(seed: number, days: number, scale: number): number[] {
  let state = seed;
  return Array.from({ length: days }, () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5) * scale;
  });
}

function series(days: number, move: (i: number) => number): PricePoint[] {
  let close = 100;
  return Array.from({ length: days }, (_, i) => {
    close *= 1 + move(i);
    return { date: new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10), close };
  });
}

const DAYS = 120;
const btcMoves = moves(1, DAYS, 0.06);
const oilMoves = moves(2, DAYS, 0.04);
const wobble = moves(9, DAYS, 0.004);
const btc = series(DAYS, (i) => btcMoves[i]);
const oil = series(DAYS, (i) => oilMoves[i]);
const miner = series(DAYS, (i) => btcMoves[i] * 1.5 + wobble[i]);
const airline = series(DAYS, (i) => -oilMoves[i] * 0.8 + wobble[i]);
const sodaMoves = moves(5, DAYS, 0.02);
const unrelated = series(DAYS, (i) => sodaMoves[i]);
const marketMoves = moves(3, DAYS, 0.02);
const spx = series(DAYS, (i) => marketMoves[i]);
const bigCap = series(DAYS, (i) => marketMoves[i] * 1.2 + wobble[i]);
const history = { BTC: btc, BRENT: oil, MINER: miner, AIR: airline, SODA: unrelated, THIN: btc.slice(0, 10), SPX: spx, BIGCAP: bigCap };

describe("regress", () => {
  it("recovers how hard a holding moves with a factor", () => {
    const fit = regress(miner, btc)!;
    expect(fit.beta).toBeCloseTo(1.5, 1);
    expect(regress(airline, oil)!.beta).toBeCloseTo(-0.8, 1);
    expect(fit.r2).toBeGreaterThan(0.9);
    expect(fit.days).toBe(119);
  });

  it("compares moves over the same span when one series skips days", () => {
    const weekdaysOnly = miner.filter((_, i) => i % 7 < 5);
    expect(regress(weekdaysOnly, btc)!.beta).toBeCloseTo(1.5, 1);
  });

  it("returns nothing without enough shared days", () => {
    expect(regress(btc.slice(0, 20), oil)).toBeNull();
  });
});

describe("readHolding", () => {
  const factors = ["BTC", "BRENT"] as const;

  it("maps a listed coin straight to its own market", () => {
    expect(readHolding({ symbol: "BTC", value: 2000 }, history, [...factors])).toMatchObject({ status: "direct", underlying: "BTC" });
  });

  it("finds the market a stock moves with, including one it moves against", () => {
    expect(readHolding({ symbol: "MINER", value: 800 }, history, [...factors])).toMatchObject({ status: "tracks", underlying: "BTC" });
    const air = readHolding({ symbol: "AIR", value: 500 }, history, [...factors]);
    expect(air).toMatchObject({ status: "tracks", underlying: "BRENT" });
    expect(air.status === "tracks" && air.fit.beta).toBeLessThan(0);
  });

  it("says so when nothing listed moves with the holding, or when there is no history", () => {
    expect(readHolding({ symbol: "SODA", value: 500 }, history, [...factors]).status).toBe("none");
    expect(readHolding({ symbol: "THIN", value: 500 }, history, [...factors]).status).toBe("unknown");
    expect(readHolding({ symbol: "NOPE", value: 500 }, history, [...factors]).status).toBe("unknown");
  });
});

describe("readHolding against the S&P 500", () => {
  const reads = (symbol: string, index: boolean) => readHolding({ symbol, value: 1000 }, history, ["BTC", "BRENT"], index);

  it("reads a stock that moves with the index as tracking it, when asked to look", () => {
    const big = reads("BIGCAP", true);
    expect(big.status).toBe("index");
    expect(big.status === "index" && big.fit.beta).toBeCloseTo(1.2, 1);
    expect(reads("BIGCAP", false).status).toBe("none");
  });

  it("still prefers a coin or commodity that explains the holding better", () => {
    expect(reads("MINER", true)).toMatchObject({ status: "tracks", underlying: "BTC" });
  });

  it("sums what the index holdings have riding on it and leaves them out of the per-market exposures", () => {
    const all = [reads("BIGCAP", true), readHolding({ symbol: "BTC", value: 2000 }, history, ["BTC"], true)];
    expect(exposures(all).map((e) => e.underlying)).toEqual(["BTC"]);
    expect(indexExposure(all)!.dollars).toBeCloseTo(1200, -2);
    expect(indexExposure([all[1]])).toBeNull();
  });
});

describe("exposures", () => {
  it("adds up dollars per market, signed, largest first", () => {
    const reads = [
      readHolding({ symbol: "AIR", value: 500 }, history, ["BTC", "BRENT"]),
      readHolding({ symbol: "BTC", value: 2000 }, history, ["BTC", "BRENT"]),
      readHolding({ symbol: "MINER", value: 800 }, history, ["BTC", "BRENT"]),
      readHolding({ symbol: "SODA", value: 900 }, history, ["BTC", "BRENT"]),
    ];
    const [first, second] = exposures(reads);
    expect(first.underlying).toBe("BTC");
    expect(first.dollars).toBeCloseTo(2000 + 800 * 1.5, -2);
    expect(first.holdings.map((h) => h.symbol)).toEqual(["BTC", "MINER"]);
    expect(second.underlying).toBe("BRENT");
    expect(second.dollars).toBeLessThan(0);
    expect(exposures(reads)).toHaveLength(2);
  });
});

describe("cleanSymbol", () => {
  it("tidies input and maps common names", () => {
    expect([cleanSymbol(" btc "), cleanSymbol("gold"), cleanSymbol("xom")]).toEqual(["BTC", "XAU", "XOM"]);
  });
});
