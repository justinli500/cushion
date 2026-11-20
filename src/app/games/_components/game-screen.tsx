"use client";

import Link from "next/link";
import { OddsChart } from "@/components/odds-chart";
import { Card, CardTitle, Notice, Skeleton, Tag, WithTicket } from "@/components/ui";
import { teamLabel } from "@/domains/scores/names";
import type { GameFeed } from "./feed";
import { PlayFeed } from "./play-feed";
import { ReplayBar } from "./replay-bar";
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
      {feed.replay ? (
        <div className="mb-6 space-y-4">
          <Notice>
            A replay of the game played on {new Date(feed.replay.playedAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })},
            sped up. The plays, the score and the prices are the real ones from that night. Cushions here use play money and settle when the
            replay ends.{feed.replay.complete ? "" : " This game was saved before it finished, so the replay stops where the recording does."}
          </Notice>
          <ReplayBar replay={feed.replay} />
        </div>
      ) : null}
      {feed.stale ? (
        <div className="mb-6">
          <Notice>Showing the last prices we got. Trying again.</Notice>
        </div>
      ) : null}
      <WithTicket ticket={<TicketPanel feed={feed} />}>
        <ScoreHeader feed={feed} />
        <Card>
          <CardTitle>Win chance</CardTitle>
          <OddsChart
            points={feed.points}
            home={teamLabel(game, home)}
            away={teamLabel(game, away)}
            tag={feed.replay ? <Tag tone="note">Replay of traded prices</Tag> : <Tag tone="plain">Traded prices</Tag>}
          />
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            {feed.replay
              ? "Every step is a real trade on Gemini from that night. Each line holds the last traded price until the next trade."
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
