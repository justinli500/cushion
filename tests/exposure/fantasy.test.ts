import { describe, expect, it } from "vitest";
import {
  bustWording,
  defaultBustLine,
  gameStatus,
  groupPlayers,
  metricLabel,
  parsePayout,
  searchPlayers,
  type PlayerEntry,
} from "@/domains/exposure/fantasy";
import type { Game, PlayerProp, PropLine } from "@/domains/markets/types";

const HOUR = 60 * 60 * 1000;

const line = (value: number, bid: number | null, ask: number | null, last: number | null = null, open = true): PropLine => ({
  line: value,
  contract: { symbol: `S${value}`, label: `${value}`, quote: { bid, ask, last }, open },
});

const game = (gameId: string, startTime: string, league = "NFL"): Game => ({
  kind: "game",
  gameId,
  eventTicker: `${league}-${gameId}`,
  league,
  title: `Game ${gameId}`,
  startTime,
  expiry: startTime,
  isLive: false,
  teams: [],
  hasDraw: false,
  volume: 0,
});

const prop = (gameId: string, player: string, metric: string, lines: PropLine[] = [], expiry = "2026-11-21T13:00:00.000Z"): PlayerProp => ({
  gameId,
  eventTicker: `EV-${gameId}-${metric}`,
  expiry,
  player,
  team: null,
  position: null,
  metric,
  lines,
});

describe("groupPlayers", () => {
  const sunday = game("g2", "2026-11-22T18:00:00.000Z");
  const tonight = game("g1", "2026-11-20T01:15:00.000Z");
  const entries = groupPlayers([
    { game: sunday, props: [prop("g2", "Zed Rusher", "rushing_yards")] },
    {
      game: tonight,
      props: [
        prop("g1", "Jonathan Taylor", "touchdowns", [line(0.5, 0.4, 0.5)]),
        prop("g1", "Jonathan Taylor", "rushing_yards", [line(59.5, 0.4, 0.45)], "2026-11-21T14:00:00.000Z"),
        prop("g1", "Jonathan Taylor", "receiving_yards", [line(19.5, 0.4, 0.45)]),
        prop("g1", "Amon-Ra St. Brown", "receiving_yards", [line(59.5, 0.4, 0.45)]),
      ],
    },
  ]);

  it("makes one entry per player per game, soonest game first and names in order within a game", () => {
    expect(entries.map((e) => [e.player, e.gameId])).toEqual([
      ["Amon-Ra St. Brown", "g1"],
      ["Jonathan Taylor", "g1"],
      ["Zed Rusher", "g2"],
    ]);
  });

  it("groups a player's stats in a fixed order with plain labels, whatever order Gemini listed them", () => {
    const taylor = entries.find((e) => e.player === "Jonathan Taylor")!;
    expect(taylor.stats.map((s) => [s.metric, s.label])).toEqual([
      ["rushing_yards", "Rushing yards"],
      ["receiving_yards", "Receiving yards"],
      ["touchdowns", "Touchdowns"],
    ]);
  });

  it("carries the game, every event ticker, and the latest expiry", () => {
    const taylor = entries.find((e) => e.player === "Jonathan Taylor")!;
    expect(taylor).toMatchObject({ league: "NFL", gameTitle: "Game g1", startTime: "2026-11-20T01:15:00.000Z", expiry: "2026-11-21T14:00:00.000Z" });
    expect(taylor.eventTickers).toEqual(["EV-g1-rushing_yards", "EV-g1-receiving_yards", "EV-g1-touchdowns"]);
    expect(taylor.stats[0].eventTicker).toBe("EV-g1-rushing_yards");
  });

  it("keeps a player who plays two games as two entries", () => {
    const both = groupPlayers([
      { game: tonight, props: [prop("g1", "Same Guy", "points")] },
      { game: sunday, props: [prop("g2", "Same Guy", "points")] },
    ]);
    expect(both.map((e) => e.gameId)).toEqual(["g1", "g2"]);
  });

  it("falls back to a readable label for a metric it has no name for", () => {
    expect(metricLabel("blocked_shots")).toBe("Blocked shots");
  });
});

describe("bustWording", () => {
  it("turns a 59.5 line into 'under 60'", () => {
    expect(bustWording("rushing_yards", 59.5)).toEqual({ chip: "Under 60", clause: "finishes under 60 rushing yards" });
    expect(bustWording("points", 19.5)).toEqual({ chip: "Under 20", clause: "finishes under 20 points" });
  });

  it("says 'does not score' for a 1+ touchdowns line", () => {
    expect(bustWording("touchdowns", 0.5)).toEqual({ chip: "Does not score", clause: "does not score" });
    expect(bustWording("passing_touchdowns", 0.5).clause).toBe("throws no touchdowns");
  });

  it("goes back to 'under N' for 2+ touchdowns", () => {
    expect(bustWording("touchdowns", 1.5)).toEqual({ chip: "Under 2", clause: "finishes under 2 touchdowns" });
  });

  it("says 'no' for any other stat at 1+", () => {
    expect(bustWording("assists", 0.5).clause).toBe("records no assists");
  });
});

