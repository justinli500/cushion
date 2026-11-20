import { getGames } from "@/domains/markets/gemini";
import { respond } from "@/lib/http";

export const GET = () => respond(async () => ({ games: await getGames() }));
