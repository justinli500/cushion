"use client";

import { useEffect, useState } from "react";
import { CushionTicket } from "@/components/cushion-ticket";
import { Card, CardTitle, inputClass, Notice, PageHeader, Skeleton, WithTicket } from "@/components/kit";
import { playerUnderLegs } from "@/domains/cushion/legs";
import { chanceOf } from "@/domains/cushion/probability";
import { bustWording, defaultBustLine, gameStatus, hasOpenLine, parsePayout, searchPlayers, type PlayerEntry } from "@/domains/exposure/fantasy";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { formatUsd, formatUsdWhole, formatWhen } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { PlayerCard, RemoveButton } from "./player-card";

const RESULT_LIMIT = 6;

interface Selection {
  gameId: string;
  player: string;
  metric: string;
  /** Fixed when the stat is picked, so a quote refresh does not move the person's choice. */
  line: number | null;
}

export default function FantasyPage() {
  const { fantasy } = useProfile();
  const { data, error } = usePoll<{ players: PlayerEntry[] }>("/api/markets/props", 60_000);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [amount, setAmount] = useState("15");

  const names = fantasy.players;
  const entries = data?.players;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const setLineup = (players: string[]) => updateProfile("fantasy", { players });
  const remove = (name: string) => {
    setLineup(names.filter((n) => n !== name));
    if (selection?.player === name) setSelection(null);
  };

  const picked = selection && entries?.find((e) => e.gameId === selection.gameId && e.player === selection.player);
  const stat = picked && picked.stats.find((s) => s.metric === selection.metric);
  const propLine = stat && stat.lines.find((l) => l.line === selection.line);
  const payout = parsePayout(amount);
  const ready = picked && stat && propLine && payout != null && gameStatus(picked, now) !== "over" && hasOpenLine(stat) ? { picked, stat, propLine, payout } : null;

  const chance = ready ? chanceOf(ready.propLine.contract.quote, "no") : null;
  const emptyMessage = !entries
    ? "Prices appear here once the players have loaded."
    : names.length === 0
      ? "Add a player to your lineup to see what a cushion costs."
      : !picked || !stat
        ? "Pick a player and a stat to see what a cushion costs."
        : gameStatus(picked, now) === "over"
          ? "This game has probably finished, so there is nothing left to cover."
          : !hasOpenLine(stat)
            ? "That market is closed right now. Pick another stat."
            : !propLine
              ? "Choose when it should pay you back."
              : "Choose how much it should pay.";

  return (
    <>
      <PageHeader title="Fantasy" lead="Add the players on your fantasy team. If one of them has a bad game, Cushion pays you back." />
      <WithTicket
        ticket={
          <CushionTicket
            section="fantasy"
            title={ready ? `${ready.picked.player} cushion` : "Fantasy cushion"}
            detail={
              ready
                ? `Pays ${Number.isInteger(ready.payout) ? formatUsdWhole(ready.payout) : formatUsd(ready.payout)} if ${ready.picked.player} ${bustWording(ready.stat.metric, ready.propLine.line).clause}.`
                : "Pays you back if one of your players has a bad game."
            }
            cushion={ready ? playerUnderLegs(ready.propLine, ready.payout) : null}
            eventTickers={ready ? [ready.stat.eventTicker] : []}
            expiry={ready?.picked.expiry ?? ""}
            chance={chance?.p != null ? chance : undefined}
            emptyMessage={emptyMessage}
          />
        }
      >
        <LineupSearch entries={entries} names={names} failed={error != null && !entries} onAdd={(name) => setLineup([...names, name])} />

        {names.map((name) => {
          const matches = entries?.filter((e) => e.player === name);
          if (!entries) return error ? null : <Card key={name}><LineupSkeleton /></Card>;
          if (!matches?.length) {
            return (
              <Card key={name} className="arrive flex items-center justify-between gap-4">
                <p className="text-[14px] text-muted-foreground">No markets for {name} today. They will show up here when their game is listed.</p>
                <RemoveButton name={name} onClick={() => remove(name)} />
              </Card>
            );
          }
          return matches.map((entry) => {
            const here = selection?.gameId === entry.gameId && selection.player === entry.player ? selection : null;
            return (
              <PlayerCard
                key={`${entry.gameId}|${entry.player}`}
                entry={entry}
                status={gameStatus(entry, now)}
                picked={here}
                amount={amount}
                onPickStat={(metric) => {
                  const next = entry.stats.find((s) => s.metric === metric);
                  const alreadyOpen = here?.metric === metric;
                  setSelection(alreadyOpen || !next ? null : { gameId: entry.gameId, player: entry.player, metric, line: defaultBustLine(next.lines)?.line ?? null });
                }}
                onPickLine={(line) => here && setSelection({ ...here, line })}
                onAmount={setAmount}
                onRemove={() => remove(name)}
              />
            );
          });
        })}
      </WithTicket>
    </>
  );
}

function LineupSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function LineupSearch({
  entries,
  names,
  failed,
  onAdd,
}: {
  entries: PlayerEntry[] | undefined;
  names: string[];
  failed: boolean;
  onAdd: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  // Suggestions are an invitation for an empty lineup; once there are players they only push the lineup down.
  const shown = entries && (searching || names.length === 0) ? searchPlayers(entries, query, names, RESULT_LIMIT) : [];
  const add = (name: string) => {
    onAdd(name);
    setQuery("");
  };

  const body = failed ? (
    <Notice>Player markets are unavailable right now. We will keep trying, or refresh in a minute.</Notice>
  ) : !entries ? (
    <div className="space-y-2">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  ) : entries.length === 0 ? (
    <Notice>No players have markets right now. They usually open a few hours before a game, so check back closer to kickoff.</Notice>
  ) : shown.length === 0 ? (
    searching ? <Notice>No player or team matches &ldquo;{query.trim()}&rdquo;. Check the spelling, or try a team name.</Notice> : null
  ) : (
    <>
      {!searching ? <p className="mb-1 text-[12px] text-muted-foreground/70">Players with markets right now</p> : null}
      <ul className="divide-y divide-border">
        {shown.map((entry) => (
          <li key={entry.player}>
            <button type="button" onClick={() => add(entry.player)} className="press flex w-full items-center justify-between gap-4 py-2.5 text-left">
              <span className="min-w-0">
                <span className="block text-[14px] font-medium">{entry.player}</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {entry.gameTitle} · {formatWhen(entry.startTime)}
                </span>
              </span>
              <span className="shrink-0 text-[13px] text-primary">Add</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <Card>
      <CardTitle hint={names.length > 0 ? `${names.length} in your lineup` : undefined}>Build your lineup</CardTitle>
      {names.length === 0 && entries?.length ? (
        <p className="mb-4 text-[14px] leading-relaxed text-muted-foreground">
          Start with anyone on your fantasy team. Search by name, or by a team that plays soon.
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (shown[0]) add(shown[0].player);
        }}
      >
        <input
          type="search"
          aria-label="Search players"
          placeholder={entries ? "Search a player or a team" : "Loading players"}
          value={query}
          disabled={!entries}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
        />
      </form>

      {body ? <div className="mt-3">{body}</div> : null}
    </Card>
  );
}
