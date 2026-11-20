import { describe, expect, it } from "vitest";
import { teamLossLegs } from "@/domains/cushion/legs";
import { priceCushion, settleLegs, filledLegs } from "@/domains/cushion/price";
import { along, frameAt, moments, replayBooks, replayResolutions, replaySchema, replaySpan, valueNow, cleaned, type Replay } from "@/domains/replay/replay";

const KICKOFF = Date.UTC(2026, 10, 20, 1, 15);
const MIN = 60_000;

const replay: Replay = replaySchema.parse({
  id: "test-game",
  league: "NFL",
  eventTicker: "NFL-TEST-M",
  capturedAt: "2026-11-20T05:00:00.000Z",
  final: true,
  home: {
    abbr: "HOU",
    name: "Houston Texans",
    score: 24,
    symbol: "GEMI-NFL-TEST-M-HOU",
    trades: [
      { t: KICKOFF - 30 * MIN, price: 0.85, size: 10 },
      { t: KICKOFF + 20 * MIN, price: 0.6, size: 5 },
      { t: KICKOFF + 50 * MIN, price: 0.95, size: 8 },
    ],
  },
  away: {
    abbr: "IND",
    name: "Indianapolis Colts",
    score: 10,
    symbol: "GEMI-NFL-TEST-M-IND",
    trades: [{ t: KICKOFF + 20 * MIN, price: 0.4, size: 5 }],
  },
  plays: [
    { t: KICKOFF, period: 1, clock: "15:00", text: "Kickoff.", home: 0, away: 0, scoring: false, homeWinProb: 0.7 },
    { t: KICKOFF + 15 * MIN, period: 1, clock: "4:10", text: "Colts touchdown.", home: 0, away: 7, scoring: true, homeWinProb: 0.5 },
    { t: KICKOFF + 60 * MIN, period: 4, clock: "0:02", text: "Texans kneel.", home: 24, away: 10, scoring: false, homeWinProb: 0.99 },
  ],
});

describe("frameAt", () => {
  it("shows the pre-game price and no score before kickoff", () => {
    const frame = frameAt(replay, KICKOFF - MIN);
    expect(frame.score).toMatchObject({ state: "pre", clock: "", period: "" });
    expect(frame.plays).toEqual([]);
    expect(frame.game.isLive).toBe(false);
    const home = frame.game.teams.find((t) => t.side === "home")!;
    expect(home.contract.quote).toEqual({ bid: 0.84, ask: 0.86, last: 0.85 });
    expect(frame.game.teams.find((t) => t.side === "away")!.contract.quote.last).toBeNull();
  });

  it("carries the score, clock, plays and prices as of that moment, never later ones", () => {
    const frame = frameAt(replay, KICKOFF + 25 * MIN);
    expect(frame.score).toMatchObject({ state: "live", period: "1st", clock: "4:10", home: { score: 0 }, away: { score: 7 } });
    expect(frame.plays.map((p) => p.text)).toEqual(["Colts touchdown.", "Kickoff."]);
    expect(frame.plays[0]).toMatchObject({ scoringPlay: true, period: "1st" });
    expect(frame.game.teams.map((t) => t.contract.quote.last)).toEqual([0.6, 0.4]);
    expect(frame.points[frame.points.length - 1]).toEqual({ t: KICKOFF + 20 * MIN, home: 0.6, away: 0.4 });
    expect(frame.over).toBe(false);
    expect(frame.winner).toBeNull();
  });

  it("ends on the final score and names the winner", () => {
    const frame = frameAt(replay, replaySpan(replay).end);
    expect(frame.score).toMatchObject({ state: "final", period: "Final", home: { score: 24 }, away: { score: 10 } });
    expect(frame).toMatchObject({ over: true, winner: "home" });
  });

  it("never calls a game over that was captured before it finished", () => {
    const partial = { ...replay, final: false };
    expect(frameAt(partial, replaySpan(partial).end + MIN)).toMatchObject({ over: false, winner: null });
    expect(replayResolutions(partial)).toBeNull();
  });
});

