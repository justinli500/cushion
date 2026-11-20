import type { Play, PlayField } from "./types";

/** Plays that stop the clock without moving the ball: the field keeps showing the play before them. */
const STOPPAGE = /timeout|two-minute|end (of )?(period|quarter|half|game)|coin toss/i;

export interface FieldNow extends PlayField {
  text: string;
  scoring: boolean;
}

/** The latest play that moved or placed the ball. `plays` is newest first. Null for a sport with no field. */
export function fieldNow(plays: Play[]): FieldNow | null {
  const play = plays.find((p) => p.field && !STOPPAGE.test(p.field.kind));
  return play?.field ? { ...play.field, text: play.text.trim(), scoring: play.scoringPlay } : null;
}

/** The yard line the offense must reach for a first down, or null when it is goal to go or between series. */
export function firstDownLine(field: PlayField, homeAbbr: string): number | null {
  if (field.down == null || field.possession == null || field.distance <= 0) return null;
  // Positions count from the home team's goal line, so the home team gains ground upward.
  const line = field.possession === homeAbbr ? field.to + field.distance : field.to - field.distance;
  return line > 0 && line < 100 ? line : null;
}

/** A scoring play in one or two words, or null for any other play. */
export function scoreWord(kind: string): string | null {
  if (/touchdown/i.test(kind)) return "Touchdown";
  if (/field goal good/i.test(kind)) return "Field goal";
  if (/safety/i.test(kind)) return "Safety";
  return null;
}
