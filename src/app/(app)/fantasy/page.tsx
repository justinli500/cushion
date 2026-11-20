"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader, Skeleton, WithTicket } from "@/components/kit";
import { playerUnderLegs } from "@/domains/cushion/legs";
import { priceCushion } from "@/domains/cushion/price";
import { bustWording, type PlayerEntry } from "@/domains/exposure/fantasy";
import { gamesSpan, lineupPurchase, lineupSlots, resolvePick, shortUsd, stakeShare, type Choice } from "@/domains/exposure/fantasy-cushion";
import type { Book } from "@/domains/markets/types";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { usePoll } from "@/lib/use-poll";
import { CushionAside } from "./cushion-aside";
import { LineupSearch } from "./lineup-search";
import { MatchupHeader } from "./matchup-header";
import { PlayerCard } from "./player-card";

// The most symbols /api/book answers for in one call.
const MAX_BOOKS = 40;
const list = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

export default function FantasyPage() {
  const { fantasy } = useProfile();
  const { data, error } = usePoll<{ players: PlayerEntry[] }>("/api/markets/props", 60_000);
  const entries = data?.players;
  const names = fantasy.players;
  const stake = fantasy.stake;

  // Null until the person has touched a card: then the first player they can cover starts covered.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const setLineup = (players: string[]) => updateProfile("fantasy", { ...fantasy, players });

  const slots = useMemo(() => (entries ? lineupSlots(entries, names, now) : []), [entries, names, now]);
  const cards = slots.map((slot) => ({ slot, selection: slot.entry && slot.status !== "over" ? resolvePick(slot.entry, choices[slot.key]) : null }));
  // A finished game is already in the score, so it takes no share of the stake. A player with no market keeps his,
  // which stays uncovered and holds the meter below the stake.
  const share = stakeShare(stake, cards.filter((c) => c.slot.status !== "over").length);

  const symbols = [...new Set(cards.flatMap((c) => (c.selection ? [c.selection.line.contract.symbol] : [])))].slice(0, MAX_BOOKS);
  const books = usePoll<{ books: Record<string, Book> }>(symbols.length > 0 ? `/api/book?symbols=${symbols.join(",")}` : null, 5_000);

  const coverable = cards.filter((c) => c.selection).map((c) => c.slot.key);
  const on = (chosen ?? coverable.slice(0, 1)).filter((key) => coverable.includes(key));
  const toggle = (key: string) => setChosen(on.includes(key) ? on.filter((k) => k !== key) : [...on, key]);
  const covered = cards.flatMap((c) => (c.slot.entry && c.selection && on.includes(c.slot.key) ? [{ entry: c.slot.entry, pick: c.selection }] : []));

  const { cushion, eventTickers, expiry } = lineupPurchase(covered, share);
  const players = covered.map((c) => c.entry.player);
  const only = covered.length === 1 ? covered[0] : null;
  const detail = only
    ? `Pays ${shortUsd(share)} if ${only.entry.player} ${bustWording(only.pick.stat.metric, only.pick.line.line).clause}.`
    : `Pays ${shortUsd(share)} for each of ${list.format(players)} who has a bad game.`;

  const emptyMessage = !entries
    ? "Prices appear here once the players have loaded."
    : names.length === 0
      ? "Add a player to your lineup to see what a cushion costs."
      : coverable.length === 0
        ? "None of your players has an open market right now."
        : "Tap a player to cover them.";

  const withMarket = new Set(cards.filter((c) => c.selection).map((c) => c.slot.name)).size;
  const upcoming = cards.flatMap((c) => (c.slot.entry && c.slot.status !== "over" ? [c.slot.entry] : []));

  return (
    <>
      <PageHeader
        title="Cushion your lineup"
        lead="Fantasy points are not a market, so Cushion covers the real stats behind them: yards, touchdowns, points. Tap a player to be paid back if he has a quiet game."
      />
      <WithTicket
        ticket={
          <CushionAside
            input={{
              section: "fantasy",
              title: only ? `${only.entry.player} cushion` : "Fantasy lineup cushion",
              detail,
              cushion,
              eventTickers,
              expiry,
            }}
            stake={stake}
            emptyMessage={emptyMessage}
          />
        }
      >
        <div className="flex flex-col gap-3">
          <MatchupHeader
            stake={stake}
            onStake={(next) => updateProfile("fantasy", { ...fantasy, stake: next })}
            games={entries ? gamesSpan(upcoming) : undefined}
            lineupSize={names.length}
            withMarket={withMarket}
          />

          {entries
            ? cards.map(({ slot, selection }) => (
                <PlayerCard
                  key={slot.key}
                  slot={slot}
                  selection={selection}
                  quote={selection && books.data ? priceCushion(playerUnderLegs(selection.line, share), books.data.books) : null}
                  booksFailed={books.error != null && !books.data}
                  on={on.includes(slot.key)}
                  onToggle={() => toggle(slot.key)}
                  onChoose={(choice) => setChoices({ ...choices, [slot.key]: choice })}
                  onRemove={() => setLineup(names.filter((n) => n !== slot.name))}
                />
              ))
            : error
              ? null
              : names.map((name) => <LineupSkeleton key={name} />)}

          <LineupSearch entries={entries} names={names} failed={error != null && !entries} onAdd={(name) => setLineup([...names, name])} />
        </div>
      </WithTicket>
    </>
  );
}

function LineupSkeleton() {
  return (
    <Card className="flex items-center gap-4 rounded-[24px] px-5 py-[18px]">
      <Skeleton className="size-[52px] rounded-[18px]" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
    </Card>
  );
}
