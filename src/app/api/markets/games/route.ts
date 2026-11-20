import { getGames } from "@/domains/markets/gemini";
import { withOfficialLogos } from "@/domains/scores/logos";
import { respond } from "@/lib/http";

export const GET = () => respond(async () => ({ games: await withOfficialLogos(await getGames()) }));
