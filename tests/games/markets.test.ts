import { describe, expect, it } from "vitest";
import type { Contract, Game, PlayerProp } from "@/domains/markets/types";
import { cushionChance, gameMarkets, pickCopy, pickCushion, quietGames, quoteIndex, youGet } from "@/domains/replay/worth-markets";

const contract = (symbol: string, bid: number | null, ask: number | null, open = true, label = symbol): Contract => ({
  symbol,
  label,
  quote: { bid, ask, last: null },
  open,
  image: null,
});

const game: Game = {
  kind: "game",
  gameId: "g",
  eventTicker: "NFL-X-M",
  league: "NFL",
  title: "Tennessee vs Dallas",
  startTime: "2026-11-22T18:00:00.000Z",
  expiry: "2026-11-23T06:00:00.000Z",
  isLive: false,
  hasDraw: false,
  volume: 0,
  teams: [
    { abbr: "DAL", name: "Dallas Cowboys", side: "home", contract: contract("DAL", 0.76, 0.77, true, "Dallas") },
    { abbr: "TEN", name: "Tennessee Titans", side: "away", contract: contract("TEN", 0.22, 0.23, true, "Tennessee") },
  ],
};

const prop = (player: string, metric: string, lines: [number, Contract][]): PlayerProp => ({
  gameId: "g",
  eventTicker: `NFL-X-${metric}`,
  expiry: game.expiry,
  player,
  team: null,
  position: null,
  metric,
  lines: lines.map(([line, c]) => ({ line, contract: c })),
});

const props = [
  prop("Dak Prescott", "passing_yards", [
    [199.5, contract("DP200", 0.85, 0.91)],
    [274.5, contract("DP275", 0.52, 0.57)],
  ]),
  prop("CeeDee Lamb", "receiving_yards", [[49.5, contract("CL50", 0.81, 0.91)]]),
  prop("Closed Man", "points", [[9.5, contract("CM10", 0.5, 0.5, false)]]),
];

describe("gameMarkets", () => {
  it("lists the away team's win market, the home team's, then the closest player calls", () => {
    const markets = gameMarkets(game, props);
    expect(markets.map((m) => m.question)).toEqual([
      "Tennessee Titans to win?",
      "Dallas Cowboys to win?",
      "Dak Prescott: 275+ passing yards?",
      "CeeDee Lamb: 50+ receiving yards?",
    ]);
    expect(markets[0]).toMatchObject({ kind: "team", yes: "the Titans win", no: "the Titans do not win", eventTicker: "NFL-X-M" });
    expect(markets[2]).toMatchObject({ kind: "player", no: "Dak Prescott finishes under 275 passing yards", eventTicker: "NFL-X-passing_yards" });
  });

  it("offers only the two win markets for a game with no player markets", () => {
    expect(gameMarkets(game, [])).toHaveLength(2);
  });

  it("words a college game by its school", () => {
    const college = { ...game, league: "NCAAF", };
    expect(gameMarkets(college, [])[0]).toMatchObject({ yes: "Tennessee wins", no: "Tennessee does not win" });
  });
});

describe("a pressed Yes or No", () => {
  const market = gameMarkets(game, props)[2];

  it("becomes a one-leg cushion on that side, in the person's words", () => {
    const pick = { market, side: "no" as const };
    expect(pickCushion(pick, 20).legs).toEqual([{ symbol: "DP275", side: "no", quantity: 20, label: "DP275" }]);
    expect(pickCopy(pick, 20)).toEqual({ title: "Dak Prescott: 275+ passing yards: No", detail: "Pays $20 if Dak Prescott finishes under 275 passing yards." });
    expect(pickCopy({ market, side: "yes" }, 20).detail).toBe("Pays $20 if Dak Prescott gets 275+ passing yards.");
  });

  it("has nothing to buy on a closed market", () => {
    expect(pickCushion({ market: { ...market, contract: { ...market.contract, open: false } }, side: "yes" }, 20).legs).toEqual([]);
  });

  it("is the player's quiet game when it is the No side of the suggested line", () => {
    expect(quietGames(props).map((q) => q.side)).toEqual(["no", "no"]);
  });
});

describe("cushionChance and youGet", () => {
  const quotes = quoteIndex(game, props);

  it("gives the chance a one-contract cushion pays, from the current quote", () => {
    expect(cushionChance([{ symbol: "TEN", side: "yes", filled: 10 }], quotes)?.p).toBeCloseTo(0.225);
    expect(cushionChance([{ symbol: "TEN", side: "no", filled: 10 }], quotes)?.p).toBeCloseTo(0.775);
  });

  it("gives none for a cushion spread over several contracts, or one with no quote", () => {
    expect(cushionChance([{ symbol: "TEN", side: "yes", filled: 10 }, { symbol: "DAL", side: "no", filled: 10 }], quotes)).toBeNull();
    expect(cushionChance([{ symbol: "UNKNOWN", side: "yes", filled: 10 }], quotes)).toBeNull();
  });

  it("turns the ticket's sentence into the panel's caption", () => {
    expect(youGet("Pays $20 if the Texans lose to the Colts.")).toBe("If the Texans lose to the Colts, you get");
    expect(youGet("Something else")).toBe("If it goes against you, you get");
  });
});
