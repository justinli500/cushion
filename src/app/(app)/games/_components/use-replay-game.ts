"use client";

import { useEffect, useMemo, useState } from "react";
import { record, useAccount } from "@/domains/account/store";
import { settleLegs } from "@/domains/cushion/price";
import { cleaned, frameAt, moments, replayBooks, replayResolutions, replaySchema, replaySpan, type Replay } from "@/domains/replay/replay";
import { usePoll } from "@/lib/use-poll";
import type { GameView } from "./view";

export const REPLAY_ID = "nfl-ind-hou-2026-11-19";
export const REPLAY_SPEEDS = [30, 60, 240];
const TICK_MS = 200;

/**
 * Runs a recorded game as if it were live: the real plays, score and traded prices as of each moment.
 * When the game has a broadcast, the video's position is the clock, so pausing or scrubbing the video
 * moves everything with it. Without one, the game runs on its own clock.
 */
export function useReplayGame(): GameView {
  const file = usePoll<unknown>(`/replays/${REPLAY_ID}.json`);
  const replay: Replay | null = useMemo(() => {
    const parsed = replaySchema.safeParse(file.data);
    return parsed.success ? cleaned(parsed.data) : null;
  }, [file.data]);
  const span = useMemo(() => (replay ? replaySpan(replay) : null), [replay]);

  // Milliseconds of game time since the start. With a broadcast, the video's position is the clock.
  const [ownElapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(REPLAY_SPEEDS[1]);
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [jump, setJump] = useState<{ seconds: number; nonce: number } | null>(null);

  const length = span ? span.end - span.start : 0;
  const video = replay?.video && !videoFailed ? replay.video : null;
  const streamStart = video ? Date.parse(video.startedAt) : 0;
  const videoElapsed = video && span && videoSeconds != null ? streamStart + videoSeconds * 1000 - span.start : null;
  const elapsed = Math.max(0, Math.min(length, videoElapsed ?? ownElapsed));
  const atEnd = length > 0 && elapsed >= length;

  useEffect(() => {
    if (video || !playing || length === 0 || atEnd) return;
    const timer = setInterval(() => setElapsed((now) => Math.min(length, now + TICK_MS * speed)), TICK_MS);
    return () => clearInterval(timer);
  }, [video, playing, speed, length, atEnd]);

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
      at: null,
      recording: null,
      props: [],
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
    at: span.start + elapsed,
    recording: replay,
    props: [],
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
      seek: (progress) => {
        const target = Math.max(0, Math.min(1, progress)) * length;
        if (!video) return setElapsed(target);
        const seconds = (span.start + target - streamStart) / 1000;
        setVideoSeconds(seconds);
        setJump((previous) => ({ seconds, nonce: (previous?.nonce ?? 0) + 1 }));
      },
      video: video
        ? {
            youtubeId: video.youtubeId,
            by: video.by,
            // Open just before kickoff, skipping the pre-game show.
            startSeconds: (span.start - streamStart) / 1000,
            jump,
            onTime: setVideoSeconds,
            onUnavailable: () => setVideoFailed(true),
          }
        : null,
      moments: moments(replay).map((m) => ({ label: m.label, progress: length === 0 ? 0 : (m.t - span.start) / length })),
    },
  };
}
