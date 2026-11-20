import Anthropic from "@anthropic-ai/sdk";
import { cached } from "@/lib/ttl-cache";
import { askClaude, UnusableReply, type NewsClient } from "./claude";
import { numbersLine } from "./fallback";
import type { NewsCard, NewsLine, NewsLines } from "./schema";

const TTL_MS = 3 * 60 * 60 * 1000;
const TIMEOUT_MS = 25_000;

interface Waiting {
  card: NewsCard;
  resolve(text: string): void;
  reject(error: unknown): void;
}

/** The only place the key is read. It never leaves the server and is never logged. */
export function newsClient(): NewsClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  // A retry would only spend the timeout, and a failed call already falls back to the numbers.
  return apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
}

// The key is the exact text the model is sent. A looser key (rounded numbers, folded case) would let
// a request whose text differs from an honest card's, but normalises the same, fill that card's entry.
const cardKey = (card: NewsCard) => [card.topic, card.facts];

/**
 * A line is cached for the exact set of cards it was written alongside, not for its own card alone.
 * Every card in a request reaches the model in one prompt, and cards come from the browser. If a
 * line were shared by card, one visitor could send an ordinary card next to a crafted one and have
 * the model's answer for the ordinary card served to everyone else who asks about it.
 */
const batchKey = (cards: NewsCard[]) => JSON.stringify(cards.map(cardKey).sort());

const cacheKey = (day: string, batch: string, card: NewsCard) => `news:${JSON.stringify([day, batch, cardKey(card)])}`;

/** Names the failure without echoing an SDK error message, which can carry request details. */
function reason(error: unknown): string {
  if (error instanceof UnusableReply) return error.message;
  if (error instanceof Anthropic.APIError) return `${error.name}, status ${error.status ?? "none"}`;
  return error instanceof Error ? error.name : "unknown error";
}

/** Asks Claude once for every card that is not cached, and settles each card's cache entry. Never throws. */
async function fill(client: NewsClient, waiting: Waiting[], now: Date, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const lines = await askClaude(client, waiting.map((w) => w.card), now, controller.signal);
    waiting.forEach((w, i) => {
      const line = lines[i];
      if (line === null) w.reject(new UnusableReply("no usable line"));
      else w.resolve(line);
    });
    const dropped = lines.filter((line) => line === null).length;
    if (dropped > 0) console.warn(`news: ${dropped} of ${lines.length} model lines were unusable, using numbers`);
  } catch (error) {
    console.warn(`news: model call failed (${reason(error)}), using numbers`);
    waiting.forEach((w) => w.reject(error));
  } finally {
    clearTimeout(timer);
  }
}

/** A model line per card in request order, or null where the card must fall back. */
async function modelLines(cards: NewsCard[], client: NewsClient, now: Date, timeoutMs: number) {
  const day = now.toISOString().slice(0, 10);
  const open = new Map<string, Waiting>();
  // `cached` calls the loader synchronously for a miss, so `open` is complete before `fill` starts. A concurrent
  // request for the same card finds this request's pending entry and waits on it instead of asking again.
  const batch = batchKey(cards);
  const pending = cards.map((card) => {
    const key = cacheKey(day, batch, card);
    return cached<string>(key, TTL_MS, () => new Promise((resolve, reject) => open.set(key, { card, resolve, reject })));
  });
  if (open.size > 0) void fill(client, [...open.values()], now, timeoutMs);
  const settled = await Promise.allSettled(pending);
  return settled.map((result) => (result.status === "fulfilled" ? result.value : null));
}

export interface WriteOptions {
  now?: Date;
  timeoutMs?: number;
}

/** One line per card, always. A card the model could not write gets its own numbers instead. */
export async function writeLines(
  cards: NewsCard[],
  client: NewsClient | null,
  { now = new Date(), timeoutMs = TIMEOUT_MS }: WriteOptions = {},
): Promise<NewsLines> {
  const ai = client ? await modelLines(cards, client, now, timeoutMs) : [];
  return Object.fromEntries(
    cards.map((card, i): [string, NewsLine] => {
      const text = ai[i];
      return [card.id, text ? { text, source: "ai" } : { text: numbersLine(card.facts), source: "numbers" }];
    }),
  );
}
