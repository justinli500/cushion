import { isUnderlyingId, type UnderlyingId } from "@/domains/markets/types";

export interface PricePoint {
  /** YYYY-MM-DD */
  date: string;
  close: number;
}

export interface Holding {
  symbol: string;
  /** Dollars held. */
  value: number;
}

// Common names people type for things Gemini lists under another code.
const ALIASES: Record<string, UnderlyingId> = { BITCOIN: "BTC", ETHEREUM: "ETH", SOLANA: "SOL", GOLD: "XAU", SILVER: "XAG", OIL: "BRENT" };

export const cleanSymbol = (raw: string) => {
  const symbol = raw.trim().toUpperCase();
  return ALIASES[symbol] ?? symbol;
};

/** A holding is only called a match when the factor explains at least this share of its daily moves. */
export const MIN_R2 = 0.15;
const MIN_DAYS = 40;

export interface Fit {
  /** Percent move in the holding per one percent move in the factor. */
  beta: number;
  /** Share of the holding's daily moves the factor explains, from 0 to 1. */
  r2: number;
  days: number;
}

/**
 * Ordinary least squares of the holding's returns on the factor's. Returns are taken between
 * consecutive days on which both have a price, so a stock's Friday-to-Monday move is compared
 * with a coin's Friday-to-Monday move and not with its Sunday-to-Monday one.
 */
export function regress(holding: PricePoint[], factor: PricePoint[]): Fit | null {
  const factorClose = new Map(factor.map((point) => [point.date, point.close]));
  const shared = holding.filter((point) => factorClose.has(point.date) && point.close > 0);
  const pairs: [number, number][] = [];
  for (let i = 1; i < shared.length; i++) {
    const x0 = factorClose.get(shared[i - 1].date)!;
    const x1 = factorClose.get(shared[i].date)!;
    if (x0 > 0 && x1 > 0) pairs.push([x1 / x0 - 1, shared[i].close / shared[i - 1].close - 1]);
  }
  const n = pairs.length;
  if (n < MIN_DAYS) return null;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return { beta: sxy / sxx, r2: (sxy * sxy) / (sxx * syy), days: n };
}

export type HoldingRead = Holding &
  (
    | { status: "direct"; underlying: UnderlyingId }
    | { status: "tracks"; underlying: UnderlyingId; fit: Fit }
    /** Has history, but nothing Gemini lists moves with it closely enough to protect it. */
    | { status: "none" }
    /** No price history was found for the symbol. */
    | { status: "unknown" }
  );

export type History = Record<string, PricePoint[] | null | undefined>;

/** Works out which listed market, if any, a holding moves with. */
export function readHolding(holding: Holding, history: History, factors: UnderlyingId[]): HoldingRead {
  if (isUnderlyingId(holding.symbol)) return { ...holding, status: "direct", underlying: holding.symbol };
  const series = history[holding.symbol];
  if (!series || series.length < MIN_DAYS) return { ...holding, status: "unknown" };

  let best: { underlying: UnderlyingId; fit: Fit } | null = null;
  for (const underlying of factors) {
    const factorSeries = history[underlying];
    const fit = factorSeries ? regress(series, factorSeries) : null;
    if (fit && (!best || fit.r2 > best.fit.r2)) best = { underlying, fit };
  }
  if (!best || best.fit.r2 < MIN_R2) return { ...holding, status: "none" };
  return { ...holding, status: "tracks", ...best };
}

export interface Exposure {
  underlying: UnderlyingId;
  /**
   * Dollars riding on the underlying. Positive loses when it falls. Negative loses when it rises
   * (a holding that moves against it, such as an airline against oil).
   */
  dollars: number;
  holdings: HoldingRead[];
}

/** Adds up what each holding has riding on each listed market, largest first. */
export function exposures(reads: HoldingRead[]): Exposure[] {
  const byUnderlying = new Map<UnderlyingId, Exposure>();
  for (const read of reads) {
    if (read.status !== "direct" && read.status !== "tracks") continue;
    const dollars = read.status === "direct" ? read.value : read.value * read.fit.beta;
    const exposure = byUnderlying.get(read.underlying) ?? { underlying: read.underlying, dollars: 0, holdings: [] };
    exposure.dollars += dollars;
    exposure.holdings.push(read);
    byUnderlying.set(read.underlying, exposure);
  }
  return [...byUnderlying.values()].sort((a, b) => Math.abs(b.dollars) - Math.abs(a.dollars));
}
