import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trustedImage, toBucketMarket, toContract, toEventMarket, toGame, toLadder, toPlayerProps } from "@/domains/markets/normalise";
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

  it("passes on a picture only when it is on Gemini's or ESPN's image host", () => {
    const raw = { label: "Houston", ticker: "HOU", instrumentSymbol: "GEMI-NFL-TEST-M-HOU", status: "active" };
    const logo = "https://assets.gemini.com/predictions/images/Houston_Texans.avif";
    expect(toContract({ ...raw, imageUrl: logo }).image).toBe(logo);
    expect(toContract({ ...raw, imageUrl: "https://evil.example/track.png" }).image).toBeNull();
    expect(toContract({ ...raw, imageUrl: "javascript:alert(1)" }).image).toBeNull();
    expect(toContract(raw).image).toBeNull();
    expect(trustedImage("https://a.espncdn.com/i/teamlogos/nfl/500/hou.png")).toBe("https://a.espncdn.com/i/teamlogos/nfl/500/hou.png");
    expect(trustedImage("https://a.espncdn.com.evil.example/x.png")).toBeNull();
    expect(trustedImage(undefined)).toBeNull();
  });

  it("turns a news event into its open yes/no outcomes", () => {
    const [event] = eventsResponseSchema.parse({
      data: [
        {
          ticker: "FED261211",
          title: "Fed decision in December?",
          category: "Economics",
          expiryDate: "2026-12-11T19:00:00.000Z",
          volume: "14638",
          contracts: [
            { label: "Hike 25bps", ticker: "HIKE25", instrumentSymbol: "GEMI-FED261211-HIKE25", status: "active", prices: { bestBid: "0.89", bestAsk: "0.93" } },
            { label: "Cut 25bps", ticker: "CUT25", instrumentSymbol: "GEMI-FED261211-CUT25", status: "settled", prices: {} },
          ],
        },
      ],
    }).data;
    const market = toEventMarket(event)!;
    expect(market).toMatchObject({ kind: "event", title: "Fed decision in December?", category: "Economics", volume: 14638 });
    expect(market.outcomes.map((o) => [o.label, o.contract.quote.bid, o.contract.quote.ask])).toEqual([["Hike 25bps", 0.89, 0.93]]);
    expect(toEventMarket({ ...event, contracts: [] })).toBeNull();
  });

  it("reads a temperature market's unit from its contract labels", () => {
    const market = (label: string, ticker: string) => {
      const [event] = eventsResponseSchema.parse({
        data: [
          {
            ticker: "WXHIGH-TEST-261120",
            title: "Highest temperature in Toronto on November 20, 2026?",
            category: "Weather",
            expiryDate: "2026-11-21T06:00:00.000Z",
            contracts: [{ label, ticker, instrumentSymbol: `GEMI-WXHIGH-TEST-261120-${ticker}`, status: "active", prices: { bestBid: "0.2", bestAsk: "0.3" } }],
          },
        ],
      }).data;
      return toBucketMarket(event)!;
    };
    expect(market("10°C", "10TO10")).toMatchObject({ unit: "C", buckets: [{ lo: 10, hi: 10 }] });
    expect(market("62°F to 63°F", "62TO63").unit).toBe("F");
  });
});
