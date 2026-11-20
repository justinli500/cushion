import { z } from "zod";
import type { Book, Candle, Game, TeamSide } from "@/domains/markets/types";
import { mergeHistory, type OddsPoint } from "@/domains/scores/series";
import type { Play, Score } from "@/domains/scores/types";

const tradeSchema = z.object({ t: z.number(), price: z.number(), size: z.number() });
const teamSchema = z.object({ abbr: z.string(), name: z.string(), score: z.number(), symbol: z.string(), trades: z.array(tradeSchema) });

/** A finished game as scripts/capture-replay.mjs saved it: ESPN's plays and Gemini's real trades. */
export const replaySchema = z.object({
  id: z.string(),
  league: z.string(),
  eventTicker: z.string(),
  capturedAt: z.string(),
  final: z.boolean(),
  home: teamSchema,
  away: teamSchema,
  plays: z
    .array(
      z.object({
        t: z.number(),
        period: z.number(),
        clock: z.string(),
        text: z.string(),
        home: z.number(),
        away: z.number(),
        scoring: z.boolean(),
        homeWinProb: z.number().nullable(),
      }),
    )
    .min(1),
});

export type Replay = z.infer<typeof replaySchema>;

const MINUTE = 60_000;
/** The replay opens a little before kickoff, so the pre-game price is on screen first. */
const LEAD_IN_MS = 3 * MINUTE;
const RUN_OUT_MS = 1 * MINUTE;
/** The chart reaches back before kickoff so the run-up shows. */
const CHART_LEAD_MS = 90 * MINUTE;
/** Replay prices have no real order book behind them, so the last trade gets a fixed, stated spread. */
export const REPLAY_SPREAD = 0.01;
const REPLAY_DEPTH = 1_000;

const ORDINALS = ["1st", "2nd", "3rd", "4th"];
const periodName = (period: number) => ORDINALS[period - 1] ?? "OT";

export function replaySpan(replay: Replay): { start: number; end: number } {
  return { start: replay.plays[0].t - LEAD_IN_MS, end: replay.plays[replay.plays.length - 1].t + RUN_OUT_MS };
}

/** The last traded price at or before `at`, or null if the contract had not traded yet. */
function priceAt(trades: Replay["home"]["trades"], at: number): number | null {
  let price: number | null = null;
  for (const trade of trades) {
    if (trade.t > at) break;
    price = trade.price;
  }
  return price;
}

const clamp = (p: number) => Math.min(0.99, Math.max(0.01, Math.round(p * 100) / 100));

function side(team: Replay["home"], homeAway: "home" | "away", at: number): TeamSide {
  const last = priceAt(team.trades, at);
  const quote = last == null ? { bid: null, ask: null, last: null } : { bid: clamp(last - REPLAY_SPREAD), ask: clamp(last + REPLAY_SPREAD), last };
  return { abbr: team.abbr, name: team.name, side: homeAway, contract: { symbol: team.symbol, label: team.name, quote, open: true } };
}

export interface ReplayFrame {
  game: Game;
  score: Score;
  /** Newest first. */
  plays: Play[];
  points: OddsPoint[];
  /** True once the replay has reached the end of a game that finished. */
  over: boolean;
  /** The side that won, known only once the replay is over. */
  winner: "home" | "away" | null;
}

/** Everything the game screen needs at one moment of the replay. `at` is a time during the real game. */
export function frameAt(replay: Replay, at: number): ReplayFrame {
  const { start, end } = replaySpan(replay);
  const kickoff = replay.plays[0].t;
  const seen = replay.plays.filter((play) => play.t <= at);
  const latest = seen[seen.length - 1];
  const over = replay.final && at >= end;
  const live = latest != null && !over;

  const toCandles = (trades: Replay["home"]["trades"]): Candle[] =>
    trades.filter((trade) => trade.t <= at).map((trade) => ({ time: trade.t, close: trade.price, volume: trade.size }));
  const points = mergeHistory(toCandles(replay.home.trades), toCandles(replay.away.trades), kickoff - CHART_LEAD_MS);

  const game: Game = {
    kind: "game",
    gameId: replay.id,
    eventTicker: replay.eventTicker,
    league: replay.league,
    title: `${replay.away.name} at ${replay.home.name}`,
    startTime: new Date(kickoff).toISOString(),
    expiry: new Date(end).toISOString(),
    isLive: live,
    teams: [side(replay.home, "home", at), side(replay.away, "away", at)],
    hasDraw: false,
    volume: 0,
  };

  const score: Score = {
    espnId: replay.id,
    state: over ? "final" : latest ? "live" : "pre",
    clock: live ? latest.clock : "",
    period: over ? "Final" : latest ? periodName(latest.period) : "",
    startTime: game.startTime,
    home: { abbr: replay.home.abbr, name: replay.home.name, score: over ? replay.home.score : (latest?.home ?? 0) },
    away: { abbr: replay.away.abbr, name: replay.away.name, score: over ? replay.away.score : (latest?.away ?? 0) },
  };

  const plays: Play[] = seen
    .map((play, i) => ({ id: `${replay.id}-${i}`, text: play.text, clock: play.clock, period: periodName(play.period), scoringPlay: play.scoring }))
    .reverse();

  const winner = !over || replay.home.score === replay.away.score ? null : replay.home.score > replay.away.score ? "home" : "away";
  return { game, score, plays, points, over, winner: at < start ? null : winner };
}

/** A one-level book at the replay's quote: what a cushion bought during the replay is filled against. */
export function replayBooks(game: Game): Record<string, Book> {
  return Object.fromEntries(
    game.teams.map((team) => {
      const { bid, ask } = team.contract.quote;
      return [
        team.contract.symbol,
        { bids: bid == null ? [] : [{ price: bid, size: REPLAY_DEPTH }], asks: ask == null ? [] : [{ price: ask, size: REPLAY_DEPTH }] },
      ];
    }),
  );
}

/** How each team's winner contract resolved, for settling cushions bought during the replay. */
export function replayResolutions(replay: Replay): Record<string, "yes" | "no"> | null {
  if (!replay.final || replay.home.score === replay.away.score) return null;
  const homeWon = replay.home.score > replay.away.score;
  return { [replay.home.symbol]: homeWon ? "yes" : "no", [replay.away.symbol]: homeWon ? "no" : "yes" };
}
