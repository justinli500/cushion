import { cached } from "@/lib/ttl-cache";
import { parseScoreboard, parseSummary } from "./parse";
import { LEAGUE_PATHS, type League, type Play, type Score } from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const TIMEOUT_MS = 8_000;
// A college scoreboard lists only a handful of featured games unless asked for every Division I game.
const BOARD_QUERY: Partial<Record<League, string>> = {
  NCAAM: "?groups=50&limit=400",
  NCAAF: "?groups=80&limit=400",
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ESPN ${url} responded ${res.status}`);
  return res.json();
}

export function getScoreboard(league: League): Promise<Score[]> {
  return cached(`espn:board:${league}`, 8_000, async () =>
    parseScoreboard(await getJson(`${BASE}/${LEAGUE_PATHS[league]}/scoreboard${BOARD_QUERY[league] ?? ""}`)),
  );
}

export function getSummary(league: League, espnId: string): Promise<{ score: Score; plays: Play[] }> {
  return cached(`espn:summary:${league}:${espnId}`, 6_000, async () =>
    parseSummary(await getJson(`${BASE}/${LEAGUE_PATHS[league]}/summary?event=${espnId}`)),
  );
}

/** Scores for several leagues. A league ESPN fails to answer for is left out, unless every one fails. */
export async function getScores(leagues: League[]): Promise<Score[]> {
  const results = await Promise.allSettled(leagues.map(getScoreboard));
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (ok.length === 0) throw new Error("ESPN scoreboards are unavailable");
  return ok.flat();
}
