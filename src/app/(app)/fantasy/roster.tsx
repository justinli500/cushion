"use client";

import { useState } from "react";
import { Card, Skeleton, Tag } from "@/components/kit";
import { initials } from "@/domains/exposure/fantasy-cushion";
import { cn } from "@/lib/utils";

/** A player's picture in a circle, or his initials when ESPN has none or it fails to load. Decorative: the name is always beside it. */
export function Face({ name, src, className, covered = false }: { name: string; src: string | null | undefined; className?: string; covered?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span aria-hidden className={cn("relative grid size-12 shrink-0 place-items-center rounded-full bg-accent", covered && "ring-[3px] ring-primary", className)}>
      {src && failed !== src ? (
        // A plain <img>: small pictures on ESPN's own image host, not worth routing through this app's optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="size-full rounded-full object-cover object-top" />
      ) : (
        <span className="display text-[15px] font-bold text-foreground">{initials(name)}</span>
      )}
    </span>
  );
}

export interface RosterRow {
  key: string;
  name: string;
  /** The slot: "QB", "FLEX", or empty when the position is not known. */
  slot: string;
  /** "ATL · Sun 1:00 PM". */
  sub: string;
  headshot: string | null | undefined;
  covered: boolean;
  /** Why this player cannot be covered, when he cannot: "No market", "Finished". */
  blocked: string | null;
}

interface Props {
  /** Undefined while the players load. */
  rows: RosterRow[] | undefined;
  selected: string | null;
  onSelect: (key: string) => void;
  /** Puts a cushion on the player, or takes it off. */
  onToggle: (key: string) => void;
  /** True when this is the example lineup, not the person's own. */
  example: boolean;
}

/** The lineup as a roster: one row per slot. Choosing a player opens the ways to cushion him; his tick puts the cushion on or takes it off. */
export function Roster({ rows, selected, onSelect, onToggle, example }: Props) {
  return (
    <Card className="rounded-[24px] p-[18px]">
      <div className="mb-1 flex items-center justify-between gap-3 px-1">
        <h2 className="display text-[20px] font-semibold tracking-[-0.01em]">{example ? "Example lineup" : "Your lineup"}</h2>
        {example ? <Tag>Example</Tag> : null}
      </div>
      <p className="mb-3 px-1 text-[13px] leading-relaxed text-muted-foreground">
        {example ? "Real players with markets this week. Pick one to see how to cushion him." : "Pick a player to see how to cushion him."}
      </p>

      {!rows ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[64px] w-full rounded-[18px]" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.key}
              className={cn("flex items-center rounded-[18px] border-2 pr-1", row.key === selected ? "border-foreground bg-muted" : "border-transparent hover:bg-muted")}
            >
              <button
                type="button"
                aria-pressed={row.key === selected}
                onClick={() => onSelect(row.key)}
                className="press flex min-h-[64px] min-w-0 flex-1 items-center gap-3 rounded-[16px] px-2.5 py-2 text-left"
              >
                <span className="display grid h-9 w-[50px] shrink-0 place-items-center rounded-[12px] bg-foreground text-[13px] font-bold tracking-[0.02em] text-background">
                  {row.slot || "–"}
                </span>
                <Face name={row.name} src={row.headshot} covered={row.covered} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[16px] font-semibold">{row.name}</span>
                  <span className="truncate text-[13px] text-muted-foreground">{row.sub}</span>
                </span>
                {row.blocked ? <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">{row.blocked}</span> : null}
              </button>
              {row.blocked ? null : (
                // Its own button beside the row's, since a button cannot sit inside another. 44px to press, 28px to look at.
                <button
                  type="button"
                  aria-pressed={row.covered}
                  aria-label={`Cushion ${row.name}`}
                  title={row.covered ? "Cushioned. Press to take it off." : "Press to cushion him."}
                  onClick={() => onToggle(row.key)}
                  className="press grid size-11 shrink-0 place-items-center rounded-full"
                >
                  <span className={cn("grid size-7 place-items-center rounded-full", row.covered ? "bg-primary text-primary-foreground" : "border-2 border-border text-transparent")}>
                    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7.5l2.6 2.6L11 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
