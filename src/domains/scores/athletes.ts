import { z } from "zod";
import { trustedImage } from "@/domains/markets/normalise";
import { cached } from "@/lib/ttl-cache";
import { LEAGUE_PATHS, type League } from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
// Rosters are fetched a few teams at a time so a league's worth of requests does not land on ESPN at once.
const BATCH = 8;

/** A player as ESPN's team roster lists them. */
export interface Athlete {
  name: string;
  /** "QB", "RB", "WR", "TE" for football; "G", "F", "C" for basketball. */
  position: string | null;
  /** A picture on ESPN's image host, or null. */
  headshot: string | null;
  /** The team's abbreviation, e.g. "ATL". */
  team: string;
  /** Where the team plays, e.g. "Atlanta", to tell apart two players with one name. */
  place: string;
}

/** Athletes by `athleteKey`. Two players can share a name, so each key holds a list. */
export type AthleteIndex = Record<string, Athlete[]>;

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** "D.J. Moore", "DJ Moore" and "Marvin Harrison Jr." against "Marvin Harrison" are the same people. */
export const athleteKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .split(/[\s-]+/)
    .filter((word) => word && !SUFFIXES.has(word))
    .join(" ");

const athleteSchema = z.object({
  fullName: z.string(),
  position: z.object({ abbreviation: z.string() }).optional(),
  headshot: z.object({ href: z.string() }).optional(),
});
const rosterSchema = z.object({
  team: z.object({ abbreviation: z.string(), location: z.string().default("") }),
  athletes: z.array(z.unknown()),
});
const groupSchema = z.object({ items: z.array(z.unknown()) });
const teamsSchema = z.object({
  sports: z.array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: z.object({ id: z.string() }) })) })).min(1) })).min(1),
});

/** One team's players. Football groups them by unit (offense, defense); basketball lists them flat. An entry that does not parse is skipped. */
export function parseRoster(body: unknown): Athlete[] {
  const { team, athletes } = rosterSchema.parse(body);
  return athletes
    .flatMap((raw) => {
      const group = groupSchema.safeParse(raw);
      return group.success ? group.data.items : [raw];
    })
    .flatMap((raw) => {
      const athlete = athleteSchema.safeParse(raw);
      if (!athlete.success) return [];
      const { fullName, position, headshot } = athlete.data;
      return [{ name: fullName, position: position?.abbreviation ?? null, headshot: trustedImage(headshot?.href) ?? null, team: team.abbreviation, place: team.location }];
    });
}

export function indexAthletes(athletes: Athlete[]): AthleteIndex {
  const index: AthleteIndex = {};
  for (const athlete of athletes) (index[athleteKey(athlete.name)] ??= []).push(athlete);
  return index;
}

/** The athlete with this name. When two share it, the one whose team is playing in `gameTitle` ("Miami vs Buffalo"). */
export function findAthlete(index: AthleteIndex, name: string, gameTitle: string): Athlete | null {
  const matches = index[athleteKey(name)] ?? [];
  return matches.find((a) => a.place !== "" && gameTitle.includes(a.place)) ?? matches[0] ?? null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`ESPN ${url} responded ${res.status}`);
  return res.json();
}

/** Every rostered player in a league, from ESPN's team rosters. A team that fails to load is left out. */
export function getAthletes(league: League): Promise<AthleteIndex> {
  return cached(`espn:athletes:${league}`, HALF_DAY_MS, async () => {
    const root = `${BASE}/${LEAGUE_PATHS[league]}/teams`;
    const ids = teamsSchema.parse(await getJson(`${root}?limit=1000`)).sports[0].leagues[0].teams.map((t) => t.team.id);
    const athletes: Athlete[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const rosters = await Promise.allSettled(ids.slice(i, i + BATCH).map(async (id) => parseRoster(await getJson(`${root}/${id}/roster`))));
      for (const roster of rosters) if (roster.status === "fulfilled") athletes.push(...roster.value);
    }
    if (athletes.length === 0) throw new Error(`ESPN returned no rosters for ${league}`);
    return indexAthletes(athletes);
  });
}