describe("defaultBustLine", () => {
  // Chance of going under is 1 - the YES midpoint.
  const lines = [line(49.5, 0.8, 0.84), line(59.5, 0.6, 0.64), line(69.5, 0.3, 0.34), line(79.5, 0.1, 0.14)];

  it("picks the line whose chance of going under is closest to 35%", () => {
    expect(defaultBustLine(lines)?.line).toBe(59.5);
  });

  it("breaks a tie toward the lower line", () => {
    expect(defaultBustLine([line(49.5, 0.6, 0.64), line(59.5, 0.6, 0.64)])?.line).toBe(49.5);
  });

  it("skips lines with no quote at all, and lines that are closed", () => {
    const mixed = [line(59.5, null, null, null), line(69.5, 0.3, 0.34, null, false), line(79.5, 0.1, 0.14)];
    expect(defaultBustLine(mixed)?.line).toBe(79.5);
  });

  it("prefers a line someone is bidding on over one with only a last trade", () => {
    const lastOnly = line(59.5, null, null, 0.65);
    expect(defaultBustLine([lastOnly, line(79.5, 0.1, 0.14)])?.line).toBe(79.5);
  });

  it("falls back to a last-trade line when nothing has a bid", () => {
    expect(defaultBustLine([line(59.5, null, null, 0.65), line(79.5, null, null, 0.1)])?.line).toBe(59.5);
  });

  it("is null when no line is quoted", () => {
    expect(defaultBustLine([line(59.5, null, null)])).toBeNull();
    expect(defaultBustLine([])).toBeNull();
  });
});

describe("gameStatus", () => {
  const start = Date.parse("2026-11-20T01:15:00.000Z");
  const nfl = { league: "NFL", startTime: "2026-11-20T01:15:00.000Z" };

  it("is upcoming before kickoff, live after it, and over once a typical game has run its length", () => {
    expect(gameStatus(nfl, start - HOUR)).toBe("upcoming");
    expect(gameStatus(nfl, start + HOUR)).toBe("live");
    expect(gameStatus(nfl, start + 5 * HOUR)).toBe("over");
  });

  it("uses a shorter game for basketball", () => {
    const nba = { league: "NBA", startTime: nfl.startTime };
    expect(gameStatus(nba, start + 3.5 * HOUR)).toBe("over");
    expect(gameStatus(nfl, start + 3.5 * HOUR)).toBe("live");
  });
});

describe("searchPlayers", () => {
  const entry = (player: string, gameTitle: string, gameId = gameTitle): PlayerEntry => ({
    player,
    league: "NBA",
    gameId,
    gameTitle,
    startTime: "2026-11-20T01:00:00.000Z",
    expiry: "2026-11-21T13:00:00.000Z",
    eventTickers: [],
    stats: [],
  });
  const all = [entry("Nikola Jokić", "Denver vs Chicago"), entry("Jonathan Taylor", "Indianapolis vs Houston"), entry("Jonathan Taylor", "Indianapolis vs Houston 2", "g2"), entry("C.J. Stroud", "Indianapolis vs Houston")];

  it("matches names ignoring case and accents", () => {
    expect(searchPlayers(all, "jokic", [], 8).map((e) => e.player)).toEqual(["Nikola Jokić"]);
  });

  it("matches the game too, so a team name lists its players", () => {
    expect(searchPlayers(all, "houston", [], 8).map((e) => e.player)).toEqual(["Jonathan Taylor", "C.J. Stroud"]);
  });

  it("lists each name once, leaves out names already in the lineup, and honours the limit", () => {
    expect(searchPlayers(all, "indianapolis", ["C.J. Stroud"], 8).map((e) => e.player)).toEqual(["Jonathan Taylor"]);
    expect(searchPlayers(all, "indianapolis", [], 1)).toHaveLength(1);
  });

  it("offers the players with the most stats when nothing is typed", () => {
    const busy = { ...entry("Busy Back", "Denver vs Chicago", "g3"), stats: [{ metric: "points", label: "Points", eventTicker: "E", lines: [] }] };
    expect(searchPlayers([...all, busy], "  ", [], 2).map((e) => e.player)).toEqual(["Busy Back", "Nikola Jokić"]);
  });
});

describe("parsePayout", () => {
  it("accepts whole dollars and cents in range", () => {
    expect(parsePayout("15")).toBe(15);
    expect(parsePayout("12.5")).toBe(12.5);
    expect(parsePayout("1000")).toBe(1000);
  });

  it("rejects blanks, junk, too little, too much, and fractions of a cent", () => {
    for (const bad of ["", "abc", "0", "0.5", "1001", "-5", "1e3", "5.123"]) expect(parsePayout(bad)).toBeNull();
  });
});
