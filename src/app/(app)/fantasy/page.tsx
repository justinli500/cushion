"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, WithTicket } from "@/components/kit";
import { playerUnderLegs } from "@/domains/cushion/legs";
import { priceCushion } from "@/domains/cushion/price";
import { bustWording, type PlayerEntry } from "@/domains/exposure/fantasy";
import { gamesSpan, lineupPurchase, lineupSlots, pickableLines, resolvePick, shortUsd, stakeShare, type Choice } from "@/domains/exposure/fantasy-cushion";
import { exampleLineup, mainMetric, positionOf, type LineupSpot } from "@/domains/exposure/fantasy-roster";
import type { Book } from "@/domains/markets/types";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { formatWhen } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { CushionAside } from "./cushion-aside";
import { LineupSearch } from "./lineup-search";
import { MatchupHeader } from "./matchup-header";
import { PlayerOptions, type Option } from "./player-options";
import { Roster, type RosterRow } from "./roster";

// The most symbols /api/book answers for in one call.
const MAX_BOOKS = 40;
const list = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

export default function FantasyPage() {
  const { fantasy } = useProfile();
  const { data, error } = usePoll<{ players: PlayerEntry[] }>("/api/markets/props", 60_000);
  const entries = data?.players;
  const stake = fantasy.stake;

  // Null until the person has covered or uncovered someone: until then every player they can cover starts covered,
  // each on the stat his position is drafted for, so the whole lineup opens as one cushion.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Chosen once, when the players first load: it is ranked from live quotes and would otherwise reshuffle as they move.
  const [example, setExample] = useState<LineupSpot[] | null>(null);
  if (!example && entries) setExample(exampleLineup(entries, now));

  // With no lineup of their own, the person sees the example and can try everything on it.
  const isExample = fantasy.players.length === 0;
  const names = useMemo(() => (isExample ? (example ?? []).map((spot) => spot.name) : fantasy.players), [isExample, example, fantasy.players]);
  const setLineup = (players: string[]) => updateProfile("fantasy", { ...fantasy, players });

  const slots = useMemo(() => (entries ? lineupSlots(entries, names, now) : []), [entries, names, now]);
  // Until the person chooses, a cushion sits on the stat the player is drafted for: passing for a quarterback, not his rushing.
  const choiceFor = (key: string, entry: PlayerEntry): Choice => choices[key] ?? { metric: mainMetric(entry) };
  const cards = slots.map((slot) => ({ slot, selection: slot.entry && slot.status !== "over" ? resolvePick(slot.entry, choiceFor(slot.key, slot.entry)) : null }));
  // A finished game is already in the score, so it takes no share of the stake. A player with no market keeps his,
  // which stays uncovered and holds the meter below the stake.
  const share = stakeShare(stake, cards.filter((c) => c.slot.status !== "over").length);

  const shown = cards.find((c) => c.slot.key === picked) ?? cards.find((c) => c.selection) ?? cards[0];
  // Every stat the shown player has an open line on, each at the person's line or the default one.
  const openStats = shown?.slot.entry && shown.slot.status !== "over" ? shown.slot.entry.stats.filter((s) => pickableLines(s).length > 0) : [];
  const main = shown?.slot.entry ? mainMetric(shown.slot.entry) : undefined;
  const offered = [...openStats]
    .sort((a, b) => Number(b.metric === main) - Number(a.metric === main))
    .flatMap((stat) => {
      const choice = choices[shown.slot.key];
      const pick = resolvePick(shown.slot.entry!, choice?.metric === stat.metric ? choice : { metric: stat.metric });
      return pick && pick.stat === stat ? [pick] : [];
    });

  const symbols = [...new Set([...cards.flatMap((c) => (c.selection ? [c.selection.line.contract.symbol] : [])), ...offered.map((o) => o.line.contract.symbol)])].slice(0, MAX_BOOKS);
  const books = usePoll<{ books: Record<string, Book> }>(symbols.length > 0 ? `/api/book?symbols=${symbols.join(",")}` : null, 5_000);

  const coverable = cards.filter((c) => c.selection).map((c) => c.slot.key);
  // Before the person chooses, a player nobody is selling a cushion for right now starts uncovered, so every tick is a
  // player the cushion would pay for and the ticks match the count in the panel.
  const offer = books.data?.books;
  const starting = cards.flatMap((c) => (c.selection && (!offer || priceCushion(playerUnderLegs(c.selection.line, share), offer).legs.some((l) => l.filled > 0)) ? [c.slot.key] : []));
  const on = (chosen ?? starting).filter((key) => coverable.includes(key));
  const covered = cards.flatMap((c) => (c.slot.entry && c.selection && on.includes(c.slot.key) ? [{ entry: c.slot.entry, pick: c.selection }] : []));

  const options: Option[] = offered.map((pick) => ({
    ...pick,
    quote: books.data ? priceCushion(playerUnderLegs(pick.line, share), books.data.books) : null,
    on: on.includes(shown.slot.key) && shown.selection?.stat.metric === pick.stat.metric,
  }));

  // One cushion per player: pressing the option that is on takes it off, pressing another moves the cushion to it.
  const press = (key: string, metric: string, isOn: boolean) => {
    if (isOn) return setChosen(on.filter((k) => k !== key));
    setChoices({ ...choices, [key]: { metric } });
    setChosen(on.includes(key) ? on : [...on, key]);
  };

  const { cushion, eventTickers, expiry } = lineupPurchase(covered, share);
  const only = covered.length === 1 ? covered[0] : null;
  const detail = only
    ? `Pays ${shortUsd(share)} if ${only.entry.player} ${bustWording(only.pick.stat.metric, only.pick.line.line).clause}.`
    : `Pays ${shortUsd(share)} for each of ${list.format(covered.map((c) => c.entry.player))} who has a bad game.`;

  const emptyMessage = !entries
    ? "Prices appear here once the players have loaded."
    : names.length === 0
      ? "Add a player to your lineup to see what a cushion costs."
      : coverable.length === 0
        ? "None of these players has an open market right now."
        : "Pick a player, then a way to cushion him.";

  const rows: RosterRow[] | undefined = entries
    ? cards.map(({ slot, selection }) => ({
        key: slot.key,
        name: slot.name,
        slot: (isExample ? example?.find((spot) => spot.name === slot.name)?.slot : slot.entry && positionOf(slot.entry)) || "",
        sub: slot.entry ? [slot.entry.team, formatWhen(slot.entry.startTime)].filter(Boolean).join(" · ") : "No markets listed",
        headshot: slot.entry?.headshot,
        covered: on.includes(slot.key),
        blocked: selection ? null : !slot.entry ? "No market" : slot.status === "over" ? "Finished" : "Closed",
      }))
    : undefined;

  const withMarket = new Set(cards.filter((c) => c.selection).map((c) => c.slot.name)).size;
  const upcoming = cards.flatMap((c) => (c.slot.entry && c.slot.status !== "over" ? [c.slot.entry] : []));
  const role = shown?.slot.entry ? [positionOf(shown.slot.entry), shown.slot.entry.team].filter(Boolean).join(" · ") : "";

  return (
    <>
      <PageHeader
        title="Cushion your lineup"
        lead="Fantasy points are not a market, so Cushion covers the real stats behind them: yards, touchdowns, points. Pick a player to be paid back if he has a quiet game."
      />
      <WithTicket
        ticket={
          <CushionAside
            input={{ section: "fantasy", title: only ? `${only.entry.player} cushion` : "Fantasy lineup cushion", detail, cushion, eventTickers, expiry }}
            stake={stake}
            emptyMessage={emptyMessage}
          />
        }
      >
        <MatchupHeader
          stake={stake}
          onStake={(next) => updateProfile("fantasy", { ...fantasy, stake: next })}
          games={entries ? gamesSpan(upcoming) : undefined}
          lineupSize={names.length}
          withMarket={withMarket}
        />

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
            {error && !entries ? null : <Roster
                rows={rows}
                selected={shown?.slot.key ?? null}
                onSelect={setPicked}
                onToggle={(key) => setChosen(on.includes(key) ? on.filter((k) => k !== key) : [...on, key])}
                example={isExample}
              />}
            <LineupSearch
              entries={entries}
              names={names}
              failed={error != null && !entries}
              example={isExample}
              onAdd={(name) => {
                setLineup(isExample ? [name] : [...names, name]);
                setPicked(null);
              }}
            />
          </div>

          {shown ? (
            <div className="min-w-0 flex-[2_1_380px]">
              <PlayerOptions
                key={shown.slot.key}
                slot={shown.slot}
                role={role}
                options={options}
                booksFailed={books.error != null && !books.data}
                onPress={(metric) => press(shown.slot.key, metric, options.some((o) => o.on && o.stat.metric === metric))}
                onLine={(metric, line) => setChoices({ ...choices, [shown.slot.key]: { metric, line } })}
                onRemove={() => {
                  setLineup(names.filter((n) => n !== shown.slot.name));
                  setPicked(null);
                }}
              />
            </div>
          ) : null}
        </div>
      </WithTicket>
    </>
  );
}
