import { describe, expect, it } from "vitest";
import { matchScore } from "@/domains/scores/match";
import { parseScoreboard } from "@/domains/scores/parse";
import { fixture, game, score, team } from "./helpers";

describe("matching a Gemini game to an ESPN score", () => {
  it("matches on both team abbreviations", () => {
    const scores = [score({ espnId: "other", home: { abbr: "BUF", name: "Buffalo Bills", score: 0 }, away: { abbr: "MIA", name: "Miami Dolphins", score: 0 } }), score()];
    expect(matchScore(game(), scores)?.espnId).toBe("1");
  });

  it("matches whichever side Gemini calls home", () => {
    const flipped = game({ teams: [team("HOU", "Houston Texans", "away"), team("IND", "Indianapolis Colts", "home")] });
    expect(matchScore(flipped, [score()])?.espnId).toBe("1");
  });

  it("falls back to team names inside three hours when abbreviations differ", () => {
    const kings = game({
      league: "NHL",
      startTime: "2026-11-20T00:00:00.000Z",
      teams: [team("TOR", "Toronto Maple Leafs", "home"), team("LAK", "Los Angeles Kings", "away")],
    });
    const espn = parseScoreboard(fixture("espn-scoreboard-nhl.json"));
    const match = matchScore(kings, espn);
    expect(match).toMatchObject({ espnId: "401892742", away: { abbr: "LA" } });
  });

  it("does not match by name when the start times are more than three hours apart", () => {
    const later = game({
      league: "NHL",
      startTime: "2026-11-20T04:30:00.000Z",
      teams: [team("TOR", "Toronto Maple Leafs", "home"), team("LAK", "Los Angeles Kings", "away")],
    });
    expect(matchScore(later, parseScoreboard(fixture("espn-scoreboard-nhl.json")))).toBeNull();
  });

  it("matches a team by abbreviation and its opponent by name", () => {
    const clippers = game({
      league: "NBA",
      teams: [team("SAS", "San Antonio Spurs", "home"), team("LAC", "Los Angeles Clippers", "away")],
    });
    const espn = score({ espnId: "sa", home: { abbr: "SA", name: "San Antonio Spurs", score: 57 }, away: { abbr: "LAC", name: "LA Clippers", score: 54 } });
    expect(matchScore(clippers, [espn])?.espnId).toBe("sa");
  });

  it("tolerates a shorter school name on one side", () => {
    const rock = game({
      league: "NCAAM",
      teams: [team("JAC", "Jacksonville Dolphins", "home"), team("UALR", "Arkansas Little Rock Trojans", "away")],
    });
    const espn = score({ espnId: "lr", home: { abbr: "JAX", name: "Jacksonville Dolphins", score: 1 }, away: { abbr: "LR", name: "Little Rock Trojans", score: 2 } });
    expect(matchScore(rock, [espn])?.espnId).toBe("lr");
  });

  it("returns null when nothing matches", () => {
    expect(matchScore(game(), [])).toBeNull();
    expect(matchScore(game(), [score({ home: { abbr: "BUF", name: "Buffalo Bills", score: 0 }, away: { abbr: "MIA", name: "Miami Dolphins", score: 0 } })])).toBeNull();
  });

  it("does not match a game that shares only one team", () => {
    const sameHome = score({ away: { abbr: "TEN", name: "Tennessee Titans", score: 0 } });
    expect(matchScore(game(), [sameHome])).toBeNull();
  });

  it("picks the closest start when the same two teams appear twice", () => {
    const early = score({ espnId: "early", startTime: "2026-11-13T01:15Z" });
    const near = score({ espnId: "near" });
    expect(matchScore(game(), [early, near])?.espnId).toBe("near");
  });
});
