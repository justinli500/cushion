import { groupPlayers, type PlayerEntry } from "@/domains/exposure/fantasy";
import { getAllPlayerProps, getGames } from "@/domains/markets/gemini";
import type { PlayerProp } from "@/domains/markets/types";
import { respond } from "@/lib/http";
import { cached } from "@/lib/ttl-cache";

const LEAGUES = new Set(["NFL", "NBA"]);
// Three days, so the weekend's games are on the list from Thursday night on.
const WINDOW_MS = 72 * 60 * 60 * 1000;
const CACHE_MS = 60_000;

async function loadPlayers(): Promise<PlayerEntry[]> {
  const [games, props] = await Promise.all([getGames(), getAllPlayerProps()]);
  const byGame = new Map<string, PlayerProp[]>();
  for (const prop of props) byGame.set(prop.gameId, [...(byGame.get(prop.gameId) ?? []), prop]);

  const until = Date.now() + WINDOW_MS;
  // getGames already drops games that started long enough ago to be finished.
  const upcoming = games.filter((g) => LEAGUES.has(g.league) && Date.parse(g.startTime) <= until);
  return groupPlayers(upcoming.map((game) => ({ game, props: byGame.get(game.gameId) ?? [] })));
}

/** GET /api/markets/props lists every player with props for NFL and NBA games that are live or start soon. */
export const GET = () => respond(async () => ({ players: await cached("fantasy:players", CACHE_MS, loadPlayers) }));
