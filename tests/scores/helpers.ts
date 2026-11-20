import { readFileSync } from "node:fs";
import type { Game, Quote, TeamSide } from "@/domains/markets/types";
import type { Score } from "@/domains/scores/types";

export const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

const quote = (last: number | null = null, bid: number | null = null, ask: number | null = null): Quote => ({ bid, ask, last });

export function team(abbr: string, name: string, side: "home" | "away", q: Quote = quote(0.5, 0.49, 0.51), label = name.split(" ")[0]): TeamSide {
  return { abbr, name, side, contract: { symbol: `GEMI-T-${abbr}`, label, quote: q, open: true } };
}

export function game(over: Partial<Game> & { teams?: TeamSide[] } = {}): Game {
  return {
    kind: "game",
    gameId: "g1",
    eventTicker: "NFL-2611200115-IND-HOU-M",
    league: "NFL",
    title: "Indianapolis vs Houston",
    startTime: "2026-11-20T01:15:00.000Z",
    expiry: "2026-11-22T01:15:00.000Z",
    isLive: true,
    teams: [team("HOU", "Houston Texans", "home"), team("IND", "Indianapolis Colts", "away")],
    hasDraw: false,
    volume: 1000,
    ...over,
  };
}

export function score(over: Partial<Score> = {}): Score {
  return {
    espnId: "1",
    state: "live",
    clock: "7:31",
    period: "2nd",
    startTime: "2026-11-20T01:15Z",
    home: { abbr: "HOU", name: "Houston Texans", score: 14 },
    away: { abbr: "IND", name: "Indianapolis Colts", score: 3 },
    ...over,
  };
}
