"use client";

import { useEffect, useMemo, useState } from "react";
import { record, useAccount } from "@/domains/account/store";
import { settleLegs } from "@/domains/cushion/price";
import { frameAt, replayBooks, replayResolutions, replaySchema, replaySpan, type Replay } from "@/domains/replay/replay";
import { usePoll } from "@/lib/use-poll";
import type { GameFeed } from "./feed";

export const REPLAY_ID = "nfl-ind-hou-2026-11-19";
export const REPLAY_SPEEDS = [30, 60, 240];
const TICK_MS = 200;

/** Plays a saved game back on a clock: the real plays, score and traded prices as of each moment. */
export function useReplayGame(): GameFeed {
  const file = usePoll<unknown>(`/replays/${REPLAY_ID}.json`);
  const replay: Replay | null = useMemo(() => {
    const parsed = replaySchema.safeParse(file.data);
    return parsed.success ? parsed.data : null;
  }, [file.data]);
  const span = useMemo(() => (replay ? replaySpan(replay) : null), [replay]);

  // Milliseconds of game time since the replay's start.
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(REPLAY_SPEEDS[1]);
  const length = span ? span.end - span.start : 0;
  const atEnd = length > 0 && elapsed >= length;

  useEffect(() => {
    if (!playing || length === 0 || atEnd) return;
    const timer = setInterval(() => setElapsed((now) => Math.min(length, now + TICK_MS * speed)), TICK_MS);
    return () => clearInterval(timer);
  }, [playing, speed, length, atEnd]);

  const frame = useMemo(() => (replay && span ? frameAt(replay, span.start + elapsed) : null), [replay, span, elapsed]);

  // A cushion bought during the replay is paid out on the game's real result once the replay gets there.
  const { positions } = useAccount();
  const over = frame?.over ?? false;
  useEffect(() => {
    if (!over || !replay) return;
    const resolutions = replayResolutions(replay);
    if (!resolutions) return;
    for (const position of positions) {
      if (position.replay !== replay.id || position.payout != null) continue;
      const payout = settleLegs(position.legs, resolutions);
      if (payout != null) record({ type: "CushionSettled", at: new Date().toISOString(), id: position.id, payout });
    }
  }, [over, replay, positions]);

  if (!replay || !span || !frame) {
    const failed = file.error != null || (file.data !== undefined && !replay);
    return {
      load: failed ? "missing" : "loading",
      error: file.error,
      stale: false,
      game: null,
      score: null,
      scoreStatus: "loading",
      plays: [],
      playsUnavailable: false,
      points: [],
      replay: null,
    };
  }

  return {
    load: "ready",
    error: null,
    stale: false,
    game: frame.game,
    score: frame.score,
    scoreStatus: "matched",
    plays: frame.plays,
    playsUnavailable: false,
    points: frame.points,
    replay: {
      id: replay.id,
      playedAt: frame.game.startTime,
      playing: playing && !atEnd,
      speed,
      progress: length === 0 ? 0 : elapsed / length,
      over,
      complete: replay.final,
      books: replayBooks(frame.game),
      setPlaying: (next) => {
        // Pressing play at the end starts the game over.
        if (next && atEnd) setElapsed(0);
        setPlaying(next);
      },
      setSpeed,
      seek: (progress) => setElapsed(Math.max(0, Math.min(1, progress)) * length),
    },
  };
}
