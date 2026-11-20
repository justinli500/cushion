import { describe, expect, it } from "vitest";
import type { PlayerEntry, StatLines } from "@/domains/exposure/fantasy";
import { exampleLineup, mainMetric, positionOf, withAthletes } from "@/domains/exposure/fantasy-roster";
import { indexAthletes } from "@/domains/scores/athletes";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const SUNDAY = "2026-11-22T18:00:00.000Z";

/** A stat whose only quoted line is `line`, so that line is the one the market expects him to clear. */
const stat = (metric: string, line: number): StatLines => ({
  metric,
  label: metric,
  eventTicker: `E-${metric}`,
  lines: [{ line, contract: { symbol: `S-${metric}-${line}`, label: "", quote: { bid: 0.64, ask: 0.66, last: null }, open: true } }],
});

const entry = (player: string, position: string | null, stats: StatLines[], over: Partial<PlayerEntry> = {}): PlayerEntry => ({
  player,
  league: "NFL",
  gameId: "g",
  gameTitle: "Tennessee vs Dallas",
  startTime: SUNDAY,
  expiry: SUNDAY,
  eventTickers: [],
  stats,
  position,
  ...over,
});

describe("the fantasy roster", () => {
  it("takes a position from ESPN, and reads one off the markets when ESPN has none", () => {
    expect(positionOf(entry("A", "TE", [stat("receiving_yards", 40)]))).toBe("TE");
    expect(positionOf(entry("B", null, [stat("rushing_yards", 30), stat("passing_yards", 220)]))).toBe("QB");
    expect(positionOf(entry("C", null, [stat("rushing_yards", 60), stat("receiving_yards", 20)]))).toBe("RB");
    expect(positionOf(entry("D", null, [stat("receiving_yards", 50)]))).toBe("WR");
    expect(positionOf(entry("E", null, [stat("points", 20)], { league: "NBA" }))).toBeNull();
    expect(mainMetric(entry("B", "QB", []))).toBe("passing_yards");
  });

  it("adds position, team and picture from the roster", () => {
    const rosters = { NFL: indexAthletes([{ name: "CeeDee Lamb", position: "WR", headshot: "https://a.espncdn.com/x.png", team: "DAL", place: "Dallas" }]) };
    const [found, missing] = withAthletes([entry("CeeDee Lamb", null, []), entry("Someone Else", null, [])], rosters);
    expect(found).toMatchObject({ position: "WR", team: "DAL", headshot: "https://a.espncdn.com/x.png" });
    expect(missing.position).toBeNull();
  });

  it("fills each slot with the player the market expects the most of, each player once", () => {
    const entries = [
      entry("Backup QB", "QB", [stat("passing_yards", 180)]),
      entry("Star QB", "QB", [stat("passing_yards", 270)]),
      entry("RB One", "RB", [stat("rushing_yards", 90)]),
      entry("RB Two", "RB", [stat("rushing_yards", 70)]),
      entry("RB Three", "RB", [stat("rushing_yards", 65)]),
      entry("WR One", "WR", [stat("receiving_yards", 85)]),
      entry("TE One", "TE", [stat("receiving_yards", 45)]),
      entry("Started Already", "WR", [stat("receiving_yards", 120)], { startTime: "2026-11-20T01:00:00.000Z" }),
      entry("Touchdowns Only", "WR", [stat("touchdowns", 0.5)]),
    ];
    expect(exampleLineup(entries, NOW)).toEqual([
      { name: "Star QB", slot: "QB" },
      { name: "RB One", slot: "RB" },
      { name: "RB Two", slot: "RB" },
      { name: "WR One", slot: "WR" },
      { name: "TE One", slot: "TE" },
      // No second receiver is listed, so that slot is skipped and the third back takes the flex.
      { name: "RB Three", slot: "FLEX" },
    ]);
  });

  it("falls back to the top basketball scorers when there is no football", () => {
    const nba = (player: string, points: number) => entry(player, "G", [stat("points", points)], { league: "NBA" });
    expect(exampleLineup([nba("Low", 12), nba("High", 28)], NOW)).toEqual([
      { name: "High", slot: "G" },
      { name: "Low", slot: "G" },
    ]);
  });
});
