/**
 * The last good answer from each of this app's routes, kept for as long as the tab is open, so a
 * page that was looked at a moment ago, or whose data was fetched ahead, has numbers to show the
 * instant it opens. Each page still fetches fresh data straight away and replaces them.
 *
 * Prices move, so an answer is only handed back while it is recent. Older than that, a page shows
 * that it is loading instead of numbers that may no longer be true.
 */
const MAX_AGE_MS = 5 * 60_000;
/** Order-book addresses differ with every cushion, so the store is capped and drops its oldest. */
const MAX_ENTRIES = 200;

const store = new Map<string, { data: unknown; at: number }>();

export function remember(url: string, data: unknown, now = Date.now()): void {
  store.delete(url);
  store.set(url, { data, at: now });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
}

/** The last answer for `url`, or undefined when there is none or it is too old to show. */
export function recall<T>(url: string, now = Date.now()): T | undefined {
  const entry = store.get(url);
  return entry && now - entry.at <= MAX_AGE_MS ? (entry.data as T) : undefined;
}

/** How long ago `url` was last answered, in milliseconds, or Infinity when it never was. */
export const ageOf = (url: string, now = Date.now()): number => now - (store.get(url)?.at ?? -Infinity);

/** For tests. */
export const forgetAll = (): void => store.clear();
