import { getEventMarkets } from "@/domains/markets/gemini";
import { respond } from "@/lib/http";

/** GET /api/markets/events lists Gemini's news-event markets (economics, politics, business, tech, culture), most traded first. */
export const GET = () => respond(async () => ({ markets: await getEventMarkets() }));
