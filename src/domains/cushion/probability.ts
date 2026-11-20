import type { Ladder, Quote, Side } from "@/domains/markets/types";
import type { Chance } from "./types";

const WIDE_SPREAD = 0.1;
const NO_CHANCE: Chance = { p: null, low: null, high: null, uncertain: true };

/** Chance that YES wins: the bid/ask midpoint, falling back to the last trade. */
export function yesChance(quote: Quote): Chance {
  const { bid, ask, last } = quote;
  if (bid != null && ask != null && ask >= bid) {
    return { p: (bid + ask) / 2, low: bid, high: ask, uncertain: ask - bid > WIDE_SPREAD };
  }
  if (last != null) return { p: last, low: bid ?? null, high: ask ?? null, uncertain: true };
  // One-sided book: a lone bid is a floor and a lone ask is a ceiling, so only the bound is known.
  if (bid != null) return { p: (bid + 1) / 2, low: bid, high: 1, uncertain: true };
  if (ask != null) return { p: ask / 2, low: 0, high: ask, uncertain: true };
  return NO_CHANCE;
}

export function chanceOf(quote: Quote, side: Side): Chance {
  const yes = yesChance(quote);
  if (side === "yes" || yes.p == null) return yes;
  return {
    p: 1 - yes.p,
    low: yes.high == null ? null : 1 - yes.high,
    high: yes.low == null ? null : 1 - yes.low,
    uncertain: yes.uncertain,
  };
}

export interface SurvivalPoint {
  strike: number;
  /** Chance the underlying settles at or above `strike`. */
  p: number;
}

/**
 * P(settle >= strike) for each quoted rung, forced to fall as the strike rises. Thin books give
 * ladders that wobble upward; a running minimum from the lowest strike removes the wobble.
 */
export function survivalCurve(ladder: Ladder): SurvivalPoint[] {
  let ceiling = 1;
  const points: SurvivalPoint[] = [];
  for (const rung of ladder.rungs) {
    const { p } = yesChance(rung.contract.quote);
    if (p == null) continue;
    ceiling = Math.min(ceiling, p);
    points.push({ strike: rung.strike, p: ceiling });
  }
  return points;
}

/** Chance the underlying settles at or above `level`, interpolated between rungs. */
export function chanceAtOrAbove(ladder: Ladder, level: number): number | null {
  const curve = survivalCurve(ladder);
  if (curve.length === 0) return null;
  if (level <= curve[0].strike) return curve[0].p;
  const last = curve[curve.length - 1];
  if (level >= last.strike) return last.p;
  const upper = curve.findIndex((point) => point.strike >= level);
  const a = curve[upper - 1];
  const b = curve[upper];
  return a.p + ((b.p - a.p) * (level - a.strike)) / (b.strike - a.strike);
}

/** The level the market gives an even chance of finishing above: its own estimate of the price. */
export function impliedSpot(ladder: Ladder): number | null {
  const curve = survivalCurve(ladder);
  if (curve.length === 0) return null;
  if (curve[0].p <= 0.5) return curve[0].strike;
  const upper = curve.findIndex((point) => point.p <= 0.5);
  if (upper === -1) return curve[curve.length - 1].strike;
  const a = curve[upper - 1];
  const b = curve[upper];
  if (a.p === b.p) return b.strike;
  return a.strike + ((b.strike - a.strike) * (a.p - 0.5)) / (a.p - b.p);
}
