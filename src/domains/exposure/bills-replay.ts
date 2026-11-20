import { settleLegs } from "@/domains/cushion/price";
import type { PricedLeg } from "@/domains/cushion/types";
import { toLadder } from "@/domains/markets/normalise";
import type { RawEvent } from "@/domains/markets/schemas";
import type { Candle, Ladder, UnderlyingId } from "@/domains/markets/types";
import { billCushion, COVER_LEVELS, type CoverLevel } from "./bills";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_HOUR_MS = 22 * 60 * 60 * 1000;
// Gemini resolves a day ladder within about a minute of 22:00 UTC.
const SETTLE_GRACE_MS = 5 * 60 * 1000;

const cents = (dollars: number) => Math.round(dollars * 100) / 100;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayBefore = (date: string) => isoDate(Date.parse(`${date}T00:00:00Z`) - DAY_MS);

/** UTC dates, oldest first, of the last `count` day ladders that have expired and had time to settle. */
export function settledDates(now: number, count: number): string[] {
  const latest = Date.parse(`${isoDate(now - EXPIRY_HOUR_MS - SETTLE_GRACE_MS)}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => isoDate(latest - (count - 1 - i) * DAY_MS));
}

/** Day ladder tickers are the underlying, the expiry as YYMMDD, then 2200: BRENT2611192200. */
export const dailyTicker = (underlying: UnderlyingId, date: string) =>
  `${underlying}${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}2200`;

/** A day ladder after Gemini settled it. */
export interface SettledDay {
  date: string;
  settle: number;
  /** Every rung that was listed at settlement, marked open so a cover can be rebuilt from it. */
  ladder: Ladder;
  resolutions: Record<string, "yes" | "no">;
}

export function toSettledDay(event: RawEvent): SettledDay | null {
  const ladder = toLadder(event);
  const settle = event.contracts.find((c) => c.settlementValue != null)?.settlementValue;
  const resolved = event.contracts.filter((c) => c.resolutionSide != null);
  if (!ladder || settle == null || resolved.length === 0) return null;
  return {
    date: ladder.expiry.slice(0, 10),
    settle,
    ladder: { ...ladder, rungs: ladder.rungs.map((r) => ({ ...r, contract: { ...r.contract, open: true } })) },
    resolutions: Object.fromEntries(resolved.map((c) => [c.instrumentSymbol, c.resolutionSide!])),
  };
}

/** A settled day plus the price the day opened at: the previous day's settlement. */
export interface ReplayInput extends SettledDay {
  reference: number;
}

/** Days with no settled day before them have no opening price and drop out. */
export function withReferences(days: SettledDay[]): ReplayInput[] {
  const settles = new Map(days.map((d) => [d.date, d.settle]));
  return days.flatMap((d) => {
    const reference = settles.get(dayBefore(d.date));
    return reference == null ? [] : [{ ...d, reference }];
  });
}

/** Typical size of one day's move: the root mean square of the day-to-day change in settlement. */
export function dailySigma(settles: number[]): number {
  const changes = settles.slice(1).map((s, i) => s - settles[i]);
  return changes.length === 0 ? 0 : Math.sqrt(changes.reduce((sum, c) => sum + c * c, 0) / changes.length);
}

/** Standard normal CDF by Abramowitz and Stegun 7.1.26, accurate to about 1e-7. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 + erf / 2 : 0.5 - erf / 2;
}

/**
 * Price of YES on "settles at or above strike" when nothing traded. A plain model: the day's
 * settlement is the opening price plus a normal move with standard deviation `sigma`, so
 * P(settle >= strike) = 1 - Phi((strike - reference) / sigma). Priced within Gemini's 1 cent to 99 cents.
 */
export function estimateYesPrice(strike: number, reference: number, sigma: number): number {
  const p = 1 - normalCdf((strike - reference) / Math.max(sigma, 1e-9));
  return Math.min(0.99, Math.max(0.01, Math.round(p * 100) / 100));
}

/** YES price of the first hour in which the contract traded, or undefined when it never did. */
export function firstTradedPrice(candles: Candle[]): number | undefined {
  return candles.find((c) => c.volume > 0)?.close;
}

export interface ReplayDay {
  date: string;
  settle: number;
  cost: number;
  payout: number;
  /** True when at least one leg's cost came from the model, not a traded price. */
  estimated: boolean;
}

export interface ReplayOptions {
  dollarsPerPoint: number;
  sigma: number;
  /** Traded YES price by contract symbol. A missing symbol never traded. */
  firstTrade: Record<string, number | undefined>;
}

/** What the cover for one level would have cost and paid on one settled day, or null if Gemini's results are incomplete. */
export function replayDay(day: ReplayInput, level: CoverLevel, { dollarsPerPoint, sigma, firstTrade }: ReplayOptions): ReplayDay | null {
  const { legs } = billCushion({ ladder: day.ladder, spot: day.reference, level, dollarsPerPoint });
  let estimated = false;
  const priced = legs.map((leg): PricedLeg => {
    const traded = firstTrade[leg.symbol];
    if (traded == null) estimated = true;
    const yes = traded ?? estimateYesPrice(leg.strike!, day.reference, sigma);
    return { ...leg, filled: leg.quantity, cost: cents(leg.quantity * (leg.side === "yes" ? yes : 1 - yes)) };
  });
  const payout = settleLegs(priced, day.resolutions);
  if (payout == null) return null;
  const cost = cents(priced.reduce((sum, l) => sum + l.cost, 0));
  return { date: day.date, settle: day.settle, cost, payout, estimated };
}

export interface LevelReplay {
  days: ReplayDay[];
  totals: { cost: number; payout: number; net: number };
}

export type Replay = Record<CoverLevel, LevelReplay>;

export function replay(inputs: ReplayInput[], options: ReplayOptions): Replay {
  const forLevel = (level: CoverLevel): LevelReplay => {
    const days = inputs.map((d) => replayDay(d, level, options)).filter((d): d is ReplayDay => d !== null);
    const cost = cents(days.reduce((sum, d) => sum + d.cost, 0));
    const payout = cents(days.reduce((sum, d) => sum + d.payout, 0));
    return { days, totals: { cost, payout, net: cents(payout - cost) } };
  };
  return Object.fromEntries(COVER_LEVELS.map((level) => [level, forLevel(level)])) as Replay;
}
