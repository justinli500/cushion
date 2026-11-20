"use client";

import { useState } from "react";
import { Card, Skeleton } from "@/components/kit";
import { MAX_STAKE, MIN_STAKE, parseStake } from "@/domains/exposure/fantasy";
import { formatUsdWhole, formatWhen } from "@/lib/format";

interface Props {
  stake: number;
  onStake: (stake: number) => void;
  /** Null until the players have loaded. */
  games: { first: string; last: string } | null | undefined;
  lineupSize: number;
  withMarket: number;
}

/** What is real about this week: the games, how many of the person's players can be covered, and what is riding on it. */
export function MatchupHeader({ stake, onStake, games, lineupSize, withMarket }: Props) {
  // What the person is typing, while they type; otherwise the saved stake, which can arrive after the first render.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(stake);
  const valid = parseStake(text) != null;

  const change = (next: string) => {
    setDraft(next);
    const parsed = parseStake(next);
    if (parsed != null) onStake(parsed);
  };

  return (
    <Card className="flex flex-row flex-wrap items-center justify-between gap-3 rounded-[24px] px-[22px] py-[18px]">
      <div className="flex flex-col">
        <span className="text-[13px] text-muted-foreground">
          {lineupSize === 0 ? "Your lineup" : `${withMarket} of ${lineupSize} ${lineupSize === 1 ? "player has" : "players have"} a market`}
        </span>
        {games === undefined ? (
          <Skeleton className="mt-1.5 h-6 w-48" />
        ) : (
          <span className="display text-[20px] font-semibold">
            {games ? (games.first === games.last ? formatWhen(games.first) : `${formatWhen(games.first)} to ${formatWhen(games.last)}`) : lineupSize === 0 ? "No players yet" : "No games listed yet"}
          </span>
        )}
      </div>

      <label className="flex flex-col items-end">
        <span className="text-[13px] text-muted-foreground">Riding on this week</span>
        <span className="relative">
          <span aria-hidden className="display pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[24px] font-bold text-muted-foreground">
            $
          </span>
          <input
            inputMode="decimal"
            value={text}
            aria-invalid={!valid}
            onChange={(e) => change(e.target.value)}
            onBlur={() => setDraft(null)}
            className="display tabular h-12 w-[132px] rounded-[14px] border-[1.5px] border-transparent bg-muted pl-8 pr-3 text-right text-[24px] font-bold outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 aria-invalid:border-destructive"
          />
        </span>
        {!valid ? (
          <span className="mt-1 text-[12px] text-destructive">
            Enter {formatUsdWhole(MIN_STAKE)} to {formatUsdWhole(MAX_STAKE)}.
          </span>
        ) : null}
      </label>
    </Card>
  );
}
