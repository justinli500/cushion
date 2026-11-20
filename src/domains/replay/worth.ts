import type { Candle, Quote, Side } from "@/domains/markets/types";
import { frameAt, replaySpan, type Replay } from "./replay";

const cents = (dollars: number) => Math.round(dollars * 100) / 100;

/** How long after a scoring play the market is given to react before the change in worth is read. */
export const EVENT_WINDOW_MS = 3 * 60_000;

const ORDINALS = ["1st", "2nd", "3rd", "4th"];
export const periodLabel = (period: number) => ORDINALS[period - 1] ?? "OT";

/** One leg of a cushion the person holds: `filled` contracts on one side of one contract. */
export interface HeldLeg {
  symbol: string;
  side: Side;
  filled: number;
}

/** What a cushion would sell for at one moment. Worth holds until the next point. */
export interface WorthPoint {
  t: number;
  worth: number;
}

/** What one contract of this side sells for: Yes into the bid, No at one minus the ask. Null when nobody is offering. */
export function sellPrice(quote: Quote | undefined, side: Side): number | null {
  if (!quote) return null;
  if (side === "yes") return quote.bid;
  return quote.ask == null ? null : 1 - quote.ask;
}

/** The legs at what each would sell for now. A side with no price is worth nothing. Same rule as `valueNow` in replay.ts. */
export function worthFromQuotes(legs: HeldLeg[], quoteOf: (symbol: string) => Quote | undefined): number {
  return cents(legs.reduce((sum, leg) => sum + leg.filled * (sellPrice(quoteOf(leg.symbol), leg.side) ?? 0), 0));
}

/**
 * What the legs would have sold for each time one of their contracts traded in a saved game, from
 * just before kickoff to the end. Each point is read from the game as it stood then, so a point
 * never knows about a later trade. The screen cuts the list at the video's position.
 */
export function replayWorth(replay: Replay, legs: HeldLeg[]): WorthPoint[] {
  const { start, end } = replaySpan(replay);
  const symbols = new Set(legs.map((leg) => leg.symbol));
  const traded = [replay.home, replay.away]
    .filter((team) => symbols.has(team.symbol))
    .flatMap((team) => team.trades.map((trade) => trade.t))
    .filter((t) => t > start && t <= end);
  const times = [...new Set([start, ...traded])].sort((a, b) => a - b);
  return times.map((t) => {
    const { game } = frameAt(replay, t);
    return { t, worth: worthFromQuotes(legs, (symbol) => game.teams.find((team) => team.contract.symbol === symbol)?.contract.quote) };
  });
}

const lastClose = (candles: Candle[], t: number): number | null => {
  let close: number | null = null;
  for (const candle of candles) {
    if (candle.time > t) break;
    close = candle.close;
  }
  return close;
};

/**
 * What the legs were worth at each real trade of their contracts between `since` and `until`, each
 * leg at its last traded price. Empty when none of the contracts had traded by then.
 */
export function tradedWorth(legs: HeldLeg[], candles: Record<string, Candle[]>, since: number, until: number): WorthPoint[] {
  const times = [
    ...new Set([since, ...legs.flatMap((leg) => (candles[leg.symbol] ?? []).map((c) => c.time)).filter((t) => t > since && t <= until)]),
  ].sort((a, b) => a - b);
  const points: WorthPoint[] = [];
  for (const t of times) {
    const prices = legs.map((leg) => ({ leg, price: lastClose(candles[leg.symbol] ?? [], t) }));
    if (prices.every((p) => p.price == null)) continue;
    const worth = prices.reduce((sum, { leg, price }) => sum + (price == null ? 0 : leg.filled * (leg.side === "yes" ? price : 1 - price)), 0);
    points.push({ t, worth: cents(worth) });
  }
  return points;
}

/** The worth at `t`: the last point at or before it, or null before the first. */
export function worthAtTime(points: WorthPoint[], t: number): number | null {
  let worth: number | null = null;
  for (const point of points) {
    if (point.t > t) break;
    worth = point.worth;
  }
  return worth;
}

/** The chart as of `at`: every point before it, then `now`. Nothing after `at` is kept, so the future never shows. */
export function worthUpTo(points: WorthPoint[], at: number, now: number): WorthPoint[] {
  return [...points.filter((point) => point.t < at), { t: at, worth: now }];
}

/** How much the worth moved across a play at `t`, read up to `EVENT_WINDOW_MS` later but never past `at`. */
export function changeAcross(points: WorthPoint[], t: number, at: number): number | null {
  const before = worthAtTime(points, t);
  const after = worthAtTime(points, Math.min(t + EVENT_WINDOW_MS, at));
  return before == null || after == null ? null : cents(after - before);
}

/** A saved game's scoring plays up to `at`, each with the change in worth across it. Oldest first. */
export interface ScoreEvent {
  t: number;
  /** "1st · 10:43" */
  when: string;
  text: string;
  /** "IND 3, HOU 0" */
  score: string;
  change: number | null;
}

export function scoreEvents(replay: Replay, series: WorthPoint[], at: number): ScoreEvent[] {
  return replay.plays
    .filter((play) => play.scoring && play.t <= at)
    .map((play) => ({
      t: play.t,
      when: [periodLabel(play.period), play.clock].filter(Boolean).join(" · "),
      text: play.text.trim(),
      score: `${replay.away.abbr} ${play.away}, ${replay.home.abbr} ${play.home}`,
      change: changeAcross(series, play.t, at),
    }));
}

/** Where each period of a saved game began, for the chart's labels. */
export function periodTicks(replay: Replay, at: number): { t: number; text: string }[] {
  const seen = new Set<number>();
  const ticks: { t: number; text: string }[] = [];
  for (const play of replay.plays) {
    if (play.t > at) break;
    if (seen.has(play.period)) continue;
    seen.add(play.period);
    ticks.push({ t: play.t, text: periodLabel(play.period) });
  }
  return ticks;
}

const MINUTE = 60_000;
const STEPS = [5, 10, 15, 30, 60, 120, 180, 360, 720].map((m) => m * MINUTE);
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** Round clock times (7:30 PM, 8:00 PM) across a stretch, for a live game whose plays carry no times. */
export function clockTicks(from: number, to: number): { t: number; text: string }[] {
  const step = STEPS.find((s) => (to - from) / s <= 4) ?? STEPS[STEPS.length - 1];
  const ticks: { t: number; text: string }[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push({ t, text: clock.format(t) });
  return ticks;
}

/** Candle-based history, then what was polled since the page opened (which is finer, so it takes over). */
export function joinWorth(history: WorthPoint[], samples: WorthPoint[]): WorthPoint[] {
  const first = samples[0];
  return first ? [...history.filter((point) => point.t < first.t), ...samples] : history;
}

/** Adds a polled sample only when the worth changed: the chart holds a value until the next point. */
export function addSample(samples: WorthPoint[], sample: WorthPoint): WorthPoint[] {
  const last = samples[samples.length - 1];
  return last && last.worth === sample.worth ? samples : [...samples, sample];
}
