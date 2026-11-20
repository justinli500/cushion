import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toBucketMarket, toGame, toLadder, toPlayerProps } from "@/domains/markets/normalise";
import { bookResponseSchema, eventsResponseSchema } from "@/domains/markets/schemas";

// Real Gemini responses, captured by scripts/capture-fixtures.mjs.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const events = (name: string) => eventsResponseSchema.parse({ data: fixture(name) }).data;

describe("normalising Gemini events", () => {
  it("turns a dated price event into an ascending ladder", () => {
    const ladders = [...events("crypto-events.json"), ...events("commodity-events.json")].map(toLadder);
    expect(ladders.every((l) => l !== null)).toBe(true);

    const btc = ladders.find((l) => l?.underlying === "BTC" && l.horizon === "dated")!;
    const strikes = btc.rungs.map((r) => r.strike);
    expect(strikes).toEqual([...strikes].sort((a, b) => a - b));
    expect(btc.rungs.length).toBeGreaterThan(5);
    expect(btc.rungs[0].contract.symbol).toMatch(/^GEMI-BTC\d+-HI\d+$/);

    expect(ladders.some((l) => l?.underlying === "BRENT")).toBe(true);
    expect(ladders.some((l) => l?.horizon === "intraday")).toBe(true);
  });

  it("reads temperature bounds from weather contract tickers", () => {
    const market = events("weather-events.json").map(toBucketMarket).find((m) => m !== null)!;
    expect(market.city).toBe("Austin");
    const [coldest] = market.buckets;
    const hottest = market.buckets[market.buckets.length - 1];
    expect(coldest.lo).toBeNull();
    expect(hottest.hi).toBeNull();
    const middle = market.buckets.slice(1, -1);
    expect(middle.every((b) => b.lo != null && b.hi != null && b.hi - b.lo === 1)).toBe(true);
  });

  it("builds a game with a contract for each side", () => {
    const games = events("moneyline-events.json").map(toGame).filter((g) => g !== null);
    expect(games.length).toBeGreaterThan(0);
    for (const game of games) {
      expect(game.teams.map((t) => t.side).sort()).toEqual(["away", "home"]);
      expect(game.teams.every((t) => t.contract.symbol.endsWith(`-${t.abbr}`))).toBe(true);
    }
  });

  it("groups prop contracts by player with ascending lines", () => {
    const props = events("game-events.json").flatMap(toPlayerProps);
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      const lines = prop.lines.map((l) => l.line);
      expect(lines).toEqual([...lines].sort((a, b) => a - b));
      expect(prop.lines.every((l) => l.contract.label.startsWith(prop.player))).toBe(true);
    }
    expect(new Set(props.map((p) => p.metric)).has("rushing_yards")).toBe(true);
  });

  it("ignores events of the wrong kind", () => {
    const [weather] = events("weather-events.json");
    expect(toLadder(weather)).toBeNull();
    expect(toGame(weather)).toBeNull();
    expect(toPlayerProps(weather)).toEqual([]);
  });

  it("parses a live order book with numeric prices", () => {
    const book = bookResponseSchema.parse(fixture("book.json").book);
    expect([...book.bids, ...book.asks].every((l) => typeof l.price === "number" && l.amount > 0)).toBe(true);
  });
});
