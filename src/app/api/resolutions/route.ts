import { getResolutions } from "@/domains/markets/gemini";
import { badRequest, respond } from "@/lib/http";

const TICKER = /^[A-Z0-9-]{3,60}$/;

/** GET /api/resolutions?events=BTC2611202200 returns the settled side of each resolved contract. */
export function GET(request: Request) {
  const tickers = [...new Set((new URL(request.url).searchParams.get("events") ?? "").split(",").filter(Boolean))];
  if (tickers.length === 0 || tickers.length > 20 || !tickers.every((t) => TICKER.test(t))) {
    return badRequest("Pass 1 to 20 event tickers.");
  }
  return respond(async () => {
    const settled = await Promise.allSettled(tickers.map(getResolutions));
    const resolutions = Object.assign({}, ...settled.map((r) => (r.status === "fulfilled" ? r.value : {})));
    return { resolutions: resolutions as Record<string, "yes" | "no"> };
  });
}
