import type { RawContract, RawEvent } from "./schemas";
import {
  isUnderlyingId,
  type Bucket,
  type BucketMarket,
  type Contract,
  type Game,
  type Ladder,
  type PlayerProp,
  type TeamSide,
} from "./types";

const IMAGE_HOSTS = ["https://assets.gemini.com/", "https://a.espncdn.com/"];

/** An image URL is only passed on to the page if it is on Gemini's or ESPN's own image host. */
export const trustedImage = (url: string | null | undefined): string | null =>
  url != null && IMAGE_HOSTS.some((host) => url.startsWith(host)) ? url : null;

export function toContract(raw: RawContract): Contract {
  return {
    symbol: raw.instrumentSymbol,
    label: raw.label,
    image: trustedImage(raw.imageUrl),
    quote: {
      bid: raw.prices?.bestBid ?? null,
      ask: raw.prices?.bestAsk ?? null,
      last: raw.prices?.lastTradePrice ?? null,
    },
    open: raw.status === "active" && (raw.marketState == null || raw.marketState === "open"),
  };
}

/** Ladder tickers are the underlying followed by a timestamp, e.g. BTC2611202200. */
export function toLadder(event: RawEvent): Ladder | null {
  const underlying = /^[A-Z]+/.exec(event.ticker)?.[0] ?? "";
  if (event.template !== "prices-ladder" || !isUnderlyingId(underlying) || !event.expiryDate) return null;
  const rungs = event.contracts
    .filter((c) => c.strike?.type === "above" && c.strike.value != null && !Number.isNaN(c.strike.value))
    .map((c) => ({ strike: c.strike!.value as number, contract: toContract(c) }))
    .sort((a, b) => a.strike - b.strike);
  if (rungs.length === 0) return null;
  return {
    kind: "ladder",
    eventTicker: event.ticker,
    title: event.title,
    underlying,
    expiry: event.expiryDate,
    horizon: /price on/i.test(event.title) ? "dated" : "intraday",
    rungs,
  };
}

/** Weather contract tickers carry the bounds: LO69 (69 or below), 70TO71, HI78 (78 or above). */
export function toBucket(raw: RawContract): Bucket | null {
  const contract = toContract(raw);
  const range = /^(\d+)TO(\d+)$/.exec(raw.ticker);
  if (range) return { lo: Number(range[1]), hi: Number(range[2]), contract };
  const low = /^LO(\d+)$/.exec(raw.ticker);
  if (low) return { lo: null, hi: Number(low[1]), contract };
  const high = /^HI(\d+)$/.exec(raw.ticker);
  if (high) return { lo: Number(high[1]), hi: null, contract };
  return null;
}

export function toBucketMarket(event: RawEvent): BucketMarket | null {
  const city = /^Highest temperature in (.+?) on /.exec(event.title)?.[1];
  if (!event.ticker.startsWith("WXHIGH-") || !city || !event.expiryDate) return null;
  const buckets = event.contracts
    .map(toBucket)
    .filter((b): b is Bucket => b !== null)
    .sort((a, b) => (a.hi ?? Infinity) - (b.hi ?? Infinity));
  if (buckets.length === 0) return null;
  return { kind: "buckets", eventTicker: event.ticker, title: event.title, city, expiry: event.expiryDate, buckets };
}

/** A full-game moneyline event becomes a Game. Period moneylines (1st half, etc.) are skipped. */
export function toGame(event: RawEvent): Game | null {
  const market = event.sportsMarket;
  if (market?.type !== "moneyline" || market.scope?.type !== "full_contest") return null;
  if (!event.gameId || !event.startTime || !event.expiryDate || !event.participants) return null;
  const teams = event.participants.flatMap((p): TeamSide[] => {
    const raw = event.contracts.find((c) => c.ticker === p.abbreviation);
    if (!raw || (p.side !== "home" && p.side !== "away")) return [];
    return [{ abbr: p.abbreviation, name: p.name, side: p.side, contract: toContract(raw) }];
  });
  if (teams.length !== 2) return null;
  return {
    kind: "game",
    gameId: event.gameId,
    eventTicker: event.ticker,
    league: event.ticker.split("-")[0],
    title: event.title,
    startTime: event.startTime,
    expiry: event.expiryDate,
    isLive: Date.parse(event.startTime) <= Date.now() && event.status === "active",
    teams,
    hasDraw: event.contracts.length > teams.length,
    volume: event.volume ?? 0,
    image: trustedImage(event.imageUrl),
  };
}

/** One prop event lists every player for a metric; this groups its contracts by player name. */
export function toPlayerProps(event: RawEvent): PlayerProp[] {
  const market = event.sportsMarket;
  if (market?.type !== "prop" || !market.metric || !event.gameId || !event.expiryDate) return [];
  const byPlayer = new Map<string, PlayerProp>();
  for (const raw of event.contracts) {
    const player = /^(.+?) \d+(\.\d+)?\+/.exec(raw.label)?.[1];
    if (!player || raw.strike?.type !== "over" || raw.strike.value == null) continue;
    const prop = byPlayer.get(player) ?? {
      gameId: event.gameId,
      eventTicker: event.ticker,
      expiry: event.expiryDate,
      player,
      team: null,
      position: null,
      metric: market.metric,
      lines: [],
    };
    prop.lines.push({ line: raw.strike.value, contract: toContract(raw) });
    byPlayer.set(player, prop);
  }
  return [...byPlayer.values()].map((prop) => ({ ...prop, lines: prop.lines.sort((a, b) => a.line - b.line) }));
}
