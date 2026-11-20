"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { OddsChart } from "@/components/odds-chart";
import { Card, CardTitle, Notice, Skeleton, Tag } from "@/components/kit";
import type { Position } from "@/domains/account/ledger";
import { useAccount } from "@/domains/account/store";
import type { Game } from "@/domains/markets/types";
import { worthFromQuotes, type HeldLeg } from "@/domains/replay/worth";
import { cushionChance, quoteIndex, type MarketPick } from "@/domains/replay/worth-markets";
import { teamLabel } from "@/domains/scores/names";
import { formatUsd } from "@/lib/format";
import { useBuyChoice } from "./buy-choice";
import { BuyPanel } from "./buy-panel";
import { CushionPanel } from "./cushion-panel";
import { PlayFeed } from "./play-feed";
import { Moments, ReplayBar } from "./replay-bar";
import { StreamTags, StreamTile } from "./stream-tile";
import { TradeCard } from "./trade-card";
import { useWorth } from "./use-worth";
import type { GameView } from "./view";
import { WorthCard } from "./worth-card";

const BackLink = () => (
  <Link href="/games" className="press mb-5 inline-block text-[14px] text-muted-foreground hover:text-foreground">
    &larr; All games
  </Link>
);

/** The game screen, built to sit beside a TV. Draws whatever view it is given, a live game or a replay. */
export function GameScreen({ feed }: { feed: GameView }) {
  if (feed.load === "loading") return <Loading />;

  if (feed.load === "error") {
    return (
      <>
        <BackLink />
        <Notice>Gemini&rsquo;s markets are not answering right now. Give it a moment and this page will try again by itself.</Notice>
      </>
    );
  }

  if (feed.load === "missing" || !feed.game) {
    return (
      <>
        <BackLink />
        <Card>
          <h1 className="text-[20px] font-semibold tracking-tight">We cannot find that game</h1>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            It may have finished and left the market, or the link may be old. Pick another from the list.
          </p>
        </Card>
      </>
    );
  }

  return <Ready view={feed} game={feed.game} />;
}

/** A cushion bought on this game: during the replay for the saved game, or on one of this game's markets for a live one. */
function isOnGame(position: Position, view: GameView, game: Game): boolean {
  if (view.replay) return position.replay === view.replay.id;
  const tickers = new Set([game.eventTicker, ...view.props.map((p) => p.eventTicker)]);
  return position.replay == null && position.eventTickers.some((t) => tickers.has(t));
}

