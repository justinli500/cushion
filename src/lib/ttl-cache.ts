interface Entry {
  expires: number;
  value: Promise<unknown>;
}

// Some keys are built from request input (contract symbols), so the cache must stay bounded.
const MAX_ENTRIES = 2000;
const entries = new Map<string, Entry>();

function makeRoom() {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.expires <= now) entries.delete(key);
  }
  // Still full of live entries: drop the oldest. A Map iterates in insertion order.
  for (const key of entries.keys()) {
    if (entries.size < MAX_ENTRIES) break;
    entries.delete(key);
  }
}

/**
 * Per-process cache. Concurrent callers share one in-flight load, and a failed load is not kept.
 * ponytail: in-memory only, so serverless instances each keep their own copy. Move to a shared
 * store if traffic ever makes upstream rate limits a problem.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  if (entries.size >= MAX_ENTRIES) makeRoom();
  const value = load();
  entries.delete(key);
  entries.set(key, { expires: Date.now() + ttlMs, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

export const cacheSize = () => entries.size;
