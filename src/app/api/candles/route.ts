import { getCandles, isSymbol, type Timeframe } from "@/domains/markets/gemini";
import { badRequest, respond } from "@/lib/http";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1hr", "1day"];

/** GET /api/candles?symbol=GEMI-...&tf=5m returns traded prices, oldest first. Sparse: most candles have no volume. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") ?? "";
  const timeframe = (params.get("tf") ?? "5m") as Timeframe;
  if (!isSymbol(symbol) || !TIMEFRAMES.includes(timeframe)) return badRequest("Pass a contract symbol and a timeframe.");
  return respond(async () => ({ candles: await getCandles(symbol, timeframe) }));
}
