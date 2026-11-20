import { z } from "zod";
import type { Play, PlayField, Score } from "./types";

const MAX_PLAYS = 60;

const competitionSchema = z.object({
  status: z.object({ type: z.object({ state: z.enum(["pre", "in", "post"]), shortDetail: z.string().default("") }) }),
  competitors: z.array(
    z.object({
      homeAway: z.enum(["home", "away"]),
      score: z.string().optional(),
      team: z.object({ id: z.string().optional(), abbreviation: z.string(), displayName: z.string() }),
    }),
  ),
});

const scoreboardSchema = z.object({ events: z.array(z.unknown()) });
const eventSchema = z.object({ id: z.string(), date: z.string(), competitions: z.array(competitionSchema).min(1) });

const summarySchema = z.object({
  header: z.object({ id: z.string(), competitions: z.array(competitionSchema.extend({ date: z.string() })).min(1) }),
  plays: z.array(z.unknown()).optional(),
  drives: z
    .object({
      previous: z.array(z.object({ plays: z.array(z.unknown()).default([]) })).default([]),
      current: z.object({ plays: z.array(z.unknown()).default([]) }).optional(),
    })
    .optional(),
});

/** One end of a football play. */
const spotSchema = z.object({
  down: z.number().optional(),
  distance: z.number().optional(),
  yardLine: z.number().optional(),
  downDistanceText: z.string().optional(),
  team: z.object({ id: z.string() }).optional(),
});

const playSchema = z.object({
  start: spotSchema.optional(),
  end: spotSchema.optional(),
  statYardage: z.number().optional(),
  id: z.string(),
  text: z.string().default(""),
  clock: z.object({ displayValue: z.string() }).optional(),
  period: z.object({ number: z.number(), displayValue: z.string().optional() }).optional(),
  scoringPlay: z.boolean().default(false),
  type: z.object({ text: z.string().optional() }).optional(),
});

const STATES = { pre: "pre", in: "live", post: "final" } as const;

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

function toScore(espnId: string, startTime: string, competition: z.infer<typeof competitionSchema>): Score | null {
  const home = competition.competitors.find((c) => c.homeAway === "home");
  const away = competition.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  const { state, shortDetail } = competition.status.type;
  // ESPN writes live status as "7:31 - 2nd" and between-play status as "Halftime" or "End of 2nd".
  const [clock, period] = state === "in" ? (shortDetail.includes(" - ") ? shortDetail.split(" - ") : ["", shortDetail]) : ["", state === "post" ? shortDetail : ""];
  const side = (c: typeof home) => ({ abbr: c.team.abbreviation, name: c.team.displayName, score: Number(c.score) || 0 });
  return { espnId, state: STATES[state], clock, period, startTime, home: side(home), away: side(away) };
}

/** Events that do not parse are dropped so one odd game cannot hide the rest of the board. */
export function parseScoreboard(json: unknown): Score[] {
  return scoreboardSchema.parse(json).events.flatMap((raw) => {
    const event = eventSchema.safeParse(raw);
    const score = event.success ? toScore(event.data.id, event.data.date, event.data.competitions[0]) : null;
    return score ? [score] : [];
  });
}

/** Only football plays carry yard lines, so every other sport gets no field. */
function toField({ start, end, type, statYardage }: z.infer<typeof playSchema>, abbrOf: Map<string, string>): PlayField | undefined {
  if (start?.yardLine == null || end?.yardLine == null || !type?.text) return undefined;
  const down = end.down != null && end.down >= 1 && end.down <= 4 ? end.down : null;
  return {
    possession: abbrOf.get(end.team?.id ?? "") ?? null,
    from: start.yardLine,
    to: end.yardLine,
    down,
    distance: end.distance ?? 0,
    situation: down ? (end.downDistanceText?.trim() ?? null) : null,
    kind: type.text,
    yards: statYardage ?? 0,
  };
}

function toPlay(raw: unknown, abbrOf: Map<string, string>): Play[] {
  const parsed = playSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.text) return [];
  const { id, text, clock, period, scoringPlay, type } = parsed.data;
  // Faceoffs are most of a hockey feed and tell a viewer nothing.
  if (type?.text === "Face Off") return [];
  const field = toField(parsed.data, abbrOf);
  return [{ id, text, clock: clock?.displayValue ?? "", period: period ? (period.displayValue ?? ordinal(period.number)) : "", scoringPlay, ...(field ? { field } : {}) }];
}

/** The score for one game plus its plays, newest first. Football lists plays under drives. */
export function parseSummary(json: unknown): { score: Score; plays: Play[] } {
  const { header, plays, drives } = summarySchema.parse(json);
  const competition = header.competitions[0];
  const score = toScore(header.id, competition.date, competition);
  if (!score) throw new Error("ESPN summary has no home and away team");
  const chronological = plays ?? [...(drives?.previous ?? []), ...(drives?.current ? [drives.current] : [])].flatMap((d) => d.plays);
  // The drive in progress is listed under both `previous` and `current`.
  const abbrOf = new Map(competition.competitors.flatMap((c) => (c.team.id ? [[c.team.id, c.team.abbreviation] as const] : [])));
  const unique = [...new Map(chronological.flatMap((raw) => toPlay(raw, abbrOf)).map((p) => [p.id, p])).values()];
  return { score, plays: unique.reverse().slice(0, MAX_PLAYS) };
}
