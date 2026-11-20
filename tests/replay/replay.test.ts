import { describe, expect, it } from "vitest";
import { teamLossLegs } from "@/domains/cushion/legs";
import { priceCushion, settleLegs, filledLegs } from "@/domains/cushion/price";
import { frameAt, replayBooks, replayResolutions, replaySchema, replaySpan, type Replay } from "@/domains/replay/replay";

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
