interface Entry {
  expires: number;
  value: Promise<unknown>;
}

const entries = new Map<string, Entry>();

/**
 * Per-process cache. Concurrent callers share one in-flight load, and a failed load is not kept.
 * ponytail: in-memory only, so serverless instances each keep their own copy. Move to a shared
 * store if traffic ever makes upstream rate limits a problem.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, { expires: Date.now() + ttlMs, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}
