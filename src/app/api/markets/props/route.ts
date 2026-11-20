import { groupPlayers, type PlayerEntry } from "@/domains/exposure/fantasy";
import { withAthletes } from "@/domains/exposure/fantasy-roster";
import { getAllPlayerProps, getGames } from "@/domains/markets/gemini";
import type { PlayerProp } from "@/domains/markets/types";
import { getAthletes, type AthleteIndex } from "@/domains/scores/athletes";
import { isLeague } from "@/domains/scores/types";
import { respond } from "@/lib/http";
import { cached } from "@/lib/ttl-cache";

const LEAGUES = new Set(["NFL", "NBA"]);
// Three days, so the weekend's games are on the list from Thursday night on.
const WINDOW_MS = 72 * 60 * 60 * 1000;
const CACHE_MS = 60_000;
// Positions and pictures are a nicety: the first request after a restart does not wait long for ESPN's rosters.
const ROSTER_WAIT_MS = 6_000;

/** ESPN's rosters for the leagues on the list. A league whose rosters are slow or unavailable is left out, and its players go without a position or picture. */
async function rosters(entries: PlayerEntry[]): Promise<Partial<Record<string, AthleteIndex>>> {
  const leagues = [...new Set(entries.map((e) => e.league))].filter(isLeague);
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), ROSTER_WAIT_MS));
  const loaded = await Promise.all(leagues.map((league) => Promise.race([getAthletes(league).catch(() => null), late])));
  return Object.fromEntries(leagues.flatMap((league, i) => (loaded[i] ? [[league, loaded[i]]] : [])));
}

async function loadPlayers(): Promise<PlayerEntry[]> {
  const [games, props] = await Promise.all([getGames(), getAllPlayerProps()]);
  const byGame = new Map<string, PlayerProp[]>();
  for (const prop of props) byGame.set(prop.gameId, [...(byGame.get(prop.gameId) ?? []), prop]);

  const until = Date.now() + WINDOW_MS;
  // getGames already drops games that started long enough ago to be finished.
  const upcoming = games.filter((g) => LEAGUES.has(g.league) && Date.parse(g.startTime) <= until);
  const entries = groupPlayers(upcoming.map((game) => ({ game, props: byGame.get(game.gameId) ?? [] })));
  return withAthletes(entries, await rosters(entries));
}

/** GET /api/markets/props lists every player with props for NFL and NBA games that are live or start soon. */
export const GET = () => respond(async () => ({ players: await cached("fantasy:players", CACHE_MS, loadPlayers) }));