describe("a cushion bought during the replay", () => {
  it("fills at the last real trade plus the stated spread, and settles on the real result", () => {
    const { game } = frameAt(replay, KICKOFF + 25 * MIN);
    // Rooting for the Colts at 40%: Texans to win costs 0.61, Colts not to win costs 1 - 0.39 = 0.61. Either way $12.20 for $20.
    const quote = priceCushion(teamLossLegs(game, "IND", 20), replayBooks(game));
    expect(quote).toMatchObject({ cost: 12.2, maxPayout: 20, partial: false });
    expect(settleLegs(filledLegs(quote), replayResolutions(replay)!)).toBe(20);

    // Rooting for the Texans, who went on to win: the cushion costs money and pays nothing.
    const texans = priceCushion(teamLossLegs(game, "HOU", 20), replayBooks(game));
    expect(texans.cost).toBe(8.2);
    expect(settleLegs(filledLegs(texans), replayResolutions(replay)!)).toBe(0);
  });

  it("has nothing to buy before a contract has ever traded", () => {
    const { game } = frameAt(replay, KICKOFF - 40 * MIN);
    expect(priceCushion(teamLossLegs(game, "IND", 20), replayBooks(game)).maxPayout).toBe(0);
  });
});

describe("moments", () => {
  it("lists kickoff, each score with the score line, and the final", () => {
    expect(moments(replay).map((m) => m.label)).toEqual(["Kickoff", "1st 4:10 · IND 7, HOU 0", "Final"]);
    expect(moments(replay)[1].t).toBe(KICKOFF + 15 * MIN);
    expect(moments({ ...replay, final: false }).map((m) => m.label)).not.toContain("Final");
  });
});

describe("valueNow", () => {
  it("marks a cushion at what its side would sell for at this moment", () => {
    const early = frameAt(replay, KICKOFF + 25 * MIN).game;
    const late = frameAt(replay, KICKOFF + 55 * MIN).game;
    // 20 contracts of "Texans win", bought when they were at 60%.
    const legs = [{ symbol: "GEMI-NFL-TEST-M-HOU", side: "yes" as const, filled: 20 }];
    expect(valueNow(legs, early)).toBe(11.8);
    expect(valueNow(legs, late)).toBe(18.8);
    // "Texans do not win" sells for one minus the ask.
    expect(valueNow([{ ...legs[0], side: "no" }], late)).toBe(0.8);
  });
});

describe("cleaned", () => {
  const game = (home: [number, number][], away: [number, number][]): Replay => ({
    ...replay,
    home: { ...replay.home, trades: home.map(([t, price]) => ({ t, price, size: 1 })) },
    away: { ...replay.away, trades: away.map(([t, price]) => ({ t, price, size: 1 })) },
  });
  const prices = (r: Replay) => [r.home.trades.map((t) => t.price), r.away.trades.map((t) => t.price)];

  it("drops trades the other team's price says cannot be right", () => {
    // The home team is near 75% on both contracts, then three trades print at 16 cents on its own contract.
    const out = cleaned(game([[1, 0.77], [5, 0.16], [5, 0.16], [6, 0.16], [9, 0.88]], [[2, 0.25], [7, 0.2], [8, 0.11]]));
    expect(prices(out)).toEqual([[0.77, 0.88], [0.25, 0.2, 0.11]]);
  });

  it("keeps a real swing once the other team's price confirms it", () => {
    // A turnover: the home team goes from 80% to 40%, and the away contract follows.
    const out = cleaned(game([[1, 0.8], [5, 0.4], [9, 0.42]], [[2, 0.2], [6, 0.6], [8, 0.58]]));
    expect(prices(out)).toEqual([[0.8, 0.4, 0.42], [0.2, 0.6, 0.58]]);
  });

  it("leaves a normal game untouched", () => {
    const normal = game([[1, 0.85], [3, 0.83], [5, 0.9]], [[2, 0.16], [4, 0.15], [6, 0.1]]);
    expect(prices(cleaned(normal))).toEqual(prices(normal));
  });
});

describe("along", () => {
  // A reel that plays 10 seconds of game per second, holds the game still from 20 to 30, then moves on.
  const reel: [number, number][] = [
    [0, 1000],
    [20, 1200],
    [30, 1200],
    [40, 1500],
  ];

  it("reads the moment of the game from a second of the video, holding either end", () => {
    expect(along(reel, 10, 0)).toBe(1100);
    expect(along(reel, 25, 0)).toBe(1200);
    expect(along(reel, 35, 0)).toBe(1350);
    expect(along(reel, -5, 0)).toBe(1000);
    expect(along(reel, 99, 0)).toBe(1500);
  });

  it("reads the second of the video from a moment of the game, taking the first that shows it", () => {
    expect(along(reel, 1100, 1)).toBe(10);
    expect(along(reel, 1200, 1)).toBe(20);
    expect(along(reel, 1350, 1)).toBe(35);
    expect(along(reel, 5000, 1)).toBe(40);
  });
});
