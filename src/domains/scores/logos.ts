import { z } from "zod";
import type { Game } from "@/domains/markets/types";
import { cached } from "@/lib/ttl-cache";
import { isLeague, LEAGUE_PATHS, type League } from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_IMAGES = "https://a.espncdn.com/";
const DAY_MS = 24 * 60 * 60 * 1000;

const teamsSchema = z.object({
  sports: z
    .array(
      z.object({
        leagues: z
          .array(z.object({ teams: z.array(z.object({ team: z.object({ displayName: z.string(), logos: z.array(z.object({ href: z.string() })).optional() }) })) }))
          .min(1),
      }),
    )
    .min(1),
});

/** "Louisiana Ragin' Cajuns" and "louisiana ragin cajuns" are the same team. */
export const teamKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Official logos by team name, from ESPN's team list. Only URLs on ESPN's own image host are kept. */
export function parseLogos(body: unknown): Record<string, string> {
  const { teams } = teamsSchema.parse(body).sports[0].leagues[0];
  const logos: Record<string, string> = {};
  for (const { team } of teams) {
    const href = team.logos?.[0]?.href;
    if (href?.startsWith(ESPN_IMAGES)) logos[teamKey(team.displayName)] = href;
  }
  return logos;
}

function getLogos(league: League): Promise<Record<string, string>> {
  return cached(`espn:logos:${league}`, DAY_MS, async () => {
    const res = await fetch(`${BASE}/${LEAGUE_PATHS[league]}/teams?limit=1000`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`ESPN team list for ${league} responded ${res.status}`);
    return parseLogos(await res.json());
  });
}

/** Swaps in each team's official logo where ESPN lists the team by the same name. Others keep Gemini's picture. */
export function applyLogos(games: Game[], logos: Partial<Record<string, Record<string, string>>>): Game[] {
  return games.map((game) => {
    const league = logos[game.league];
    if (!league) return game;
    return {
      ...game,
      teams: game.teams.map((team) => {
        const logo = league[teamKey(team.name)];
        return logo ? { ...team, contract: { ...team.contract, image: logo } } : team;
      }),
    };
  });
}

/** Games with official team logos. A league whose logos cannot be fetched keeps Gemini's pictures. */
export async function withOfficialLogos(games: Game[]): Promise<Game[]> {
  const leagues = [...new Set(games.map((g) => g.league))].filter(isLeague);
  const settled = await Promise.allSettled(leagues.map(getLogos));
  const logos: Partial<Record<string, Record<string, string>>> = {};
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") logos[leagues[i]] = result.value;
  });
  return applyLogos(games, logos);
}
