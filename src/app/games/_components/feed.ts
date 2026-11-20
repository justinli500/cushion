import type { Book, Game } from "@/domains/markets/types";
import type { OddsPoint } from "@/domains/scores/series";
import type { Play, Score } from "@/domains/scores/types";

/** The controls and the play-money market of a game being replayed. */
export interface ReplayState {
  id: string;
  /** When the real game was played, as an ISO timestamp. */
  playedAt: string;
  playing: boolean;
  /** How many seconds of the game pass per second of replay. */
  speed: number;
  /** How far through the replay we are, from 0 to 1. */
  progress: number;
  over: boolean;
  /** False when the game was saved before it finished, so the replay stops where the recording does. */
  complete: boolean;
  books: Record<string, Book>;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  seek(progress: number): void;
}

/**
 * Everything the game screen draws. A live game and a replay both produce one, so the screen
 * does not know which it is showing.
 */
export interface GameFeed {
  /** "missing" is a game Gemini does not list. "error" is Gemini not answering. */
  load: "loading" | "ready" | "missing" | "error";
  error: string | null;
  /** True when the last refresh failed and what shows is the last good data. */
  stale: boolean;
  game: Game | null;
  /** Null when no ESPN game matched. The screen then shows the market alone and invents no score. */
  score: Score | null;
  /** Why `score` is null: still looking, no ESPN game for it, or ESPN not answering. */
  scoreStatus: "loading" | "matched" | "none" | "unavailable";
  plays: Play[];
  playsUnavailable: boolean;
  points: OddsPoint[];
  /** Null for a live game. */
  replay: ReplayState | null;
}
