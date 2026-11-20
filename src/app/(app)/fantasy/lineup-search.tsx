"use client";

import { useState } from "react";
import { Card, CardTitle, inputClass, Notice, Skeleton } from "@/components/kit";
import { searchPlayers, type PlayerEntry } from "@/domains/exposure/fantasy";
import { formatWhen } from "@/lib/format";

const RESULT_LIMIT = 6;

/** Adds players to the lineup, from the players Gemini lists props for. */
export function LineupSearch({
  entries,
  names,
  failed,
  example = false,
  onAdd,
}: {
  entries: PlayerEntry[] | undefined;
  names: string[];
  failed: boolean;
  /** True while the example lineup is showing: the first player added starts the person's own. */
  example?: boolean;
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
      {!searching ? <p className="mb-1 text-[13px] text-muted-foreground">Players with markets right now</p> : null}
      <ul className="divide-y divide-border">
        {shown.map((entry) => (
          <li key={entry.player}>
            <button type="button" onClick={() => add(entry.player)} className="press flex min-h-11 w-full items-center justify-between gap-4 py-2 text-left">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{entry.player}</span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {entry.gameTitle} · {formatWhen(entry.startTime)}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-semibold text-covered">Add</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <Card className="rounded-[24px] px-[22px] py-[18px]">
      <CardTitle hint={!example && names.length > 0 ? `${names.length} in your lineup` : undefined}>{example ? "Use your own players" : "Add a player"}</CardTitle>
      {example ? <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">Search by name or team. Your first pick replaces the example.</p> : null}
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
