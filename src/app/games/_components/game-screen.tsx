"use client";

import Link from "next/link";
import { OddsChart } from "@/components/odds-chart";
import { Card, CardTitle, Notice, Skeleton, Tag, WithTicket } from "@/components/ui";
import { teamLabel } from "@/domains/scores/names";
import type { GameFeed } from "./feed";
import { PlayFeed } from "./play-feed";
import { GameVideo } from "./game-video";
import { Moments, ReplayBar } from "./replay-bar";
import { ScoreHeader } from "./score-header";
import { TicketPanel, TicketSkeleton } from "./ticket-panel";

const BackLink = () => (
  <Link href="/games" className="press mb-5 inline-block text-[14px] text-muted hover:text-ink">
    &larr; All games
  </Link>
);

/** The game screen, built to sit beside a TV. Draws whatever feed it is given, a live game or a replay. */
export function GameScreen({ feed }: { feed: GameFeed }) {
  if (feed.load === "loading") return <Loading />;

  if (feed.load === "error") {
    return (
      <>
        <BackLink />
        <Notice>Gemini&rsquo;s markets are not answering right now. Give it a moment and this page will try again by itself.</Notice>
      </>
    );
  }

  const { game } = feed;
  if (feed.load === "missing" || !game) {
    return (
      <>
        <BackLink />
        <Card>
          <h1 className="text-[20px] font-semibold tracking-tight">We cannot find that game</h1>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
            It may have finished and left the market, or the link may be old. Pick another from the list.
          </p>
        </Card>
      </>
    );
  }

  const away = game.teams.find((t) => t.side === "away")!;
  const home = game.teams.find((t) => t.side === "home")!;

  return (
    <>
      <BackLink />
      {feed.replay && !feed.replay.video ? (
        <div className="mb-6">
          <ReplayBar replay={feed.replay} />
        </div>
      ) : null}
      {feed.stale ? (
        <div className="mb-6">
          <Notice>Showing the last prices we got. Trying again.</Notice>
        </div>
      ) : null}
      <WithTicket ticket={<TicketPanel feed={feed} />}>
        {feed.replay?.video ? (
          <Card className="!p-4">
            <GameVideo
              youtubeId={feed.replay.video.youtubeId}
              startSeconds={feed.replay.video.startSeconds}
              onTime={feed.replay.video.onTime}
              onUnavailable={feed.replay.video.onUnavailable}
              jump={feed.replay.video.jump}
            />
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              Play-by-play broadcast by {feed.replay.video.by} on YouTube. The score, plays and prices below follow the video, so pause or
              scrub it and everything moves with it.
            </p>
          </Card>
        ) : null}
        <ScoreHeader feed={feed} />
        {feed.replay ? <Moments replay={feed.replay} /> : null}
        <Card>
          <CardTitle>Win chance</CardTitle>
          <OddsChart
            points={feed.points}
            home={teamLabel(game, home)}
            away={teamLabel(game, away)}
            tag={<Tag tone="plain">Traded prices</Tag>}
          />
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            {feed.replay
              ? "Every step is a real trade on Gemini during this game. Each line holds the last traded price until the next trade."
              : "Each line holds the last price that traded until the next trade, so a flat stretch means no trades, not a steady quote. The dot is the market's price right now."}
          </p>
        </Card>
        <PlayFeed feed={feed} />
      </WithTicket>
    </>
  );
}

function Loading() {
  return (
    <>
      <BackLink />
      <WithTicket ticket={<TicketSkeleton />}>
        <Card>
          <div className="space-y-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        </Card>
        <Card>
          <Skeleton className="h-[260px] w-full" />
        </Card>
      </WithTicket>
    </>
  );
}
