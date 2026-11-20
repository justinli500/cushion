import { describe, expect, it } from "vitest";
import { frameAt, replaySchema, replaySpan, valueNow, type Replay } from "@/domains/replay/replay";
import {
  addSample,
  changeAcross,
  joinWorth,
  periodTicks,
  replayWorth,
  scoreEvents,
  tradedWorth,
  worthAtTime,
  worthFromQuotes,
  worthUpTo,
  type HeldLeg,
} from "@/domains/replay/worth";
import { layoutWorth } from "@/domains/replay/worth-chart";

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
    symbol: "HOU-WIN",
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
    symbol: "IND-WIN",
    trades: [
      { t: KICKOFF + 5 * MIN, price: 0.15, size: 5 },
      { t: KICKOFF + 20 * MIN, price: 0.4, size: 5 },
      { t: KICKOFF + 50 * MIN, price: 0.05, size: 5 },
    ],
  },
  plays: [
    { t: KICKOFF, period: 1, clock: "15:00", text: "Kickoff.", home: 0, away: 0, scoring: false, homeWinProb: 0.7 },
    { t: KICKOFF + 15 * MIN, period: 1, clock: "4:10", text: "Colts touchdown.", home: 0, away: 7, scoring: true, homeWinProb: 0.5 },
    { t: KICKOFF + 40 * MIN, period: 2, clock: "9:00", text: "Texans touchdown.", home: 7, away: 7, scoring: true, homeWinProb: 0.6 },
    { t: KICKOFF + 60 * MIN, period: 4, clock: "0:02", text: "Texans kneel.", home: 24, away: 10, scoring: false, homeWinProb: 0.99 },
  ],
});

// 20 contracts of "Colts win", bought before the game.
const colts: HeldLeg[] = [{ symbol: "IND-WIN", side: "yes", filled: 20 }];

describe("worthFromQuotes", () => {
  it("agrees with valueNow at every moment of the game", () => {
    const legs: HeldLeg[] = [...colts, { symbol: "HOU-WIN", side: "no", filled: 5 }];
    for (const minutes of [-2, 6, 25, 55]) {
      const { game } = frameAt(replay, KICKOFF + minutes * MIN);
      const quotes = new Map(game.teams.map((t) => [t.contract.symbol, t.contract.quote]));
      expect(worthFromQuotes(legs, (s) => quotes.get(s))).toBe(valueNow(legs, game));
    }
  });

  it("values a side nobody prices at nothing", () => {
    expect(worthFromQuotes(colts, () => ({ bid: null, ask: 0.3, last: 0.3 }))).toBe(0);
    expect(worthFromQuotes([{ symbol: "X", side: "no", filled: 10 }], () => ({ bid: 0.2, ask: null, last: 0.2 }))).toBe(0);
  });
});

describe("replayWorth", () => {
  const series = replayWorth(replay, colts);

  it("starts at the open of the replay and moves only when the legs' contract traded", () => {
    expect(series[0].t).toBe(replaySpan(replay).start);
    // Before the Colts contract has traded, the leg is worth nothing.
    expect(series[0].worth).toBe(0);
    expect(series.slice(1).map((p) => p.t)).toEqual([KICKOFF + 5 * MIN, KICKOFF + 20 * MIN, KICKOFF + 50 * MIN]);
    expect(series.map((p) => p.worth)).toEqual([0, 2.8, 7.8, 0.8]);
  });

  it("reads each point from the game as it stood then, so a later trade never leaks backwards", () => {
    const early = replayWorth({ ...replay, away: { ...replay.away, trades: replay.away.trades.slice(0, 2) } }, colts);
    expect(early.map((p) => p.worth)).toEqual(series.slice(0, 3).map((p) => p.worth));
  });
});

describe("worthUpTo", () => {
  const series = replayWorth(replay, colts);

  it("shows nothing after the video's position and ends on the worth right now", () => {
    const at = KICKOFF + 30 * MIN;
    const shown = worthUpTo(series, at, 7.8);
    expect(shown.every((p) => p.t <= at)).toBe(true);
    expect(shown[shown.length - 1]).toEqual({ t: at, worth: 7.8 });
    expect(shown).toHaveLength(4);
  });

  it("looks up the worth at a moment", () => {
    expect(worthAtTime(series, KICKOFF + 10 * MIN)).toBe(2.8);
    expect(worthAtTime(series, KICKOFF - 60 * MIN)).toBeNull();
  });
});