function Ready({ view, game }: { view: GameView; game: Game }) {
  const { positions } = useAccount();
  const choice = useBuyChoice(view, game);
  // The number of open cushions when "Add cushion" was pressed: any purchase or cash out since closes the buy panel again.
  const [addingAt, setAddingAt] = useState<number | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const quotes = useMemo(() => quoteIndex(game, view.props), [game, view.props]);
  const mine = positions.filter((p) => isOnGame(p, view, game));
  const open = mine.filter((p) => p.payout == null);
  const settled = mine.filter((p) => p.payout != null);
  const held = open.find((p) => p.id === shownId) ?? open[0] ?? null;
  const showBuy = held == null || addingAt === open.length;

  const heldLegs: HeldLeg[] | null = held ? held.legs.map(({ symbol, side, filled }) => ({ symbol, side, filled })) : null;
  const exampleLegs: HeldLeg[] | null = !held && choice.cushion ? choice.cushion.legs.map((l) => ({ symbol: l.symbol, side: l.side, filled: l.quantity })) : null;
  const legs = heldLegs ?? exampleLegs;
  const worth = legs ? worthFromQuotes(legs, (symbol) => quotes.get(symbol)) : null;
  const data = useWorth(view, game, legs, held ? Date.parse(held.at) : null, worth);

  const covered = open.length > 0 ? open.reduce((sum, p) => sum + p.maxPayout, 0) : null;
  const away = game.teams.find((t) => t.side === "away")!;
  const home = game.teams.find((t) => t.side === "home")!;

  const press = (pick: MarketPick) => {
    choice.pickMarket(pick);
    setAddingAt(open.length);
    requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const example = held == null && legs != null;
  const empty =
    choice.team || choice.pick || choice.over
      ? choice.emptyMessage
      : "Pick the team you are rooting for, on the right, to chart what a cushion on their loss would be worth.";
  const amount = formatUsd(choice.payout).replace(/\.00$/, "");
  const caption = held
    ? view.replay
      ? "Before you bought it, the line shows what it would have been worth."
      : null
    : legs
      ? view.replay
        ? `A ${amount} cushion, "${choice.title}", as if you had held it since before kickoff. Pick another on the right to chart it.`
        : `A ${amount} cushion, "${choice.title}", at the prices that really traded.`
      : null;

  return (
    <>
      <BackLink />
      {view.replay && !view.replay.video ? (
        <div className="mb-6">
          <ReplayBar replay={view.replay} />
        </div>
      ) : null}
      {view.stale ? (
        <div className="mb-6">
          <Notice>Showing the last prices we got. Trying again.</Notice>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <div className="flex flex-col gap-3">
            <StreamTile view={view} game={game} covered={covered} />
            <StreamTags view={view} game={game} />
            {view.replay?.video ? (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Video by {view.replay.video.by} on YouTube. The score, plays and prices follow the video as closely as its cuts allow, so pause or
                scrub it and everything moves with it.
              </p>
            ) : null}
            {view.replay ? <Moments replay={view.replay} /> : null}
          </div>

          <WorthCard data={data} paid={held ? held.cost : null} example={example} caption={caption} empty={legs ? undefined : empty} />

          <Card>
            <CardTitle>Win chance</CardTitle>
            <OddsChart points={view.points} home={teamLabel(game, home)} away={teamLabel(game, away)} tag={<Tag tone="plain">Traded prices</Tag>} />
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              {view.replay
                ? "Every step is a real trade on Gemini during this game. Each line holds the last traded price until the next trade."
                : "Each line holds the last price that traded until the next trade, so a flat stretch means no trades, not a steady quote. The dot is the market's price right now."}
            </p>
          </Card>

          <PlayFeed feed={view} />
        </div>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
          <div ref={panel} className="scroll-mt-4">
            {showBuy ? (
              <BuyPanel view={view} game={game} choice={choice} onBack={held ? () => setAddingAt(null) : undefined} />
            ) : (
              <CushionPanel
                position={held}
                open={open}
                onPick={setShownId}
                worth={worth ?? 0}
                chance={heldLegs ? cushionChance(heldLegs, quotes) : null}
                recorded={view.replay != null}
                onAdd={() => setAddingAt(open.length)}
              />
            )}
          </div>
          <TradeCard view={view} game={game} onPick={press} />
          {settled.length > 0 ? <Settled positions={settled} /> : null}
        </aside>
      </div>
    </>
  );
}

/** Cushions on this game that have paid out or run out, so the result stays on the page after the game. */
function Settled({ positions }: { positions: Position[] }) {
  return (
    <Card>
      <CardTitle hint={`${positions.length} on this game`}>Settled</CardTitle>
      <ul className="space-y-3">
        {positions.map((p) => (
          <li key={p.id} className="arrive tabular flex items-start justify-between gap-4 text-[13px]">
            <span className="min-w-0">
              <span className="block font-medium">{p.title}</span>
              <span className="block text-muted-foreground">
                Cost {formatUsd(p.cost)}, pays up to {formatUsd(p.maxPayout)}
              </span>
            </span>
            <span className="shrink-0">
              {p.payout != null && p.payout > 0 ? <Tag tone="cushion">Paid {formatUsd(p.payout)}</Tag> : <Tag tone="plain">Not needed</Tag>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Loading() {
  return (
    <>
      <BackLink />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <Skeleton className="aspect-video w-full rounded-[28px]" />
          <Card>
            <div className="space-y-4">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-[160px] w-full" />
            </div>
          </Card>
        </div>
        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
          <Skeleton className="h-[360px] w-full rounded-[28px]" />
          <Skeleton className="h-[240px] w-full rounded-[28px]" />
        </aside>
      </div>
    </>
  );
}
