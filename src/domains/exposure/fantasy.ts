import { chanceOf } from "@/domains/cushion/probability";
import type { Game, PlayerProp, PropLine } from "@/domains/markets/types";

/** One stat a player has props for: a ladder of "N+" lines from a single Gemini event. */
export interface StatLines {
  metric: string;
  /** Plain name of the metric, e.g. "Rushing yards". */
  label: string;
  eventTicker: string;
  /** Ascending by line. */
  lines: PropLine[];
}

/** A player in one game, with every stat Gemini lists for them. */
export interface PlayerEntry {
  player: string;
  league: string;
  gameId: string;
  gameTitle: string;
  startTime: string;
  expiry: string;
  eventTickers: string[];
  stats: StatLines[];
}

interface Metric {
  label: string;
  /** Plural noun for sentences: "under 60 rushing yards". */
  unit: string;
  /** What finishing under "1+" means, when there is a better way to say it than "no <unit>". */
  zero?: string;
}

// Object order is the order a player's stats are shown in.
const METRICS: Record<string, Metric> = {
  rushing_yards: { label: "Rushing yards", unit: "rushing yards" },
  receiving_yards: { label: "Receiving yards", unit: "receiving yards" },
  passing_yards: { label: "Passing yards", unit: "passing yards" },
  touchdowns: { label: "Touchdowns", unit: "touchdowns", zero: "does not score" },
  passing_touchdowns: { label: "Passing touchdowns", unit: "passing touchdowns", zero: "throws no touchdowns" },
  points: { label: "Points", unit: "points" },
  rebounds: { label: "Rebounds", unit: "rebounds" },
  assists: { label: "Assists", unit: "assists" },
};
const METRIC_ORDER = Object.keys(METRICS);

function metricInfo(metric: string): Metric {
  const words = metric.replaceAll("_", " ");
  return METRICS[metric] ?? { label: words.charAt(0).toUpperCase() + words.slice(1), unit: words };
}

export const metricLabel = (metric: string) => metricInfo(metric).label;

const byStart = (a: PlayerEntry, b: PlayerEntry) =>
  Date.parse(a.startTime) - Date.parse(b.startTime) || a.player.localeCompare(b.player);

/** One entry per player per game. A player on two games in the window gets two entries. */
export function groupPlayers(games: { game: Game; props: PlayerProp[] }[]): PlayerEntry[] {
  const entries = new Map<string, PlayerEntry>();
  for (const { game, props } of games) {
    for (const prop of props) {
      const key = `${game.gameId}|${prop.player}`;
      const entry = entries.get(key) ?? {
        player: prop.player,
        league: game.league,
        gameId: game.gameId,
        gameTitle: game.title,
        startTime: game.startTime,
        expiry: prop.expiry,
        eventTickers: [],
        stats: [],
      };
      if (Date.parse(prop.expiry) > Date.parse(entry.expiry)) entry.expiry = prop.expiry;
      entry.stats.push({ metric: prop.metric, label: metricLabel(prop.metric), eventTicker: prop.eventTicker, lines: prop.lines });
      entries.set(key, entry);
    }
  }
  const rank = (metric: string) => {
    const at = METRIC_ORDER.indexOf(metric);
    return at === -1 ? METRIC_ORDER.length : at;
  };
  return [...entries.values()]
    .map((entry) => {
      const stats = [...entry.stats].sort((a, b) => rank(a.metric) - rank(b.metric));
      return { ...entry, stats, eventTickers: stats.map((s) => s.eventTicker) };
    })
    .sort(byStart);
}

export interface BustWording {
  /** Short, for a line picker: "Under 60". */
  chip: string;
  /** Completes "Pays $15 if Jonathan Taylor ...". */
  clause: string;
}

/**
 * How a bust is said in the person's terms. A line of 59.5 is the "60+" contract, so NO on it
 * means finishing under 60.
 */
export function bustWording(metric: string, line: number): BustWording {
  const { unit, zero } = metricInfo(metric);
  const n = Math.floor(line) + 1;
  if (n === 1) {
    const clause = zero ?? `records no ${unit}`;
    return { chip: clause.charAt(0).toUpperCase() + clause.slice(1), clause };
  }
  return { chip: `Under ${n}`, clause: `finishes under ${n} ${unit}` };
}

export const hasOpenLine = (stat: StatLines) => stat.lines.some((l) => l.contract.open);

export const TARGET_BUST_CHANCE = 0.35;

/**
 * The line whose chance of going under is closest to 35%, so the first cushion shown is neither a
 * sure thing nor a long shot. Closed lines and lines with no quote are skipped. Lines someone is
 * bidding on come first, because NO can only be bought against a bid; a line with only a last
 * trade is the fallback. A tie goes to the lower line.
 */
export function defaultBustLine(lines: PropLine[]): PropLine | null {
  const quoted = lines.flatMap((line) => {
    const p = line.contract.open ? chanceOf(line.contract.quote, "no").p : null;
    return p == null ? [] : [{ line, gap: Math.abs(p - TARGET_BUST_CHANCE), bid: line.contract.quote.bid != null }];
  });
  const pool = quoted.some((q) => q.bid) ? quoted.filter((q) => q.bid) : quoted;
  let best: (typeof pool)[number] | undefined;
  for (const q of pool) if (!best || q.gap < best.gap) best = q;
  return best?.line ?? null;
}

export type GameStatus = "upcoming" | "live" | "over";

const GAME_LENGTH_MS: Record<string, number> = { NFL: 4 * 3_600_000, NBA: 3 * 3_600_000 };

/**
 * Gemini does not say when a game ends and keeps it listed until it settles, so "over" is
 * a guess from kickoff and a typical game length.
 */
export function gameStatus({ league, startTime }: Pick<PlayerEntry, "league" | "startTime">, now: number): GameStatus {
  const start = Date.parse(startTime);
  if (now < start) return "upcoming";
  return now < start + (GAME_LENGTH_MS[league] ?? GAME_LENGTH_MS.NFL) ? "live" : "over";
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Players whose name or game matches `query`, each name once, leaving out names already in
 * `exclude`. With nothing typed it offers the players with the most stats listed, who are the
 * likeliest to be on someone's team.
 */
export function searchPlayers(entries: PlayerEntry[], query: string, exclude: string[], limit: number): PlayerEntry[] {
  const needle = fold(query.trim());
  const pool = needle ? entries : [...entries].sort((a, b) => b.stats.length - a.stats.length);
  const seen = new Set(exclude);
  const found: PlayerEntry[] = [];
  for (const entry of pool) {
    if (found.length === limit) break;
    if (seen.has(entry.player) || !fold(`${entry.player} ${entry.gameTitle}`).includes(needle)) continue;
    seen.add(entry.player);
    found.push(entry);
  }
  return found;
}

export const MIN_STAKE = 1;
export const MAX_STAKE = 1000;

/** A typed stake in dollars, or null when it is not a whole-cent amount in range. */
export function parseStake(text: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null;
  const dollars = Number(text);
  return dollars >= MIN_STAKE && dollars <= MAX_STAKE ? dollars : null;
}
