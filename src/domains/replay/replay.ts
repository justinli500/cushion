import { z } from "zod";
import { trustedImage } from "@/domains/markets/normalise";
import type { Book, Candle, Game, TeamSide } from "@/domains/markets/types";
import { mergeHistory, type OddsPoint } from "@/domains/scores/series";
import type { Play, Score } from "@/domains/scores/types";

const tradeSchema = z.object({ t: z.number(), price: z.number(), size: z.number() });
const teamSchema = z.object({
  abbr: z.string(),
  name: z.string(),
  score: z.number(),
  symbol: z.string(),
  logo: z.string().optional(),
  trades: z.array(tradeSchema),
});

/** A finished game as scripts/capture-replay.mjs saved it: ESPN's plays and Gemini's real trades. */
export const replaySchema = z.object({
  id: z.string(),
  league: z.string(),
  eventTicker: z.string(),
  capturedAt: z.string(),
  final: z.boolean(),
  /** Gemini's picture for the game's sport. */
  image: z.string().optional(),
  /**
   * A video of the game. A stream that ran live gives `startedAt`, when it began, so its timeline is the game's.
   * A highlights reel gives `sync`: pairs of a second of the video and the moment of the game on screen then.
   */
  video: z
    .object({
      youtubeId: z.string().regex(/^[\w-]{6,20}$/),
      startedAt: z.string().optional(),
      sync: z.array(z.tuple([z.number(), z.number()])).min(2).optional(),
      by: z.string(),
    })
    .refine((video) => video.startedAt != null || video.sync != null)
    .optional(),
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
        /** Where the play began and ended. See `PlayField`. Absent in a game saved before this was recorded. */
        field: z
          .object({
            possession: z.string().nullable(),
            from: z.number(),
            to: z.number(),
            down: z.number().nullable(),
            distance: z.number(),
            situation: z.string().nullable(),
            kind: z.string(),
            yards: z.number(),
          })
          .optional(),
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

type Trade = Replay["home"]["trades"][number];

/** How far the two teams' prices may be from adding up to 1 before a trade looks wrong. */
const MISPRINT_TOLERANCE = 0.25;

/**
 * Removes trades entered on the wrong contract. The two teams' prices should add up to about 1, so
 * a trade far from one minus the other team's price is set aside. If the other team's next trade
 * agrees with it, both sides have really moved and it is restored. If not, it was a misprint: in
 * the saved game, three trades at 16 cents on a team the other contract priced near 75.
 */
export function cleaned(replay: Replay): Replay {
  const merged = [
    ...replay.home.trades.map((trade) => ({ side: "home" as const, trade })),
    ...replay.away.trades.map((trade) => ({ side: "away" as const, trade })),
  ].sort((x, y) => x.trade.t - y.trade.t);

  const kept: Record<"home" | "away", Trade[]> = { home: [], away: [] };
  const setAside: Record<"home" | "away", Trade | null> = { home: null, away: null };
  const agrees = (price: number, other: number | undefined) => other == null || Math.abs(price + other - 1) <= MISPRINT_TOLERANCE;

  for (const { side, trade } of merged) {
    const other = side === "home" ? "away" : "home";
    const doubted = setAside[other];
    if (agrees(trade.price, kept[other][kept[other].length - 1]?.price)) {
      kept[side].push(trade);
      setAside[side] = null;
    } else if (doubted && agrees(trade.price, doubted.price)) {
      kept[other].push(doubted);
      kept[side].push(trade);
      setAside[other] = null;
    } else {
      setAside[side] = trade;
    }
  }
  return { ...replay, home: { ...replay.home, trades: kept.home }, away: { ...replay.away, trades: kept.away } };
}

export function replaySpan(replay: Replay): { start: number; end: number } {
  return { start: replay.plays[0].t - LEAD_IN_MS, end: replay.plays[replay.plays.length - 1].t + RUN_OUT_MS };
}

/**
 * Reads a value off the straight lines drawn through `points`, from one column to the other: a second of a
 * highlights reel to the moment of the game, or back. Past either end it holds the end. Where the reel holds
 * the game still, a moment of the game reads as the first second of the video that shows it.
 */
export function along(points: [number, number][], value: number, from: 0 | 1): number {
  const to = from === 0 ? 1 : 0;
  if (value <= points[0][from]) return points[0][to];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (value <= b[from] && b[from] > a[from]) return a[to] + ((value - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return points[points.length - 1][to];
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
  return {
    abbr: team.abbr,
    name: team.name,
    side: homeAway,
    // Gemini labels a team's contract with its city, and the saved game follows suit.
    contract: { symbol: team.symbol, label: team.name.split(" ").slice(0, -1).join(" ") || team.name, quote, open: true, image: trustedImage(team.logo) },
  };
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
    image: trustedImage(replay.image),
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
    .map((play, i) => ({ id: `${replay.id}-${i}`, text: play.text, clock: play.clock, period: periodName(play.period), scoringPlay: play.scoring, field: play.field }))
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

export interface Moment {
  label: string;
  /** When it happened, in the same clock as the plays. */
  t: number;
}

/** Kickoff, every score, and the final whistle: the points worth jumping to. */
export function moments(replay: Replay): Moment[] {
  const scores = replay.plays
    .filter((play) => play.scoring)
    .map((play) => ({ label: `${periodName(play.period)} ${play.clock} · ${replay.away.abbr} ${play.away}, ${replay.home.abbr} ${play.home}`, t: play.t }));
  const list: Moment[] = [{ label: "Kickoff", t: replay.plays[0].t }, ...scores];
  if (replay.final) list.push({ label: "Final", t: replaySpan(replay).end });
  return list;
}

/**
 * What a cushion bought earlier in the game would fetch now: each leg at the price its side could
 * be sold for at this moment. A side with no price yet is worth nothing.
 */
export function valueNow(legs: { symbol: string; side: "yes" | "no"; filled: number }[], game: Game): number {
  const total = legs.reduce((sum, leg) => {
    const quote = game.teams.find((team) => team.contract.symbol === leg.symbol)?.contract.quote;
    const price = !quote ? null : leg.side === "yes" ? quote.bid : quote.ask == null ? null : 1 - quote.ask;
    return sum + leg.filled * (price ?? 0);
  }, 0);
  return Math.round(total * 100) / 100;
}
