import { getWeather } from "@/domains/markets/gemini";
import { respond } from "@/lib/http";

export const GET = () => respond(async () => ({ markets: await getWeather() }));
