"use client";

import { useEffect, useMemo, useState } from "react";
import type { Candle, Game } from "@/domains/markets/types";
import { winChance } from "@/domains/scores/chance";
import { matchScore } from "@/domains/scores/match";
import { addLivePoint, mergeHistory, sinceFor, type OddsPoint } from "@/domains/scores/series";
import { isLeague, type Play, type Score } from "@/domains/scores/types";
import { usePoll } from "@/lib/use-poll";
import type { GameFeed } from "./feed";

const MARKET_MS = 4_000;
const BOARD_MS = 10_000;
const SUMMARY_MS = 5_000;
const HISTORY_MS = 60_000;
const MAX_LIVE_POINTS = 900;

const candlesUrl = (symbol: string, tf: "5m" | "1hr") => `/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`;

/** One team's traded prices: 5 minute candles, or hourly ones when the 5 minute series is empty. */
function useCandles(symbol: string | undefined): Candle[] {
  const fine = usePoll<{ candles: Candle[] }>(symbol ? candlesUrl(symbol, "5m") : null, HISTORY_MS);
  const coarse = usePoll<{ candles: Candle[] }>(symbol && fine.data?.candles.length === 0 ? candlesUrl(symbol, "1hr") : null, HISTORY_MS);
  return fine.data?.candles.length ? fine.data.candles : (coarse.data?.candles ?? []);
}

/** Polls a real game: its market every 4 seconds, ESPN for the score, and Gemini's traded history for the chart. */
export function useLiveGame(gameId: string): GameFeed {
  const market = usePoll<{ game: Game | null }>(`/api/markets/games/${encodeURIComponent(gameId)}`, MARKET_MS);
  const game = market.data?.game ?? null;

  const league = game && isLeague(game.league) ? game.league : null;
  const board = usePoll<{ scores: Score[] }>(league ? `/api/scores?league=${league}` : null, BOARD_MS);
  const matched = useMemo(() => (game && board.data ? matchScore(game, board.data.scores) : null), [game, board.data]);
  const final = matched?.state === "final";
  const summary = usePoll<{ score: Score; plays: Play[] }>(
    league && matched ? `/api/scores/${league}/${matched.espnId}` : null,
    final ? 0 : SUMMARY_MS,
  );
  const score = summary.data?.score ?? matched;

  const homeSymbol = game?.teams.find((t) => t.side === "home")?.contract.symbol;
  const awaySymbol = game?.teams.find((t) => t.side === "away")?.contract.symbol;
  const homeCandles = useCandles(homeSymbol);
  const awayCandles = useCandles(awaySymbol);

  const [live, setLive] = useState<{ points: OddsPoint[]; polledAt: number | null }>({ points: [], polledAt: null });
  useEffect(() => {
    if (!game) return;
    const chance = (side: "home" | "away") => {
      const team = game.teams.find((t) => t.side === side);
      return team ? winChance(team.contract.quote).p : null;
    };
    const now = Date.now();
    // Each poll is an event the series has to remember with its arrival time, so it cannot be derived from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive((prev) => ({ points: addLivePoint(prev.points, now, chance("home"), chance("away")).slice(-MAX_LIVE_POINTS), polledAt: now }));
  }, [game]);

  const points = useMemo(() => {
    if (!game || live.polledAt == null) return [];
    const history = mergeHistory(homeCandles, awayCandles, sinceFor(game, live.polledAt));
    const firstLive = live.points[0];
    const merged = firstLive ? [...history.filter((p) => p.t < firstLive.t), ...live.points] : history;
    const end = merged[merged.length - 1];
    // Extends the step lines to the latest poll so the chart's right edge is "now".
    return end && live.polledAt > end.t ? [...merged, { ...end, t: live.polledAt }] : merged;
  }, [game, homeCandles, awayCandles, live]);

  const loadState: GameFeed["load"] = market.data
    ? game
      ? "ready"
      : "missing"
    : market.error
      ? "error"
      : "loading";

  return {
    load: loadState,
    error: market.error,
    stale: market.data != null && market.error != null,
    game,
    score,
    scoreStatus: !league ? "none" : score ? "matched" : board.data ? "none" : board.error ? "unavailable" : "loading",
    plays: summary.data?.plays ?? [],
    playsUnavailable: matched != null && summary.data == null && summary.error != null,
    points,
    replay: null,
  };
}
