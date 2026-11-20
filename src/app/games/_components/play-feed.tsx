"use client";

import { useState } from "react";
import { Card, CardTitle, Notice } from "@/components/ui";
import type { GameFeed } from "./feed";

/** What to say when there are no plays to list. */
function emptyMessage(feed: GameFeed): string | null {
  if (feed.plays.length > 0) return null;
  if (feed.scoreStatus === "unavailable") return "Live scores are unavailable right now. The market above still updates.";
  if (feed.scoreStatus === "none") return "There is no play by play for this game. The market still updates.";
  if (feed.playsUnavailable) return "Play by play is unavailable right now. We will keep trying.";
  if (feed.score?.state === "pre" || (feed.score == null && !feed.game?.isLive)) return "Plays show up here once the game starts.";
  return "Waiting for the first plays.";
}

/** The play-by-play list, newest first. */
export function PlayFeed({ feed }: { feed: GameFeed }) {
  const [onlyScores, setOnlyScores] = useState(false);
  const plays = onlyScores ? feed.plays.filter((p) => p.scoringPlay) : feed.plays;
  const message = emptyMessage(feed) ?? (plays.length === 0 ? "No scoring plays yet." : null);

  return (
    <Card>
      <CardTitle
        hint={
          <span className="flex items-center gap-2">
            <Filter active={!onlyScores} onClick={() => setOnlyScores(false)}>
              All plays
            </Filter>
            <Filter active={onlyScores} onClick={() => setOnlyScores(true)}>
              Scores
            </Filter>
          </span>
        }
      >
        Play by play
      </CardTitle>
      {message ? (
        <Notice>{message}</Notice>
      ) : (
        <ul className="max-h-[440px] space-y-1 overflow-y-auto pr-1">
          {plays.map((play) => (
            <li
              key={play.id}
              className={`arrive grid grid-cols-[84px_1fr] gap-3 rounded-xl px-3 py-2 text-[14px] leading-snug ${play.scoringPlay ? "bg-cushion-soft font-medium" : ""}`}
            >
              <span className="tabular text-[13px] text-muted">{[play.clock, play.period].filter(Boolean).join(" · ")}</span>
              <span>{play.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Filter({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`press rounded-full px-3 py-1 text-[12px] font-medium ${active ? "bg-ink text-card" : "bg-paper text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
