"use client";

import { Card } from "@/components/ui";
import type { ReplayState } from "./feed";
import { REPLAY_SPEEDS } from "./use-replay-game";

/** Play, pause, speed and a scrubber, for a recorded game with no broadcast to drive it. */
export function ReplayBar({ replay }: { replay: ReplayState }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => replay.setPlaying(!replay.playing)}
          className="press w-[88px] shrink-0 rounded-xl bg-ink px-4 py-2 text-[14px] font-medium text-card"
        >
          {replay.playing ? "Pause" : replay.progress >= 1 ? "Replay" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(replay.progress * 1000)}
          onChange={(event) => replay.seek(Number(event.target.value) / 1000)}
          aria-label="Position in the game"
          className="h-1.5 w-full cursor-pointer accent-[var(--cushion)]"
        />
        <div className="inline-flex shrink-0 rounded-xl border border-line bg-paper p-1" role="group" aria-label="Replay speed">
          {REPLAY_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              aria-pressed={speed === replay.speed}
              onClick={() => replay.setSpeed(speed)}
              className={`press tabular rounded-lg px-2.5 py-1 text-[13px] ${
                speed === replay.speed ? "bg-card font-medium text-ink shadow-[0_0_0_1px_var(--line)]" : "text-muted hover:text-ink"
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Jumps to kickoff, any score, or the final whistle. */
export function Moments({ replay }: { replay: ReplayState }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted">Jump to</span>
      {replay.moments.map((moment) => (
        <button
          key={`${moment.label}-${moment.progress}`}
          type="button"
          // A few seconds early, so the play itself is on screen.
          onClick={() => replay.seek(moment.progress - 0.002)}
          className="press tabular rounded-full border border-line bg-card px-3 py-1 text-[12px] text-muted hover:border-faint hover:text-ink"
        >
          {moment.label}
        </button>
      ))}
    </div>
  );
}
