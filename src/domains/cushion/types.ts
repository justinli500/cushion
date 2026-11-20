import type { Side } from "@/domains/markets/types";

/** One contract position. Pays $1 per contract of `quantity` if the contract resolves on `side`. */
export interface Leg {
  symbol: string;
  side: Side;
  quantity: number;
  label: string;
  /** Present on ladder legs, so a payoff can be drawn against the settle price. */
  strike?: number;
}

export interface PricedLeg extends Leg {
  filled: number;
  cost: number;
}

/**
 * "sum": legs can all pay together (a strip, a single leg).
 * "one": at most one leg pays (weather buckets, where exactly one bucket wins).
 */
export type PayoutMode = "sum" | "one";

export interface Cushion {
  legs: Leg[];
  payoutMode: PayoutMode;
}

export interface CushionQuote {
  legs: PricedLeg[];
  payoutMode: PayoutMode;
  cost: number;
  /** The most the cushion can pay, from what the book could actually fill. */
  maxPayout: number;
  /** The most it would pay had every leg filled in full. */
  requestedPayout: number;
  /** True when the book was too thin to fill every leg. */
  partial: boolean;
}

export interface Chance {
  /** Probability from 0 to 1, or null when there is no usable quote. */
  p: number | null;
  low: number | null;
  high: number | null;
  /** True when bid and ask are far enough apart that `p` is a rough guess. */
  uncertain: boolean;
}
