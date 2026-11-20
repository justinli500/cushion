const MAX_TRACKED = 1000;

/**
 * The address the hosting platform saw, not one the caller can type. `x-real-ip` is set by the
 * platform. Failing that, the last `x-forwarded-for` hop is the one our own proxy appended; the
 * first is whatever the client claimed, so it is never used.
 */
export function clientAddress(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  return hops[hops.length - 1]?.trim() || "unknown";
}

/**
 * A request limit per minute, per client and for everyone together. The total is what protects a
 * route that spends something (model tokens, network fees) from a caller with many addresses.
 * The counts live in this process only, so on serverless each running instance has its own.
 */
export function throttle(perClient: number, total = perClient * 10) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const over = (key: string, limit: number): boolean => {
    const now = Date.now();
    const entry = hits.get(key);
    if (entry && entry.resetAt > now) return ++entry.count > limit;
    if (!entry && hits.size >= MAX_TRACKED) hits.delete(hits.keys().next().value!);
    hits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  };
  // Both are counted on every request, so a client that is turned away still uses up the total.
  return (request: Request): boolean => {
    const tooManyOverall = over("*", total);
    return over(`client:${clientAddress(request)}`, perClient) || tooManyOverall;
  };
}

export const tooMany = (message: string) => Response.json({ error: message }, { status: 429 });
