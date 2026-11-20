import type { PricePoint } from "@/domains/exposure/portfolio";
import { getHistory, isTicker } from "@/domains/prices/history";
import { badRequest, respond } from "@/lib/http";

/** GET /api/prices?symbols=BTC,XOM returns daily closes per symbol, or null where there is no history. */
export function GET(request: Request) {
  const symbols = [...new Set((new URL(request.url).searchParams.get("symbols") ?? "").split(",").filter(Boolean))];
  if (symbols.length === 0 || symbols.length > 30 || !symbols.every(isTicker)) return badRequest("Pass 1 to 30 ticker symbols.");
  return respond(async () => {
    const settled = await Promise.allSettled(symbols.map(getHistory));
    const history: Record<string, PricePoint[] | null> = {};
    settled.forEach((result, i) => {
      history[symbols[i]] = result.status === "fulfilled" ? result.value : null;
    });
    return { history };
  });
}
