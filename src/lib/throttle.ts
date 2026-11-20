const MAX_TRACKED = 1000;

/**
 * A per-client request limit, per minute. The counts live in this process only, so on serverless
 * the real ceiling is `maxPerMinute` per running instance.
 */
export function throttle(maxPerMinute: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (request: Request): boolean => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const now = Date.now();
    const entry = hits.get(ip);
    if (entry && entry.resetAt > now) return ++entry.count > maxPerMinute;
    if (!entry && hits.size >= MAX_TRACKED) hits.delete(hits.keys().next().value!);
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  };
}

export const tooMany = (message: string) => Response.json({ error: message }, { status: 429 });
