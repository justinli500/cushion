"use client";

import { useMemo } from "react";
import { Card, CardTitle, YesNoPair } from "@/components/kit";
import type { Game } from "@/domains/markets/types";
import { gameMarkets, type MarketPick } from "@/domains/replay/worth-markets";
import type { GameView } from "./view";

/** What it costs to buy each side now: Yes at the ask, No at one minus the bid. */
const prices = (quote: { bid: number | null; ask: number | null }) => ({ yes: quote.ask, no: quote.bid == null ? null : 1 - quote.bid });

/** "Trade this game": the game's real markets, each as a Yes/No pair that opens the buy panel on that side. */
export function TradeCard({ view, game, onPick }: { view: GameView; game: Game; onPick(pick: MarketPick): void }) {
  const markets = useMemo(() => gameMarkets(game, view.props), [game, view.props]);
  const over = view.score?.state === "final";
  const { replay } = view;

  return (
    <Card>
      <CardTitle hint={replay ? "Recorded Gemini markets" : "Gemini markets"}>Trade this game</CardTitle>
      <div className="flex flex-col gap-3.5">
        {markets.map((market) => {
          const price = prices(market.contract.quote);
          const open = !over && market.contract.open;
          return (
            <div key={market.key} className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">{market.question}</span>
              <YesNoPair
                yes={price.yes}
                no={price.no}
                onYes={open ? () => onPick({ market, side: "yes" }) : undefined}
                onNo={open ? () => onPick({ market, side: "no" }) : undefined}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        {over
          ? "This game is over, so its markets are closed."
          : replay
            ? "Only the two win markets were recorded for this game. Prices are the last trades at this moment of it, with a 1 cent spread."
            : view.props.length === 0
              ? "Gemini lists no player markets for this game. Prices are what each side costs right now."
              : "Prices are what each side costs right now, the closest player calls first."}{" "}
        Press Yes or No to price it above. Play money: no real funds move.
      </p>
    </Card>
  );
}
