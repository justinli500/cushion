import { describe, expect, it } from "vitest";
import type { Game } from "@/domains/markets/types";
import { applyLogos, parseLogos, teamKey } from "@/domains/scores/logos";

const espn = (teams: { displayName: string; logos?: { href: string }[] }[]) => ({ sports: [{ leagues: [{ teams: teams.map((team) => ({ team })) }] }] });

const game = (league: string, names: [string, string]): Game => ({
  kind: "game",
  gameId: "g",
  eventTicker: `${league}-TEST`,
  league,
  title: "Away vs Home",
  startTime: "2026-11-20T01:15:00.000Z",
  expiry: "2026-11-21T13:15:00.000Z",
  isLive: false,
  hasDraw: false,
  volume: 0,
  teams: names.map((name, i) => ({
    abbr: `T${i}`,
    name,
    side: i === 0 ? ("away" as const) : ("home" as const),
    contract: { symbol: `S${i}`, label: name, quote: { bid: null, ask: null, last: null }, open: true, image: "https://assets.gemini.com/helmet.avif" },
  })),
});

describe("official logos", () => {
  it("matches teams by name, ignoring case, punctuation and accents", () => {
    expect(teamKey("Louisiana Ragin' Cajuns")).toBe(teamKey("louisiana ragin cajuns"));
    expect(teamKey("Alavés")).toBe("alaves");
  });

  it("keeps only logos on ESPN's image host", () => {
    const logos = parseLogos(
      espn([
        { displayName: "Houston Texans", logos: [{ href: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png" }] },
        { displayName: "Sketchy Team", logos: [{ href: "https://evil.example/logo.png" }] },
        { displayName: "No Logo Team" },
      ]),
    );
    expect(logos).toEqual({ "houston texans": "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png" });
  });

  it("swaps in the official logo where the name matches and leaves the rest alone", () => {
    const logos = { NFL: { "houston texans": "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png" } };
    const [nfl, nba] = applyLogos([game("NFL", ["Indianapolis Colts", "Houston Texans"]), game("NBA", ["Houston Rockets", "Houston Texans"])], logos);
    expect(nfl.teams.map((t) => t.contract.image)).toEqual(["https://assets.gemini.com/helmet.avif", "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png"]);
    // A league with no logos loaded keeps every picture as it was, even for a matching name.
    expect(nba.teams.map((t) => t.contract.image)).toEqual(["https://assets.gemini.com/helmet.avif", "https://assets.gemini.com/helmet.avif"]);
  });
});
