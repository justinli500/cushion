import { findAthlete, type AthleteIndex } from "@/domains/scores/athletes";
import { defaultBustLine, gameStatus, type PlayerEntry } from "./fantasy";

/** Adds each player's position, team and picture from ESPN's rosters, where ESPN lists the player. */
export function withAthletes(entries: PlayerEntry[], rosters: Partial<Record<string, AthleteIndex>>): PlayerEntry[] {
  return entries.map((entry) => {
    const index = rosters[entry.league];
    const athlete = index ? findAthlete(index, entry.player, entry.gameTitle) : null;
    return athlete ? { ...entry, position: athlete.position, team: athlete.team, headshot: athlete.headshot } : entry;
  });
}

const has = (entry: PlayerEntry, metric: string) => entry.stats.some((s) => s.metric === metric);

/**
 * A player's position: ESPN's when it lists them, else read off the markets Gemini lists. A passer
 * is a quarterback and a runner a running back. A receiver is called a wide receiver, which is
 * wrong for a tight end, so this is only the fallback.
 */
export function positionOf(entry: PlayerEntry): string | null {
  if (entry.position) return entry.position;
  if (entry.league !== "NFL") return null;
  if (has(entry, "passing_yards")) return "QB";
  if (has(entry, "rushing_yards")) return "RB";
  return has(entry, "receiving_yards") ? "WR" : null;
}

/** The slots of the example lineup, in the order a fantasy roster lists them. Gemini lists no kicker or defense markets. */
const SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"] as const;
const FLEX = ["RB", "WR", "TE"];
/** The stat that says how much the market expects of a player at each position. */
const MAIN: Record<string, string> = { QB: "passing_yards", RB: "rushing_yards", WR: "receiving_yards", TE: "receiving_yards" };

/** The stat a cushion for this player starts on: the one his position is drafted for, when he has it. */
export function mainMetric(entry: PlayerEntry): string | undefined {
  const position = positionOf(entry);
  return position ? MAIN[position] : undefined;
}

/** The line the market thinks a player misses about one time in three: a stand-in for how much is expected of him. */
function expected(entry: PlayerEntry, metric: string): number | null {
  const stat = entry.stats.find((s) => s.metric === metric);
  return stat ? (defaultBustLine(stat.lines)?.line ?? null) : null;
}

export interface LineupSpot {
  name: string;
  /** "QB", "FLEX", or a basketball position. */
  slot: string;
}

/**
 * A lineup to show before the person has entered theirs: for each slot, the player the market
 * expects the most of among games still to start. Football when there are football markets, else
 * the five basketball players with the highest points lines.
 */
export function exampleLineup(entries: PlayerEntry[], now: number): LineupSpot[] {
  const upcoming = entries.filter((e) => gameStatus(e, now) === "upcoming");
  const once = [...new Map(upcoming.map((e) => [e.player, e])).values()];

  const ranked = once
    .flatMap((entry) => {
      const position = positionOf(entry);
      const score = position && MAIN[position] ? expected(entry, MAIN[position]) : null;
      return position && score != null ? [{ entry, position, score }] : [];
    })
    .sort((a, b) => b.score - a.score);
  const taken = new Set<string>();
  const football = SLOTS.flatMap((slot): LineupSpot[] => {
    const pick = ranked.find((r) => !taken.has(r.entry.player) && (slot === "FLEX" ? FLEX.includes(r.position) : r.position === slot));
    if (!pick) return [];
    taken.add(pick.entry.player);
    return [{ name: pick.entry.player, slot }];
  });
  if (football.length >= 3) return football;

  return once
    .flatMap((entry) => {
      const score = entry.league === "NBA" ? expected(entry, "points") : null;
      return score != null ? [{ entry, score }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ entry }) => ({ name: entry.player, slot: positionOf(entry) ?? "" }));
}
