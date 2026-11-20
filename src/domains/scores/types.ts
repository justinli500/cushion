/** In the order the games list shows them. */
export const LEAGUE_PATHS = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  NHL: "hockey/nhl",
  NCAAF: "football/college-football",
  NCAAM: "basketball/mens-college-basketball",
} as const;

/** The Gemini `Game.league` values that have an ESPN feed. */
export type League = keyof typeof LEAGUE_PATHS;

export const isLeague = (value: string): value is League => Object.hasOwn(LEAGUE_PATHS, value);

export interface TeamScore {
  abbr: string;
  name: string;
  score: number;
}

/** One game as ESPN reports it. `clock` and `period` are empty until the game starts. */
export interface Score {
  espnId: string;
  state: "pre" | "live" | "final";
  /** Game clock such as "7:31". Empty at halftime, between periods and outside live play. */
  clock: string;
  /** "2nd", "Halftime", "End of 2nd", "Final", or empty before the start. */
  period: string;
  startTime: string;
  home: TeamScore;
  away: TeamScore;
}

export interface Play {
  id: string;
  text: string;
  clock: string;
  period: string;
  scoringPlay: boolean;
}
