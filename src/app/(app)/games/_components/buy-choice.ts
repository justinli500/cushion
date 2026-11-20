"use client";

import { useMemo, useState } from "react";
import { teamLossLegs } from "@/domains/cushion/legs";
import { chanceOf } from "@/domains/cushion/probability";
import type { Chance, Cushion } from "@/domains/cushion/types";
import type { Game, TeamSide } from "@/domains/markets/types";
import { useProfile } from "@/domains/profile/profile";
import { pickCopy, pickCushion, quoteIndex, type MarketPick } from "@/domains/replay/worth-markets";
import { lossCopy } from "@/domains/scores/names";
import { formatUsdWhole } from "@/lib/format";
import type { GameView } from "./view";

export const PRESETS = [10, 20, 50];
const MAX_PAYOUT = 1_000;

export interface BuyChoice {
  /** The team whose loss is cushioned, unless a market was picked instead. */
  team: TeamSide | null;
  /** The abbreviation of the person's saved team, when it is playing in this game. */
  savedHere: string | null;
  pickTeam(abbr: string): void;
  /** A Yes or No pressed on a market, which replaces the team choice until a team is picked again. */
  pick: MarketPick | null;
  pickMarket(pick: MarketPick | null): void;
  preset: number;
  typed: string;
  setPreset(amount: number): void;
  setTyped(text: string): void;
  payout: number;
  payoutOk: boolean;
  over: boolean;
  cushion: Cushion | null;
  title: string;
  detail: string;
  eventTickers: string[];
  expiry: string;
  chance: Chance | undefined;
  emptyMessage: string;
}

/**
 * What the person is about to cushion and for how much. Kept above the buy panel so the worth chart
 * can show what the same cushion would have been worth before it is bought.
 */
export function useBuyChoice(view: GameView, game: Game): BuyChoice {
  const saved = useProfile().team;
  const [picked, setPicked] = useState<string | null>(null);
  const [pick, setPick] = useState<MarketPick | null>(null);
  const [preset, setPresetState] = useState(20);
  const [typed, setTyped] = useState("");
  const { replay } = view;

  const savedHere = saved?.league === game.league && game.teams.some((t) => t.abbr === saved.abbr) ? saved.abbr : null;
  const rooting = picked ?? savedHere ?? (replay ? game.teams.find((t) => t.side === "home")!.abbr : null);
  const team = game.teams.find((t) => t.abbr === rooting) ?? null;

  const payout = typed === "" ? preset : Math.round(Number(typed));
  const payoutOk = Number.isFinite(payout) && payout >= 1 && payout <= MAX_PAYOUT;
  const over = view.score?.state === "final";

  const quotes = useMemo(() => quoteIndex(game, view.props), [game, view.props]);

  const cushion: Cushion | null = over || !payoutOk ? null : pick ? pickCushion(pick, payout) : team ? teamLossLegs(game, team.abbr, payout) : null;
  const copy = pick
    ? pickCopy(pick, payoutOk ? payout : 0)
    : team && payoutOk
      ? lossCopy(game, team.abbr, payout)
      : { title: "Loss cushion", detail: "Pays if the team you root for loses." };

  const leg = cushion?.legs[0];
  const quote = leg ? quotes.get(leg.symbol) : undefined;
  const chance = leg && quote ? chanceOf(quote, leg.side) : undefined;

  const emptyMessage = over
    ? replay
      ? "The game is over, and any cushion you added has settled in your account. Jump back to kickoff to play it again."
      : "This game is over. A cushion covers a game that is still going or still to come."
    : !pick && !team
      ? "Pick the team you are rooting for to see what a cushion costs."
      : !payoutOk
        ? `Choose a payout between $1 and ${formatUsdWhole(MAX_PAYOUT)}.`
        : pick
          ? "That market is closed right now. Pick another."
          : "Nobody is trading this game right now.";

  return {
    team,
    savedHere,
    pickTeam: (abbr) => {
      setPicked(abbr);
      setPick(null);
    },
    pick,
    pickMarket: setPick,
    preset,
    typed,
    setPreset: (amount) => {
      setPresetState(amount);
      setTyped("");
    },
    setTyped,
    payout,
    payoutOk,
    over,
    cushion,
    title: copy.title,
    detail: copy.detail,
    // A replay cushion has no live event behind it: the replay itself settles it.
    eventTickers: replay ? [] : [pick ? pick.market.eventTicker : game.eventTicker],
    expiry: pick ? pick.market.expiry : game.expiry,
    chance,
    emptyMessage,
  };
}
