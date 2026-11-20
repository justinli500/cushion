/**
 * The last good answer from each of this app's routes, so a page that was looked at a moment ago,
 * or whose data was fetched ahead, has numbers to show the instant it opens. Each page still
 * fetches fresh data straight away and replaces them.
 *
 * Answers are kept in memory and in the tab's session storage, so they are still there after a
 * reload. Session storage is separate from the storage the account and profile live in, so a full
 * cache can never crowd those out.
 *
 * Prices move, so an answer is only handed back while it is recent. Older than that, a page shows
 * that it is loading instead of numbers that may no longer be true.
 */
const MAX_AGE_MS = 5 * 60_000;
/** Order-book addresses differ with every cushion, so the store is capped and drops its oldest. */
const MAX_ENTRIES = 200;
const PREFIX = "cushion.cache:";

interface Entry {
  data: unknown;
  at: number;
}

const store = new Map<string, Entry>();

type Shelf = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
let shelf: Shelf | null | undefined;

/** The tab's session storage, or null where there is none: on the server, or in a browser that refuses it. */
function kept(): Shelf | null {
  if (shelf === undefined) {
    try {
      shelf = typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
      shelf = null;
    }
  }
  return shelf;
}

function emptyShelf(): void {
  const s = kept();
  if (!s) return;
  const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).filter((key): key is string => key?.startsWith(PREFIX) ?? false);
  for (const key of keys) s.removeItem(key);
}

export function remember(url: string, data: unknown, now = Date.now()): void {
  store.delete(url);
  store.set(url, { data, at: now });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value as string;
    store.delete(oldest);
    kept()?.removeItem(PREFIX + oldest);
  }
  const s = kept();
  if (!s) return;
  const text = JSON.stringify({ data, at: now });
  try {
    s.setItem(PREFIX + url, text);
  } catch {
    // Full. What is kept there is only a convenience, so it is all dropped and this answer tried once more.
    emptyShelf();
    try {
      s.setItem(PREFIX + url, text);
    } catch {
      // Too large to keep across a reload. It is still held in memory.
    }
  }
}

/** What the session storage holds for `url`, read once into memory. Anything unreadable is thrown away. */
function fromShelf(url: string): Entry | undefined {
  const s = kept();
  const text = s?.getItem(PREFIX + url);
  if (!s || text == null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "data" in parsed && "at" in parsed && typeof parsed.at === "number") {
      const entry = { data: parsed.data, at: parsed.at };
      store.set(url, entry);
      return entry;
    }
  } catch {
    // Not JSON: fall through and remove it.
  }
  s.removeItem(PREFIX + url);
  return undefined;
}

/** The last answer for `url`, or undefined when there is none or it is too old to show. */
export function recall<T>(url: string, now = Date.now()): T | undefined {
  const entry = store.get(url) ?? fromShelf(url);
  return entry && now - entry.at <= MAX_AGE_MS ? (entry.data as T) : undefined;
}

/** How long ago `url` was last answered, in milliseconds, or Infinity when it never was. */
export const ageOf = (url: string, now = Date.now()): number => now - ((store.get(url) ?? fromShelf(url))?.at ?? -Infinity);

/** For tests: forgets everything held in memory, and swaps the storage that outlives a reload. */
export function forgetAll(storage?: Shelf | null): void {
  store.clear();
  if (storage !== undefined) shelf = storage;
}
