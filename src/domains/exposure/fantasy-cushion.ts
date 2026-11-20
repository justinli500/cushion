import { playerUnderLegs } from "@/domains/cushion/legs";
import { chanceOf } from "@/domains/cushion/probability";
import type { Cushion } from "@/domains/cushion/types";
import type { PropLine } from "@/domains/markets/types";
import { formatUsd } from "@/lib/format";
import { defaultBustLine, gameStatus, type GameStatus, type PlayerEntry, type StatLines } from "./fantasy";

/** Dollars the way the screen says them: "$30" and "$12.50". */
export const shortUsd = (dollars: number) => formatUsd(dollars).replace(/\.00$/, "");

/** One card on the Fantasy screen: a lineup player in one game, or a lineup name Gemini lists nothing for. */
export interface Slot {
  key: string;
  name: string;
  entry: PlayerEntry | null;
  /** Null when there is no entry. */
  status: GameStatus | null;
}

/** A card for every game each lineup player has props in, in lineup order. */
export function lineupSlots(entries: PlayerEntry[], names: string[], now: number): Slot[] {
  return names.flatMap((name): Slot[] => {
    const games = entries.filter((e) => e.player === name);
    if (games.length === 0) return [{ key: name, name, entry: null, status: null }];
    return games.map((entry) => ({ key: `${entry.gameId}|${name}`, name, entry, status: gameStatus(entry, now) }));
  });
}

/** The stat and "N+" line a card covers: NO on this line pays when the player finishes under it. */
export interface Selection {
  stat: StatLines;
  line: PropLine;
}

/** What the person changed on a card. Anything left out falls back to the default. */
export interface Choice {
  metric?: string;
  line?: number;
}

/** Lines that are open and have a price to quote. */
export const pickableLines = (stat: StatLines) => stat.lines.filter((l) => l.contract.open && chanceOf(l.contract.quote, "no").p != null);

/**
 * What a card covers. The person's stat and line when they still exist, else the first stat (in the
 * usual order) with an open line, at the line the market thinks is about a one-in-three miss.
 */
export function resolvePick(entry: PlayerEntry, choice: Choice = {}): Selection | null {
  const chosen = entry.stats.find((s) => s.metric === choice.metric);
  for (const stat of chosen ? [chosen, ...entry.stats] : entry.stats) {
    const line = pickableLines(stat).find((l) => l.line === choice.line && stat === chosen) ?? defaultBustLine(stat.lines);
    if (line) return { stat, line };
  }
  return null;
}

/**
 * Each player's share of the stake, in dollars. Covering a player pays his share, so covering the
 * whole lineup pays the stake. Rounded down to the cent so the shares never add to more than the stake.
 */
export function stakeShare(stake: number, players: number): number {
  return Math.floor((stake / Math.max(1, players)) * 100) / 100;
}

export interface Covered {
  entry: PlayerEntry;
  pick: Selection;
}

export interface LineupPurchase {
  /** One cushion for every covered player, or null when there is nobody to cover. */
  cushion: Cushion | null;
  eventTickers: string[];
  /** When the last of the covered games settles. */
  expiry: string;
}

/** The covered players as one cushion: each leg pays `share` if its player finishes under his line. */
export function lineupPurchase(covered: Covered[], share: number): LineupPurchase {
  const legs = covered.flatMap(({ pick }) => playerUnderLegs(pick.line, share).legs);
  const latest = covered.reduce((a, c) => (Date.parse(c.entry.expiry) > Date.parse(a) ? c.entry.expiry : a), covered[0]?.entry.expiry ?? "");
  return {
    cushion: covered.length > 0 ? { legs, payoutMode: "sum" } : null,
    eventTickers: [...new Set(covered.map((c) => c.pick.stat.eventTicker))],
    expiry: latest,
  };
}

/** The first and last kickoff among these games, or null with none. */
export function gamesSpan(entries: Pick<PlayerEntry, "startTime">[]): { first: string; last: string } | null {
  if (entries.length === 0) return null;
  const times = entries.map((e) => Date.parse(e.startTime));
  const at = (time: number) => entries[times.indexOf(time)].startTime;
  return { first: at(Math.min(...times)), last: at(Math.max(...times)) };
}

/** Two letters for a badge: the first letter of the first and last word of the name. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}
