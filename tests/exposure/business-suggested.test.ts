import { describe, expect, it } from "vitest";
import { suggestedCities, suggestedTeams } from "@/domains/exposure/business";
import type { BucketMarket, Contract, Game } from "@/domains/markets/types";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const LATER = "2026-11-21T06:00:00.000Z";
const contract = (symbol: string, ask: number | null, open = true): Contract => ({ symbol, label: symbol, quote: { bid: ask == null ? null : ask - 0.02, ask, last: null }, open });

const weather = (city: string, asks: (number | null)[], expiry = LATER): BucketMarket => ({
  kind: "buckets",
  eventTicker: `WX-${city}`,
  title: `Highest temperature in ${city} on November 20`,
  city,
  unit: "F",
  expiry,
  buckets: asks.map((ask, i) => ({ lo: 70 + i * 2, hi: 71 + i * 2, contract: contract(`${city}-${i}`, ask) })),
});

const game = (home: string, away: string, volume: number, over: Partial<Game> = {}): Game => ({
  kind: "game",
  gameId: `${home}-${away}`,
  eventTicker: `NBA-${home}-${away}`,
  league: "NBA",
  title: `${away} vs ${home}`,
  startTime: "2026-11-21T00:30:00.000Z",
  expiry: "2026-11-22T00:30:00.000Z",
  isLive: false,
  hasDraw: false,
  volume,
  teams: [
    { abbr: home, name: `${home} Home`, side: "home", contract: contract(home, 0.6) },
    { abbr: away, name: `${away} Away`, side: "away", contract: contract(away, 0.42) },
  ],
  ...over,
});

describe("business suggestions before a choice is made", () => {
  it("offers cities with something on sale, well-known ones first", () => {
    const markets = [weather("Boston", [0.2, null, null]), weather("Chicago", [null, null]), weather("Denver", [0.1, 0.2]), weather("Miami", [0.3]), weather("Austin", [0.1, 0.3, 0.4]), weather("Expired", [0.5], "2026-11-20T06:00:00.000Z")];
    // Nobody is selling a Chicago range, and the last city's market has ended.
    expect(suggestedCities(markets, NOW)).toEqual(["Austin", "Miami", "Boston", "Denver"]);
    expect(suggestedCities(markets, NOW, 1)).toEqual(["Austin"]);
  });

  it("offers the home teams of the most-traded games still to start, each once", () => {
    const games = [
      game("DET", "TOR", 7000),
      game("UTA", "PHX", 9000),
      game("DET", "ATL", 100, { startTime: "2026-11-23T00:30:00.000Z" }),
      game("HOU", "KU", 50_000, { startTime: "2026-11-20T04:00:00.000Z" }),
      game("LAL", "BOS", 20_000, { teams: game("LAL", "BOS", 0).teams.map((t) => ({ ...t, contract: contract(t.abbr, null) })) }),
    ];
    const picks = suggestedTeams(games, NOW);
    // The Houston game has started and nobody is quoting the Lakers game, so neither is offered.
    expect(picks.map((p) => p.team.abbr)).toEqual(["UTA", "DET"]);
    expect(picks[1]).toEqual({ team: { league: "NBA", abbr: "DET", name: "DET Home" }, startTime: "2026-11-21T00:30:00.000Z" });
  });
});
