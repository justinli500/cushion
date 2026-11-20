import { bizQuote, fantasyQuote, heatQuote, portfolioQuote, teamQuote, type StakeQuote } from "@/domains/landing/quotes";
import { getAllPlayerProps, getGames, getLadders, getWeather } from "@/domains/markets/gemini";
import { respond } from "@/lib/http";
import { cached } from "@/lib/ttl-cache";

/** Each source fails on its own: a stake whose market is unavailable is left off the page. */
const attempt = async <T,>(load: () => Promise<T[]>): Promise<T[]> => load().catch(() => []);

async function quotes(): Promise<StakeQuote[]> {
  const [games, ladders, weather, props] = await Promise.all([attempt(getGames), attempt(getLadders), attempt(getWeather), attempt(getAllPlayerProps)]);
  return [teamQuote(games), portfolioQuote(ladders), heatQuote(ladders), fantasyQuote(props), bizQuote(weather)].filter((q): q is StakeQuote => q !== null);
}

/** GET /api/landing returns the landing page's example stakes, each priced from Gemini's live quotes. */
export const GET = () => respond(async () => ({ quotes: await cached("landing:quotes", 30_000, quotes) }));
