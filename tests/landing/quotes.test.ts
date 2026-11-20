import { describe, expect, it } from "vitest";
import { bizQuote, fantasyQuote, portfolioQuote, teamQuote } from "@/domains/landing/quotes";
import type { BucketMarket, Contract, Game, Ladder, PlayerProp } from "@/domains/markets/types";

const contract = (symbol: string, bid: number | null, ask: number | null, label = symbol): Contract => ({ symbol, label, quote: { bid, ask, last: null }, open: true });

describe("landing quotes", () => {
  it("prices a home loss at the cheaper of the two contracts", () => {
    const game: Game = {
      kind: "game",
      gameId: "g1",
      eventTicker: "NFL-G1",
      league: "NFL",
      title: "Indianapolis vs Houston",
      startTime: "2026-11-22T18:00:00.000Z",
      expiry: "2026-11-23T18:00:00.000Z",
      isLive: false,
      hasDraw: false,
      volume: 900,
      teams: [
        { abbr: "HOU", name: "Houston Texans", side: "home", contract: contract("HOU", 0.7, 0.72, "Houston") },
        { abbr: "IND", name: "Indianapolis Colts", side: "away", contract: contract("IND", 0.27, 0.31, "Indianapolis") },
      ],
    };
    // Texans lose: Yes on the Colts costs 0.31, No on the Texans costs 1 - 0.70 = 0.30.
    const quote = teamQuote([game])!;
    expect(quote).toMatchObject({ cost: 12, payout: 40, trigger: "The Texans lose to the Colts", fill: "40 × No at 30¢", market: "Houston win?", href: "/games/g1" });
    expect(teamQuote([{ ...game, teams: game.teams.map((t) => ({ ...t, contract: contract(t.abbr, null, null) })) }])).toBeNull();
  });

  it("covers a 2% Bitcoin drop with the first strike under it", () => {
    const ladder: Ladder = {
      kind: "ladder",
      eventTicker: "BTC",
      title: "BTC price on a day",
      underlying: "BTC",
      expiry: "2026-11-20T22:00:00.000Z",
      horizon: "dated",
      rungs: [
        [59000, 0.9], [60000, 0.7], [61000, 0.6], [62000, 0.4],
      ].map(([strike, p]) => ({ strike, contract: contract(`K${strike}`, p - 0.01, p + 0.01) })),
    };
    // Even odds sit at 61,500, so 2% under is 60,270 and the first strike at or below it is 60,000.
    const quote = portfolioQuote([ladder])!;
    expect(quote.trigger).toBe("Bitcoin closes below $60,000 today");
    expect(quote).toMatchObject({ payout: 60, cost: 18.6, fill: "60 × No at 31¢" });
  });

  it("covers a cool day with every range under the likeliest one", () => {
    const market: BucketMarket = {
      kind: "buckets", unit: "F",
      eventTicker: "WX",
      title: "Highest temperature in Austin",
      city: "Austin",
      expiry: new Date(Date.now() + 30 * 3_600_000).toISOString(),
      buckets: [
        { lo: null, hi: 73, contract: contract("LO73", 0.02, 0.04) },
        { lo: 74, hi: 75, contract: contract("74TO75", 0.2, 0.22) },
        { lo: 76, hi: 77, contract: contract("76TO77", 0.5, 0.56) },
        { lo: 78, hi: null, contract: contract("HI78", 0.1, 0.14) },
      ],
    };
    const quote = bizQuote([market], "Austin")!;
    expect(quote).toMatchObject({ payout: 100, cost: 26, coveredOf: 400, fill: "100 × Yes across 2 ranges at 26¢" });
    expect(quote.trigger).toContain("under 76°F");
  });

  it("picks the player line nearest a one-in-three miss", () => {
    const prop: PlayerProp = {
      gameId: "g",
      eventTicker: "E",
      expiry: "2026-11-23T18:00:00.000Z",
      player: "Jonathan Taylor",
      team: null,
      position: "RB",
      metric: "rushing_yards",
      lines: [
        { line: 39.5, contract: contract("T40", 0.84, 0.86) },
        { line: 59.5, contract: contract("T60", 0.63, 0.65) },
      ],
    };
    expect(fantasyQuote([prop])).toMatchObject({ trigger: "Jonathan Taylor finishes under 60 rushing yards", cost: 11.1, payout: 30, fill: "30 × No at 37¢" });
  });
});
