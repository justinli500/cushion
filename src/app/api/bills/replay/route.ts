import { z } from "zod";
import { billCushion, COVER_LEVELS } from "@/domains/exposure/bills";
import {
  dailySigma,
  dailyTicker,
  firstTradedPrice,
  replay,
  settledDates,
  toSettledDay,
  withReferences,
  type SettledDay,
} from "@/domains/exposure/bills-replay";
import { getCandles } from "@/domains/markets/gemini";
import { rawEventSchema } from "@/domains/markets/schemas";
import { badRequest, respond } from "@/lib/http";
import { cached } from "@/lib/ttl-cache";

const query = z.object({
  underlying: z.enum(["BRENT", "NGAS"]),
  dollarsPerPoint: z.coerce.number().positive().max(1_000_000),
});

// Five days to replay, plus the day before them, which only supplies the first opening price.
const DAYS = 6;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** A settled day ladder, or null when Gemini has no such event. Any other failure is an error. */
function getSettledDay(underlying: "BRENT" | "NGAS", date: string): Promise<SettledDay | null> {
  const ticker = dailyTicker(underlying, date);
  return cached(`bills-replay:${ticker}`, ONE_HOUR_MS, async () => {
    const res = await fetch(`https://api.gemini.com/v1/prediction-markets/events/${ticker}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Gemini event ${ticker} responded ${res.status}`);
    return toSettledDay(rawEventSchema.parse(await res.json()));
  });
}

/** GET /api/bills/replay?underlying=BRENT&dollarsPerPoint=1.2 replays both cover levels over the last settled days. */
export function GET(request: Request) {
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return badRequest("Pass underlying (BRENT or NGAS) and a dollarsPerPoint above 0.");
  const { underlying, dollarsPerPoint } = parsed.data;

  return respond(async () => {
    const fetched = await Promise.all(settledDates(Date.now(), DAYS).map((date) => getSettledDay(underlying, date)));
    const days = fetched.filter((d): d is SettledDay => d !== null);
    const inputs = withReferences(days);

    const symbols = new Set(
      inputs.flatMap((day) =>
        COVER_LEVELS.flatMap((level) =>
          billCushion({ ladder: day.ladder, spot: day.reference, level, dollarsPerPoint }).legs.map((l) => l.symbol),
        ),
      ),
    );
    // A contract whose candles cannot be read is priced by the model, and the day says so.
    const prices = await Promise.all(
      [...symbols].map(async (symbol) => [symbol, firstTradedPrice(await getCandles(symbol, "1hr").catch(() => []))] as const),
    );

    return replay(inputs, {
      dollarsPerPoint,
      sigma: dailySigma(days.map((d) => d.settle)),
      firstTrade: Object.fromEntries(prices),
    });
  });
}
