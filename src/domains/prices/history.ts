import { z } from "zod";
import type { PricePoint } from "@/domains/exposure/portfolio";
import { candlesResponseSchema } from "@/domains/markets/schemas";
import { isUnderlyingId, UNDERLYINGS } from "@/domains/markets/types";
import { cached } from "@/lib/ttl-cache";

const SIX_HOURS = 6 * 60 * 60 * 1000;
const DAYS = 200;

export const isTicker = (value: string) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(value);

// Names the app uses for indexes, and the symbol Yahoo lists each under.
const INDEXES: Record<string, string> = { SPX: "^GSPC", NDX: "^NDX" };

// Coins people commonly hold that Yahoo lists as SYMBOL-USD. A bare symbol would hit an unrelated stock.
const COINS = new Set(["DOGE", "ADA", "AVAX", "LINK", "BNB", "LTC", "DOT", "SHIB", "SUI", "TON", "TRX", "BCH", "UNI", "AAVE", "PEPE", "NEAR"]);

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function geminiDaily(spot: string): Promise<PricePoint[]> {
  const res = await fetch(`https://api.gemini.com/v2/candles/${spot}/1day`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gemini daily candles for ${spot} responded ${res.status}`);
  return candlesResponseSchema
    .parse(await res.json())
    .map(([time, , , , close]) => ({ date: day(time), close }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAYS);
}

const yahooSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          timestamp: z.array(z.number()),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()) })) }),
        }),
      )
      .nullable(),
  }),
});

// ponytail: Yahoo's chart endpoint is unofficial and keyless. A holding it cannot price is reported
// as "no history" instead of failing the page. Swap in a licensed feed if this goes past a demo.
async function yahooDaily(symbol: string): Promise<PricePoint[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const parsed = yahooSchema.safeParse(await res.json());
  const result = parsed.success ? parsed.data.chart.result?.[0] : null;
  if (!result) return null;
  const closes = result.indicators.quote[0]?.close ?? [];
  const points = result.timestamp.flatMap((seconds, i) => {
    const close = closes[i];
    return close == null ? [] : [{ date: day(seconds * 1000), close }];
  });
  return points.slice(-DAYS);
}

/** Daily closes, oldest first, or null when no history exists for the symbol. */
export function getHistory(symbol: string): Promise<PricePoint[] | null> {
  return cached(`history:${symbol}`, SIX_HOURS, async () => {
    if (isUnderlyingId(symbol)) {
      const { spot, yahoo } = UNDERLYINGS[symbol];
      if (spot) return geminiDaily(spot);
      return yahoo ? yahooDaily(yahoo) : null;
    }
    if (INDEXES[symbol]) return yahooDaily(INDEXES[symbol]);
    if (COINS.has(symbol)) return yahooDaily(`${symbol}-USD`);
    return (await yahooDaily(symbol)) ?? yahooDaily(`${symbol}-USD`);
  });
}