describe("scoreEvents", () => {
  const series = replayWorth(replay, colts);

  it("lists the scoring plays so far with the change in worth across each", () => {
    const events = scoreEvents(replay, series, KICKOFF + 30 * MIN);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ when: "1st · 4:10", text: "Colts touchdown.", score: "IND 7, HOU 0" });
    // The Colts contract was at 2.80 when the play happened and traded at 7.80 five minutes in, outside the 3 minute window.
    expect(events[0].change).toBe(0);
  });

  it("reads a move that lands inside the window, and never past the video's position", () => {
    const quick: WorthLike = [
      { t: 0, worth: 5 },
      { t: 100, worth: 9 },
    ];
    expect(changeAcross(quick, 50, 200)).toBe(4);
    // The same move has not happened yet at 80, so the play shows no change.
    expect(changeAcross(quick, 50, 80)).toBe(0);
    expect(changeAcross([{ t: 60, worth: 1 }], 50, 200)).toBeNull();
  });

  it("names the periods that have started", () => {
    expect(periodTicks(replay, KICKOFF + 30 * MIN).map((t) => t.text)).toEqual(["1st"]);
    expect(periodTicks(replay, KICKOFF + 59 * MIN).map((t) => t.text)).toEqual(["1st", "2nd"]);
  });
});

type WorthLike = { t: number; worth: number }[];

describe("tradedWorth", () => {
  const candles = {
    "A-YES": [
      { time: 100, close: 0.4, volume: 1 },
      { time: 300, close: 0.7, volume: 1 },
      { time: 900, close: 0.9, volume: 1 },
    ],
  };

  it("marks each leg at its last traded price: Yes at the price, No at one minus it", () => {
    expect(tradedWorth([{ symbol: "A-YES", side: "yes", filled: 10 }], candles, 200, 500)).toEqual([
      { t: 200, worth: 4 },
      { t: 300, worth: 7 },
    ]);
    expect(tradedWorth([{ symbol: "A-YES", side: "no", filled: 10 }], candles, 200, 500).map((p) => p.worth)).toEqual([6, 3]);
  });

  it("is empty when the contract had not traded yet, so the screen can say so", () => {
    expect(tradedWorth([{ symbol: "A-YES", side: "yes", filled: 10 }], candles, 0, 50)).toEqual([]);
    expect(tradedWorth([{ symbol: "B-YES", side: "yes", filled: 10 }], candles, 0, 1000)).toEqual([]);
  });
});

describe("live samples", () => {
  it("lets polled samples take over from candle history and skips samples that change nothing", () => {
    const history = [{ t: 1, worth: 1 }, { t: 5, worth: 2 }, { t: 9, worth: 3 }];
    let samples: WorthLike = [];
    samples = addSample(samples, { t: 7, worth: 2.5 });
    samples = addSample(samples, { t: 8, worth: 2.5 });
    samples = addSample(samples, { t: 10, worth: 4 });
    expect(samples).toEqual([{ t: 7, worth: 2.5 }, { t: 10, worth: 4 }]);
    expect(joinWorth(history, samples).map((p) => p.t)).toEqual([1, 5, 7, 10]);
    expect(joinWorth(history, [])).toBe(history);
  });
});

describe("layoutWorth", () => {
  const points = [{ t: 0, worth: 0 }, { t: 50, worth: 10 }, { t: 100, worth: 5 }];

  it("draws a step line from the left edge to the right edge, on a $0 floor", () => {
    const layout = layoutWorth({ points, paid: 4, dotTimes: [50, 500], ticks: [{ t: 0, text: "1st" }, { t: 200, text: "3rd" }] })!;
    // The peak of $10 is given 10% headroom, so it sits just under the top margin.
    expect(layout.path).toBe("M0 150 H400 V24.5 H800 V87.3");
    expect(layout.end.x).toBe(800);
    // The 500 dot and the 200 tick are in the future of this chart, so they are left out.
    expect(layout.dots).toHaveLength(1);
    expect(layout.ticks.map((t) => t.text)).toEqual(["1st"]);
    // $4 paid sits between the floor and the $10 peak.
    expect(layout.paidY).toBeGreaterThan(layout.dots[0].y);
    expect(layout.paidY).toBeLessThan(150);
  });

  it("has no paid line for a cushion that was never bought, and nothing to draw before there is a stretch of time", () => {
    expect(layoutWorth({ points, paid: null, dotTimes: [], ticks: [] })!.paidY).toBeNull();
    expect(layoutWorth({ points: [{ t: 5, worth: 1 }], paid: null, dotTimes: [], ticks: [] })).toBeNull();
    expect(layoutWorth({ points: [{ t: 5, worth: 1 }, { t: 5, worth: 2 }], paid: null, dotTimes: [], ticks: [] })).toBeNull();
  });
});
