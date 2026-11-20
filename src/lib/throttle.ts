const MAX_TRACKED = 1000;
const WINDOW_MS = 60_000;

/**
 * Who is calling, for rate limiting. Proxy headers are only believed on Vercel, which overwrites
 * them with the address it saw. Anywhere else a caller can set them to anything, so every request
 * is counted as one client: a local or self-hosted run gets a single shared limit instead of one
 * that can be reset by inventing an address.
 */
export function clientAddress(request: Request): string {
  if (!process.env.VERCEL) return "local";
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  return hops[hops.length - 1]?.trim() || "unknown";
}

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * A request limit per minute, per client and for everyone together. The total is what bounds a
 * route that spends something (model tokens, network fees) against a caller with many addresses.
 * The counts live in this process only, so on serverless each running instance has its own.
 */
export function throttle(perClient: number, total = perClient * 10) {
  const clients = new Map<string, Counter>();
  // Kept apart from the per-client map so a flood of new clients can never evict it.
  let everyone: Counter = { count: 0, resetAt: 0 };

  return (request: Request): boolean => {
    const now = Date.now();
    const key = clientAddress(request);
    const mine = clients.get(key);
    if (mine && mine.resetAt > now) {
      if (++mine.count > perClient) return true;
    } else {
      if (!mine && clients.size >= MAX_TRACKED) clients.delete(clients.keys().next().value!);
      clients.set(key, { count: 1, resetAt: now + WINDOW_MS });
    }
    // Only requests within their own limit count toward the total, so one client hammering the
    // route is turned away on its own and cannot use up everyone else's share.
    if (everyone.resetAt <= now) everyone = { count: 0, resetAt: now + WINDOW_MS };
    return ++everyone.count > total;
  };
}

export const tooMany = (message: string) => Response.json({ error: message }, { status: 429 });
