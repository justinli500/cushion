import type { Candle, Game } from "@/domains/markets/types";

/** Both teams' chance of winning at one moment. A side is null until it has had a price. */
export interface OddsPoint {
  /** Milliseconds since the epoch, the same unit as Gemini's candle times. */
  t: number;
  home: number | null;
  away: number | null;
}

const HOUR = 3_600_000;

/** A live game's chart starts before kickoff, so the run-up shows. A game still to come gets the last day. */
export function sinceFor(game: Game, now: number): number {
  const start = Date.parse(game.startTime);
  return start <= now ? start - 1.5 * HOUR : now - 24 * HOUR;
}

/**
 * Puts two teams' traded prices on shared timestamps. Candles are trade-based and sparse, so each
 * side keeps its last price until it trades again. Both inputs are oldest first.
 */
export function mergeHistory(home: Candle[], away: Candle[], since: number): OddsPoint[] {
  const times = [...new Set([...home, ...away].map((candle) => candle.time).filter((t) => t >= since))].sort((a, b) => a - b);
  let h = 0;
  let a = 0;
  let homeNow: number | null = null;
  let awayNow: number | null = null;
  return times.map((t) => {
    while (h < home.length && home[h].time <= t) homeNow = home[h++].close;
    while (a < away.length && away[a].time <= t) awayNow = away[a++].close;
    return { t, home: homeNow, away: awayNow };
  });
}

/**
 * Appends a polled midpoint. A side with no price this poll keeps its last value, and a poll that
 * changes nothing returns the same array, so the chart does not redraw for it.
 */
export function addLivePoint(points: OddsPoint[], t: number, home: number | null, away: number | null): OddsPoint[] {
  const last = points[points.length - 1];
  const next = { t, home: home ?? last?.home ?? null, away: away ?? last?.away ?? null };
  if (home == null && away == null) return points;
  if (last && last.home === next.home && last.away === next.away) return points;
  return [...points, next];
}
