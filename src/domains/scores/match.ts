import type { Game, TeamSide } from "@/domains/markets/types";
import type { Score, TeamScore } from "./types";

const NAME_WINDOW_MS = 3 * 60 * 60 * 1000;

const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Either name may be a shortened form of the other: "Little Rock Trojans" and "Arkansas Little Rock Trojans". */
function sameTeam(a: string, b: string): boolean {
  const x = squash(a);
  const y = squash(b);
  return x !== "" && y !== "" && (x === y || x.includes(y) || y.includes(x));
}

const sameSide = (team: TeamSide, espn: TeamScore) => team.abbr === espn.abbr || sameTeam(team.name, espn.name);

/**
 * Finds ESPN's record of a Gemini game. Matching both abbreviations is enough. The two sites spell
 * some differently (LAK and LA, TBL and TB) and name a few teams differently (Los Angeles Clippers
 * and LA Clippers), so failing that each team must match by abbreviation or by name, and the games
 * must start within three hours of each other.
 */
export function matchScore(game: Game, scores: Score[]): Score | null {
  const start = Date.parse(game.startTime);
  const apart = (s: Score) => Math.abs(Date.parse(s.startTime) - start);
  const abbrs = new Set(game.teams.map((t) => t.abbr));
  const [a, b] = game.teams;

  const byAbbr = scores.filter((s) => abbrs.has(s.home.abbr) && abbrs.has(s.away.abbr));
  const byTeam = scores.filter(
    (s) => apart(s) <= NAME_WINDOW_MS && ((sameSide(a, s.home) && sameSide(b, s.away)) || (sameSide(a, s.away) && sameSide(b, s.home))),
  );
  const pool = byAbbr.length > 0 ? byAbbr : byTeam;
  return pool.reduce<Score | null>((best, s) => (best == null || apart(s) < apart(best) ? s : best), null);
}
