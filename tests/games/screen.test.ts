import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Position } from "@/domains/account/ledger";
import { teamLossLegs } from "@/domains/cushion/legs";
import { filledLegs, priceCushion } from "@/domains/cushion/price";
import { cleaned, frameAt, replayBooks, replaySchema, replaySpan } from "@/domains/replay/replay";

// The screen reads the ledger from the browser's storage, which a server render does not have.
const ledger: { positions: Position[] } = { positions: [] };
vi.mock("@/domains/account/store", () => ({
  useAccount: () => ({ balance: 1000, positions: ledger.positions }),
  record: vi.fn(),
}));

const { GameScreen } = await import("@/app/(app)/games/_components/game-screen");
type View = Parameters<typeof GameScreen>[0]["feed"];

const replay = cleaned(replaySchema.parse(JSON.parse(readFileSync("public/replays/nfl-ind-hou-2026-11-19.json", "utf8"))));
const { start } = replaySpan(replay);

/** The view `useReplayGame` would give at `minutes` into the saved game. */
function replayView(minutes: number): View {
  const at = start + minutes * 60_000;
  const frame = frameAt(replay, at);
  return {
    load: "ready",
    error: null,
    stale: false,
    game: frame.game,
    score: frame.score,
    scoreStatus: "matched",
    plays: frame.plays,
    playsUnavailable: false,
    points: frame.points,
    at,
    recording: replay,
    props: [],
    replay: {
      id: replay.id,
      playedAt: frame.game.startTime,
      playing: true,
      speed: 60,
      progress: 0.5,
      over: frame.over,
      complete: true,
      books: replayBooks(frame.game),
      setPlaying: () => {},
      setSpeed: () => {},
      seek: () => {},
      video: { youtubeId: "abc123abc12", by: "Someone", startSeconds: 0, jump: null, onTime: () => {}, onUnavailable: () => {} },
      moments: [{ label: "Kickoff", progress: 0 }],
    },
  };
}

function bought(view: View, abbr: string, payout: number): Position {
  const quote = priceCushion(teamLossLegs(view.game!, abbr, payout), replayBooks(view.game!));
  return {
    type: "CushionBought",
    id: "p1",
    at: new Date().toISOString(),
    section: "games",
    title: "Colts loss cushion",
    detail: `Pays $${payout} if the Colts lose to the Texans.`,
    legs: filledLegs(quote),
    cost: quote.cost,
    maxPayout: quote.maxPayout,
    eventTickers: [],
    expiry: view.game!.expiry,
    replay: replay.id,
    payout: null,
    settledAt: null,
    receipt: null,
  };
}

// React marks the seams between adjacent text pieces with comments; the test reads the text.
const render = (view: View) => renderToString(createElement(GameScreen, { feed: view })).replaceAll("<!-- -->", "");

describe("the game screen on the saved game", () => {
  it("offers a cushion, an example chart and the game's two markets before anything is bought", () => {
    ledger.positions = [];
    const html = render(replayView(95));
    expect(html).toContain("Cushion this game");
    expect(html).toContain("Not bought yet");
    expect(html).toContain("Simulated live");
    expect(html).toContain("Trade this game");
    expect(html).toContain("Indianapolis Colts to win?");
    expect(html).toContain("Houston Texans to win?");
    expect(html).toContain("Buy this cushion");
  });

  it("turns the panel into the person's cushion once one is bought, with the paid line and the cash out button", () => {
    ledger.positions = [bought(replayView(30), "IND", 40)];
    const html = render(replayView(95));
    expect(html).toContain("Your cushion");
    expect(html).toContain("Cushioned for $40");
    expect(html).toContain("Cash out");
    expect(html).toContain("Add cushion");
    expect(html).toContain("You paid");
    expect(html).toContain("Worth right now");
    expect(html).not.toContain("Not bought yet");
  });

  it("shows the scoring plays seen so far with the change in worth, and none from later in the game", () => {
    ledger.positions = [bought(replayView(30), "IND", 40)];
    const early = render(replayView(5));
    const late = render(replayView(150));
    expect(early).not.toContain("S.Shrader");
    expect(late).toContain("TOUCHDOWN");
    expect(late).toMatch(/Cushion (\+|−)\$|Cushion unchanged/);
  });

  it("draws the scoreboard in the tile's place when the game has no video", () => {
    ledger.positions = [];
    const view = replayView(95);
    const html = render({ ...view, replay: { ...view.replay!, video: null } });
    expect(html).toContain("Houston Texans");
    expect(html).not.toContain("youtube");
  });
});

describe("the game screen on a live game", () => {
  const contract = (symbol: string, label: string, bid: number, ask: number) => ({ symbol, label, quote: { bid, ask, last: bid }, open: true, image: null });
  const live: View = {
    load: "ready",
    error: null,
    stale: false,
    game: {
      kind: "game",
      gameId: "g1",
      eventTicker: "NFL-TEST-M",
      league: "NFL",
      title: "Tennessee vs Dallas",
      startTime: "2026-11-22T18:00:00.000Z",
      expiry: "2026-11-23T06:00:00.000Z",
      isLive: false,
      hasDraw: false,
      volume: 0,
      teams: [
        { abbr: "DAL", name: "Dallas Cowboys", side: "home", contract: contract("DAL-WIN", "Dallas", 0.76, 0.77) },
        { abbr: "TEN", name: "Tennessee Titans", side: "away", contract: contract("TEN-WIN", "Tennessee", 0.22, 0.23) },
      ],
    },
    score: null,
    scoreStatus: "none",
    plays: [],
    playsUnavailable: false,
    points: [],
    replay: null,
    at: Date.UTC(2026, 10, 21, 12),
    recording: null,
    props: [
      {
        gameId: "g1",
        eventTicker: "NFL-TEST-PPYDS",
        expiry: "2026-11-23T06:00:00.000Z",
        player: "Dak Prescott",
        team: "DAL",
        position: "QB",
        metric: "passing_yards",
        lines: [
          { line: 249.5, contract: contract("DP-250", "250+", 0.69, 0.72) },
          { line: 274.5, contract: contract("DP-275", "275+", 0.52, 0.57) },
        ],
      },
    ],
  };

  it("lists the win markets and the closest player call, and offers a player's quiet game to cover", () => {
    ledger.positions = [];
    const html = render(live);
    expect(html).toContain("Tennessee Titans to win?");
    expect(html).toContain("Dallas Cowboys to win?");
    expect(html).toContain("Dak Prescott: 275+ passing yards?");
    expect(html).toContain("Dak Prescott finishes under 250 passing yards");
    // No video: the scoreboard sits in the tile's place and nothing is invented for the missing score.
    expect(html).toContain("chance to win");
    expect(html).not.toContain("youtube");
  });

  it("finds the person's cushion on a player market of this game", () => {
    ledger.positions = [
      {
        ...bought(replayView(30), "IND", 15),
        title: "Dak Prescott cushion",
        detail: "Pays $15 if Dak Prescott finishes under 250 passing yards.",
        legs: [{ symbol: "DP-250", side: "no", quantity: 15, label: "250+", filled: 15, cost: 4.2 }],
        eventTickers: ["NFL-TEST-PPYDS"],
        replay: undefined,
      },
    ];
    const html = render(live);
    expect(html).toContain("Your cushion");
    expect(html).toContain("If Dak Prescott finishes under 250 passing yards, you get");
    expect(html).toContain("Cash out $4.20");
  });
});
