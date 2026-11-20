"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Game } from "@/domains/markets/types";
import {
  addSample,
  changeAcross,
  clockTicks,
  joinWorth,
  periodTicks,
  replayWorth,
  scoreEvents,
  tradedWorth,
  worthUpTo,
  type HeldLeg,
  type WorthPoint,
} from "@/domains/replay/worth";
import { sinceFor } from "@/domains/scores/series";
import type { GameView } from "./view";

/** A scoring play with what it did to the cushion's worth. */
export interface WorthTile {
  id: string;
  when: string;
  text: string;
  /** Null when the change was not seen: a live play that happened before the page was opened. */
  change: number | null;
}

export interface WorthData {
  /** Worth over time up to the moment on screen, ending on the worth right now. */
  points: WorthPoint[];
  tiles: WorthTile[];
  dotTimes: number[];
  ticks: { t: number; text: string }[];
  /** Why the line cannot be drawn yet, when it cannot. */
  note: string;
}

const TILES = 3;
const CANDLE_MS = 60_000;

/** One contract's traded prices: 5 minute candles, or hourly ones when the 5 minute series is empty. */
async function fetchCandles(symbol: string): Promise<Candle[]> {
  for (const frame of ["5m", "1hr"]) {
    try {
      const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${frame}`);
      const body = (await res.json()) as { candles?: Candle[] };
      if (res.ok && body.candles?.length) return body.candles;
    } catch {
      // A failed request is read as no prices: the chart then says there is no trading to draw.
    }
  }
  return [];
}

/** Traded prices for each symbol, refreshed every minute. Null until they have loaded. */
function useCandles(symbols: string[]): Record<string, Candle[]> | null {
  const key = symbols.join(",");
  const [state, setState] = useState<{ key: string; data: Record<string, Candle[]> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(key.split(",").map(async (symbol) => [symbol, await fetchCandles(symbol)] as const));
      if (!cancelled) setState({ key, data: Object.fromEntries(entries) });
    };
    void load();
    const timer = setInterval(() => void load(), CANDLE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key]);
  return state?.key === key ? state.data : null;
}

/**
 * What a cushion is worth, moment by moment, up to the moment on screen. For a saved game that is
 * read from the game's own prices as of each moment; for a live game, from Gemini's traded prices
 * since `since` plus what this page has polled since it opened. `now` is the worth at the live quotes.
 */
export function useWorth(view: GameView, game: Game, legs: HeldLeg[] | null, since: number | null, now: number | null): WorthData {
  const { recording, at, plays } = view;
  const legsKey = legs ? legs.map((l) => `${l.symbol}:${l.side}:${l.filled}`).join("|") : "";

  // The legs are rebuilt on every render, so the key stands in for their contents.
  const saved = useMemo(
    () => (recording && legs && legs.length > 0 ? replayWorth(recording, legs) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recording, legsKey],
  );

  const candles = useCandles(recording || !legs ? [] : [...new Set(legs.map((l) => l.symbol))]);
  const [log, setLog] = useState<{ key: string; samples: WorthPoint[] }>({ key: "", samples: [] });
  useEffect(() => {
    if (recording || at == null || now == null || !legsKey) return;
    // Each poll is an event the log has to remember with its time, so it cannot be derived from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog((prev) => {
      const samples = prev.key === legsKey ? prev.samples : [];
      const next = addSample(samples, { t: at, worth: now });
      return prev.key === legsKey && next === samples ? prev : { key: legsKey, samples: next };
    });
  }, [recording, at, now, legsKey]);

  // When each scoring play of a live game first appeared: ESPN's plays carry no times of their own.
  const primed = useRef(false);
  const [seen, setSeen] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (recording || plays.length === 0) return;
    // Read now: the updater below may run after this effect has marked the list as seen.
    const opened = !primed.current;
    setSeen((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const play of plays) {
        if (!play.scoringPlay || play.id in next) continue;
        // Plays already on the list when the page opened happened at an unknown time.
        next[play.id] = opened ? null : at;
        changed = true;
      }
      return changed ? next : prev;
    });
    primed.current = true;
  }, [recording, plays, at]);

  const series = useMemo(() => {
    if (recording) return saved;
    if (at == null || !legs || !candles) return [];
    const samples = log.key === legsKey ? log.samples : [];
    const from = since != null ? Math.min(since, at) : sinceFor(game, at);
    return joinWorth(tradedWorth(legs, candles, from, at), samples);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, saved, at, candles, log, legsKey, since, game]);

  if (at == null || now == null) return { points: [], tiles: [], dotTimes: [], ticks: [], note: "The line starts once prices have loaded." };
  const points = worthUpTo(series, at, now);

  if (recording) {
    const events = scoreEvents(recording, series, at);
    return {
      points,
      tiles: events.slice(-TILES).map((e) => ({ id: String(e.t), when: `${e.when} · ${e.score}`, text: e.text, change: e.change })),
      dotTimes: events.map((e) => e.t),
      ticks: periodTicks(recording, at),
      note: "The line starts as the game does.",
    };
  }

  const scoring = plays.filter((p) => p.scoringPlay);
  return {
    points,
    tiles: scoring
      .slice(0, TILES)
      .reverse()
      .map((p) => {
        const t = seen[p.id];
        return { id: p.id, when: [p.period, p.clock].filter(Boolean).join(" · "), text: p.text.trim(), change: t == null ? null : changeAcross(series, t, at) };
      }),
    dotTimes: scoring.flatMap((p) => seen[p.id] ?? []),
    ticks: points.length > 1 ? clockTicks(points[0].t, at) : [],
    note:
      candles && series.length === 0
        ? "Nothing has traded on this market yet, so there are no traded prices to chart. The line fills in as the price moves."
        : "The line fills in as the price moves.",
  };
}
