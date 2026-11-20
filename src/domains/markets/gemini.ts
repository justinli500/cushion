import { cached } from "@/lib/ttl-cache";
import { bookResponseSchema, candlesResponseSchema, eventsResponseSchema, type RawEvent } from "./schemas";
import { toBucketMarket, toGame, toLadder, toPlayerProps } from "./normalise";
import type { Book, BucketMarket, Candle, Game, Ladder, PlayerProp } from "./types";

const BASE = "https://api.gemini.com";
// Prediction symbols look like GEMI-NFL-2611200115-IND-HOU-M-HOU and are case-sensitive upstream.
const SYMBOL = /^GEMI-[A-Z0-9-]{3,80}$/;

const STALE_GAME_MS = 5 * 60 * 60 * 1000;

export const isSymbol = (value: string) => SYMBOL.test(value);

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gemini ${path} responded ${res.status}`);
  return res.json();
}

function fetchEvents(query: Record<string, string>, ttlMs: number): Promise<RawEvent[]> {
  const search = new URLSearchParams({ limit: "500", ...query }).toString();
  return cached(`events:${search}`, ttlMs, async () => {
    const body = await getJson(`/v1/prediction-markets/events?${search}`);
    return eventsResponseSchema.parse(body).data;
  });
}

export async function getLadders(): Promise<Ladder[]> {
  const [crypto, commodities] = await Promise.all([
    fetchEvents({ status: "active", category: "Crypto" }, 20_000),
    fetchEvents({ status: "active", category: "Commodities" }, 20_000),
  ]);
  return [...crypto, ...commodities].map(toLadder).filter((l): l is Ladder => l !== null);
}

export async function getWeather(): Promise<BucketMarket[]> {
  const events = await fetchEvents({ status: "active", category: "Weather" }, 60_000);
  return events.map(toBucketMarket).filter((m): m is BucketMarket => m !== null);
}

export async function getGames(): Promise<Game[]> {
  const events = await fetchEvents({ status: "active", category: "Sports", sports_market_type: "moneyline" }, 15_000);
  // Gemini leaves a finished game "active" until it settles, sometimes for days. Drop those.
  const earliest = Date.now() - STALE_GAME_MS;
  return events
    .map(toGame)
    .filter((g): g is Game => g !== null && Date.parse(g.startTime) > earliest)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

/** Every market for one game. The events list has no gameId filter, so this searches by title. */
export async function getGameEvents(game: Game): Promise<RawEvent[]> {
  const events = await fetchEvents({ status: "active", category: "Sports", search: game.title }, 15_000);
  return events.filter((e) => e.gameId === game.gameId);
}

export async function getPlayerProps(game: Game): Promise<PlayerProp[]> {
  return (await getGameEvents(game)).flatMap(toPlayerProps);
}

/**
 * Every listed player prop, for every game, in one upstream request. Asking game by game is one
 * search per game and took over 20 seconds for a weekend's slate.
 */
export async function getAllPlayerProps(): Promise<PlayerProp[]> {
  const events = await fetchEvents({ status: "active", category: "Sports", sports_market_type: "prop" }, 60_000);
  return events.flatMap(toPlayerProps);
}

/** Returns the settled side for each contract symbol of an event, once Gemini has resolved it. */
export async function getResolutions(eventTicker: string): Promise<Record<string, "yes" | "no">> {
  return cached(`resolution:${eventTicker}`, 30_000, async () => {
    const body = await getJson(`/v1/prediction-markets/events/${encodeURIComponent(eventTicker)}`);
    const event = eventsResponseSchema.shape.data.element.parse(body);
    const resolved = event.contracts.filter((c) => c.resolutionSide != null);
    return Object.fromEntries(resolved.map((c) => [c.instrumentSymbol, c.resolutionSide!]));
  });
}

export function getBook(symbol: string): Promise<Book> {
  return cached(`book:${symbol}`, 2_500, async () => {
    const book = bookResponseSchema.parse(await getJson(`/v1/book/${symbol}`));
    const levels = (side: typeof book.bids) => side.map((l) => ({ price: l.price, size: l.amount }));
    return {
      bids: levels(book.bids).sort((a, b) => b.price - a.price),
      asks: levels(book.asks).sort((a, b) => a.price - b.price),
    };
  });
}

export type Timeframe = "1m" | "5m" | "15m" | "1hr" | "1day";

/** Oldest first. Gemini answers 400 "NoDataFound" for a symbol with no trades, which is an empty series. */
export function getCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  return cached(`candles:${symbol}:${timeframe}`, 30_000, async () => {
    const res = await fetch(`${BASE}/v2/candles/${symbol}/${timeframe}`, { cache: "no-store" });
    if (res.status === 400) return [];
    if (!res.ok) throw new Error(`Gemini candles ${symbol} responded ${res.status}`);
    return candlesResponseSchema
      .parse(await res.json())
      .map(([time, , , , close, volume]) => ({ time, close, volume }))
      .sort((a, b) => a.time - b.time);
  });
}
