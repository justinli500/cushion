import type { UnderlyingId } from "@/domains/markets/types";

/**
 * One line per subject on what is going on this week, written by hand from the news and dated.
 * These are static on purpose: a line written fresh on every page load means a paid model call and
 * a web search each time. Update the lines and the date together. A subject with nothing solid to
 * say has no line, and its card shows the market's numbers alone.
 */
export const HEADLINES_AS_OF = "2026-11-19";

const LINES = {
  bitcoin: "Bitcoin fell about 12% last week to a three-month low as money flowed out of Bitcoin funds.",
  crypto: "Crypto sold off last week, led by Bitcoin's drop of about 12% to a three-month low.",
  oil: "Oil has slid from above $100 a barrel to the low $90s this month as Gulf exports recover and Iran tensions ease.",
  nfl: "Week 11 wraps up Sunday, with Thanksgiving's three games next: Bears at Lions, Eagles at Cowboys and Chiefs at Bills.",
} as const;

const BY_UNDERLYING: Partial<Record<UnderlyingId, keyof typeof LINES>> = {
  BTC: "bitcoin",
  ETH: "crypto",
  SOL: "crypto",
  XRP: "crypto",
  HYPE: "crypto",
  ZEC: "crypto",
  BRENT: "oil",
  WTI: "oil",
};

export const headlineForUnderlying = (underlying: UnderlyingId): string | null => {
  const key = BY_UNDERLYING[underlying];
  return key ? LINES[key] : null;
};

export const headlineForLeague = (league: string): string | null => (league === "NFL" ? LINES.nfl : null);

export const HEADLINE_OIL = LINES.oil;
