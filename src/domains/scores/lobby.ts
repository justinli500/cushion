import type { Game } from "@/domains/markets/types";
import { matchScore } from "./match";
import { LEAGUE_PATHS, type Score } from "./types";

export interface LobbyRow {
  game: Game;
  /** ESPN's score for the game, or null when none matched. A row without one still shows its market. */
  score: Score | null;
}

export interface Lobby {
  pinned: LobbyRow[];
  live: LobbyRow[];
  later: LobbyRow[];
  done: LobbyRow[];
  /** Games left out by the per-league cap. */
  hidden: number;
  leagues: { league: string; count: number }[];
}

export interface LobbyOptions {
  /** A league such as "NBA", or "all". */
  league: string;
  expanded: boolean;
  /** The team the person roots for. */
  team: { league: string; abbr: string } | null;
}

const PER_LEAGUE = 4;
const PER_LEAGUE_FILTERED = 12;

const byVolume = (a: LobbyRow, b: LobbyRow) => b.game.volume - a.game.volume;
const byStart = (a: LobbyRow, b: LobbyRow) => Date.parse(a.game.startTime) - Date.parse(b.game.startTime);

/** Keeps the first `cap` rows of each league. Rows arrive most traded first, so the busiest games survive. */
function capPerLeague(rows: LobbyRow[], cap: number): LobbyRow[] {
  const seen = new Map<string, number>();
  return rows.filter((row) => {
    const n = (seen.get(row.game.league) ?? 0) + 1;
    seen.set(row.game.league, n);
    return n <= cap;
  });
}

/** Sorts games into the groups the list shows. ESPN decides whether a game has started when it has a score for it. */
export function buildLobby(games: Game[], scores: Score[], { league, expanded, team }: LobbyOptions): Lobby {
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.league, (counts.get(g.league) ?? 0) + 1);
  const known = Object.keys(LEAGUE_PATHS);
  const rank = (name: string) => (known.includes(name) ? known.indexOf(name) : known.length);
  const leagues = [...counts].map(([name, count]) => ({ league: name, count })).sort((a, b) => rank(a.league) - rank(b.league) || a.league.localeCompare(b.league));

  const rows = games
    .filter((g) => league === "all" || g.league === league)
    .map((game): LobbyRow => ({ game, score: matchScore(game, scores) }));

  const mine = (row: LobbyRow) => team != null && row.game.league === team.league && row.game.teams.some((t) => t.abbr === team.abbr);
  const rest = rows.filter((r) => !mine(r));
  const state = (r: LobbyRow) => r.score?.state ?? (r.game.isLive ? "live" : "pre");
  const group = (wanted: string) => rest.filter((r) => state(r) === wanted).sort(byVolume);

  const cap = expanded ? Infinity : league === "all" ? PER_LEAGUE : PER_LEAGUE_FILTERED;
  const [live, later, done] = [group("live"), group("pre"), group("final")].map((g) => capPerLeague(g, cap));
  return {
    pinned: rows.filter(mine).sort(byStart),
    live,
    later,
    done,
    hidden: rest.length - live.length - later.length - done.length,
    leagues,
  };
}
