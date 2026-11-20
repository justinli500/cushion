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

/**
 * Where a football play began and ended, and what the offense faces next. Positions are yards
 * from the home team's goal line, 0 to 100, so the home team attacks toward 100.
 */
export interface PlayField {
  /** The team with the ball after the play, as an abbreviation. */
  possession: string | null;
  from: number;
  to: number;
  /** The down to come, 1 to 4, or null between series: after a score, before a kickoff. */
  down: number | null;
  /** Yards needed for a first down. */
  distance: number;
  /** "2nd & 7 at HOU 36", as ESPN words it. Null between series. */
  situation: string | null;
  /** ESPN's name for the play: "Rush", "Pass Reception", "Punt". */
  kind: string;
  yards: number;
}

export interface Play {
  id: string;
  text: string;
  clock: string;
  period: string;
  scoringPlay: boolean;
  /** Football only. */
  field?: PlayField;
}
