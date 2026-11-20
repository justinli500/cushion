export type Side = "yes" | "no";

export interface Quote {
  bid: number | null;
  ask: number | null;
  last: number | null;
}

export interface Contract {
  symbol: string;
  label: string;
  quote: Quote;
  open: boolean;
  /** Gemini's picture for this outcome, such as a team's logo. Only ever a URL on Gemini's own image host. */
  image?: string | null;
}

export const UNDERLYINGS = {
  BTC: { name: "Bitcoin", kind: "coin", spot: "btcusd", yahoo: "BTC-USD" },
  ETH: { name: "Ethereum", kind: "coin", spot: "ethusd", yahoo: "ETH-USD" },
  SOL: { name: "Solana", kind: "coin", spot: "solusd", yahoo: "SOL-USD" },
  XRP: { name: "XRP", kind: "coin", spot: "xrpusd", yahoo: "XRP-USD" },
  HYPE: { name: "Hyperliquid", kind: "coin", spot: "hypeusd", yahoo: null },
  ZEC: { name: "Zcash", kind: "coin", spot: "zecusd", yahoo: "ZEC-USD" },
  BRENT: { name: "Brent oil", kind: "commodity", spot: null, yahoo: "BZ=F" },
  WTI: { name: "WTI oil", kind: "commodity", spot: null, yahoo: "CL=F" },
  NGAS: { name: "Natural gas", kind: "commodity", spot: null, yahoo: "NG=F" },
  COPPER: { name: "Copper", kind: "commodity", spot: null, yahoo: "HG=F" },
  XAU: { name: "Gold", kind: "commodity", spot: null, yahoo: "GC=F" },
  XAG: { name: "Silver", kind: "commodity", spot: null, yahoo: "SI=F" },
} as const;

export type UnderlyingId = keyof typeof UNDERLYINGS;

export const isUnderlyingId = (value: string): value is UnderlyingId => value in UNDERLYINGS;

/** YES on a rung pays when the underlying settles at or above `strike`. */
export interface Rung {
  strike: number;
  contract: Contract;
}

export interface Ladder {
  kind: "ladder";
  eventTicker: string;
  title: string;
  underlying: UnderlyingId;
  expiry: string;
  /** "intraday" ladders expire within hours and are too short to cushion anything. */
  horizon: "intraday" | "dated";
  /** Ascending by strike. */
  rungs: Rung[];
}

/** Whole degrees Fahrenheit, inclusive. A null bound is an open tail. Exactly one bucket wins. */
export interface Bucket {
  lo: number | null;
  hi: number | null;
  contract: Contract;
}

export interface BucketMarket {
  kind: "buckets";
  eventTicker: string;
  title: string;
  city: string;
  expiry: string;
  /** Ascending by temperature. */
  buckets: Bucket[];
}

export interface TeamSide {
  abbr: string;
  name: string;
  side: "home" | "away";
  contract: Contract;
}

export interface Game {
  kind: "game";
  gameId: string;
  eventTicker: string;
  league: string;
  title: string;
  startTime: string;
  expiry: string;
  isLive: boolean;
  teams: TeamSide[];
  /** True when the market has an outcome that is neither team, so "not a win" is not "a loss". */
  hasDraw: boolean;
  volume: number;
  /** Gemini's picture for the game's sport. */
  image?: string | null;
}

/** YES pays when the player's stat finishes above `line`, e.g. line 29.5 is "30+". */
export interface PropLine {
  line: number;
  contract: Contract;
}

export interface PlayerProp {
  gameId: string;
  eventTicker: string;
  expiry: string;
  player: string;
  team: string | null;
  position: string | null;
  metric: string;
  lines: PropLine[];
}

/**
 * A market about something in the news: a Fed decision, how low the S&P gets, who wins an award.
 * Each outcome is its own yes/no contract.
 */
export interface EventMarket {
  kind: "event";
  eventTicker: string;
  title: string;
  /** Gemini's category, e.g. "Economics", "Politics", "Culture". */
  category: string;
  expiry: string;
  volume: number;
  outcomes: { label: string; contract: Contract }[];
}

export interface Level {
  price: number;
  size: number;
}

/** The YES book. Buying NO at price p is selling YES at 1 - p into the bids. */
export interface Book {
  bids: Level[];
  asks: Level[];
}

export interface Candle {
  time: number;
  close: number;
  volume: number;
}
