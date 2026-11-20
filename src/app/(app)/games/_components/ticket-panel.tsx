"use client";

import { useState } from "react";
import { CushionTicket } from "@/components/cushion-ticket";
import { TeamLogo } from "@/components/team-logo";
import { Card, CardTitle, Skeleton, Tag, inputClass } from "@/components/kit";
import { useAccount } from "@/domains/account/store";
import { teamLossLegs } from "@/domains/cushion/legs";
import { chanceOf } from "@/domains/cushion/probability";
import type { Cushion } from "@/domains/cushion/types";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { lossCopy, teamLabel } from "@/domains/scores/names";
import { valueNow } from "@/domains/replay/replay";
import { formatUsd, formatUsdWhole } from "@/lib/format";
import type { GameFeed } from "./feed";

const PRESETS = [10, 20, 50];
const MAX_PAYOUT = 1_000;

/** The cushion for the team the person is rooting for: who they pick, how much it pays, and the ticket to buy it. */
export function TicketPanel({ feed }: { feed: GameFeed }) {
  const { game, replay } = feed;
  const saved = useProfile().team;
  const [picked, setPicked] = useState<string | null>(null);
  const [preset, setPreset] = useState(20);
  const [typed, setTyped] = useState("");
  if (!game) return null;

  const savedHere = saved?.league === game.league && game.teams.some((t) => t.abbr === saved.abbr) ? saved.abbr : null;
  const rooting = picked ?? savedHere ?? (replay ? game.teams.find((t) => t.side === "home")!.abbr : null);
  const team = game.teams.find((t) => t.abbr === rooting);

  const payout = typed === "" ? preset : Math.round(Number(typed));
  const payoutOk = Number.isFinite(payout) && payout >= 1 && payout <= MAX_PAYOUT;
  const over = feed.score?.state === "final";

  const emptyMessage = over
    ? replay
      ? "The game is over, and any cushion you added has settled in your account. Jump back to kickoff to play it again."
      : "This game is over. A cushion covers a game that is still going or still to come."
    : !team
      ? "Pick the team you are rooting for to see what a cushion costs."
      : !payoutOk
        ? `Choose a payout between $1 and ${formatUsdWhole(MAX_PAYOUT)}.`
        : "Nobody is trading this game right now.";

  const cushion: Cushion | null = over || !team || !payoutOk ? null : teamLossLegs(game, team.abbr, payout);
  const copy = team && payoutOk ? lossCopy(game, team.abbr, payout) : { title: "Loss cushion", detail: "Pays if the team you root for loses." };
  const leg = cushion?.legs[0];
  const contract = game.teams.find((t) => t.contract.symbol === leg?.symbol)?.contract;
  const chance = leg && contract ? chanceOf(contract.quote, leg.side) : undefined;

  return (
    <div className="space-y-4">
      {over ? null : (
        <Card className="p-5">
          <p className="mb-2 text-[13px] font-medium text-muted-foreground">Who are you rooting for?</p>
          <div className="grid grid-cols-2 gap-2">
            {game.teams.map((t) => (
              <button
                key={t.abbr}
                type="button"
                aria-pressed={t.abbr === rooting}
                onClick={() => setPicked(t.abbr)}
                className={`press rounded-xl border px-3 py-2.5 text-left text-[14px] font-medium ${
                  t.abbr === rooting ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-foreground/30"
                }`}
              >
                <span className="flex items-center gap-2">
                  <TeamLogo src={t.contract.image} fallback={t.abbr} className="size-6" />
                  <span className="min-w-0 truncate">{teamLabel(game, t)}</span>
                </span>
              </button>
            ))}
          </div>
          {!replay && team ? (
            savedHere === team.abbr ? (
              <p className="mt-2 text-[12px] text-muted-foreground">Your team</p>
            ) : (
              <button
                type="button"
                onClick={() => updateProfile("team", { league: game.league, abbr: team.abbr, name: team.name })}
                className="press mt-2 text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Make this my team
              </button>
            )
          ) : null}

          <p className="mb-2 mt-5 text-[13px] font-medium text-muted-foreground">Pays you if they lose</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                aria-pressed={typed === "" && preset === amount}
                onClick={() => {
                  setPreset(amount);
                  setTyped("");
                }}
                className={`press tabular rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
                  typed === "" && preset === amount ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {formatUsdWhole(amount)}
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PAYOUT}
              step={1}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Other"
              aria-label="Other payout in dollars"
              className={`${inputClass} tabular w-24 !rounded-full !py-1.5 text-[13px]`}
            />
          </div>
        </Card>
      )}

      <CushionTicket
        section="games"
        title={over ? "Game over" : copy.title}
        detail={over ? "" : copy.detail}
        cushion={cushion}
        // A replay cushion has no live event behind it: the replay itself settles it.
        eventTickers={replay ? [] : [game.eventTicker]}
        expiry={game.expiry}
        chance={chance}
        emptyMessage={emptyMessage}
        replay={replay ? { id: replay.id, books: replay.books } : undefined}
      />
      {replay ? <MyCushions feed={feed} /> : null}
    </div>
  );
}

/** The cushions added during this game, each with what it would fetch at this moment of the game. */
function MyCushions({ feed }: { feed: GameFeed }) {
  const { positions } = useAccount();
  const { game, replay } = feed;
  if (!game || !replay) return null;
  const mine = positions.filter((p) => p.replay === replay.id);
  if (mine.length === 0) return null;

  return (
    <Card className="p-5">
      <CardTitle hint={`${mine.length} on this game`}>Your cushions</CardTitle>
      <ul className="space-y-3">
        {mine.map((p) => (
          <li key={p.id} className="arrive tabular flex items-start justify-between gap-4 text-[13px]">
            <span className="min-w-0">
              <span className="block font-medium">{p.title}</span>
              <span className="block text-muted-foreground">
                Cost {formatUsd(p.cost)}, pays {formatUsd(p.maxPayout)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              {p.payout == null ? (
                <>
                  <span className="block font-medium">{formatUsd(valueNow(p.legs, game))}</span>
                  <span className="block text-muted-foreground/70">worth now</span>
                </>
              ) : p.payout > 0 ? (
                <Tag tone="cushion">Paid {formatUsd(p.payout)}</Tag>
              ) : (
                <Tag tone="plain">Not needed</Tag>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TicketSkeleton() {
  return (
    <Card>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-5 w-full" />
      </div>
    </Card>
  );
}
