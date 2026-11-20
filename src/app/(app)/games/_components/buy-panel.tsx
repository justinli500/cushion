"use client";

import { useMemo } from "react";
import { useCushionPurchase } from "@/components/cushion-ticket";
import { Button, Panel, Tile } from "@/components/kit";
import { TeamLogo } from "@/components/team-logo";
import { updateProfile } from "@/domains/profile/profile";
import { quietGames } from "@/domains/replay/worth-markets";
import type { Game } from "@/domains/markets/types";
import { teamLabel } from "@/domains/scores/names";
import { formatUsd } from "@/lib/format";
import { PRESETS, type BuyChoice } from "./buy-choice";
import { chanceText, MINI } from "./cushion-panel";
import type { GameView } from "./view";

const chip = (pressed: boolean) =>
  `press flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[14px] px-3 text-[14px] font-semibold ${pressed ? "bg-card text-foreground" : "bg-panel-tile text-white hover:bg-panel-track"}`;

/**
 * The dark panel when the person has no cushion on this game, or is adding one: who to cover, how
 * much it should pay, what it costs, and Buy. Prices and buys through the shared purchase hook.
 */
export function BuyPanel({ view, game, choice: c, onBack }: { view: GameView; game: Game; choice: BuyChoice; onBack?: () => void }) {
  const { replay } = view;
  const { quote, loading, error, nothingToBuy, canBuy, justBought, tooDear, buy } = useCushionPurchase({
    section: "games",
    title: c.title,
    detail: c.detail,
    cushion: c.cushion,
    eventTickers: c.eventTickers,
    expiry: c.expiry,
    replay: replay ? { id: replay.id, books: replay.books } : undefined,
  });
  const quiet = useMemo(() => quietGames(view.props), [view.props]);
  const quietKey = c.pick && c.pick.side === "no" && quiet.some((q) => q.market.key === c.pick!.market.key) ? c.pick.market.key : "";

  return (
    <Panel label="Cushion this game" className="gap-[18px]">
      {onBack ? (
        <button type="button" onClick={onBack} className="press -mt-2 self-start text-[13px] font-semibold text-covered-on-dark hover:text-white">
          &larr; Back to your cushion
        </button>
      ) : null}

      {c.over ? null : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-panel-foreground">Who are you rooting for?</span>
            <div className="grid grid-cols-2 gap-2">
              {game.teams.map((t) => (
                <button key={t.abbr} type="button" aria-pressed={!c.pick && t.abbr === c.team?.abbr} onClick={() => c.pickTeam(t.abbr)} className={chip(!c.pick && t.abbr === c.team?.abbr)}>
                  <TeamLogo src={t.contract.image} fallback={t.abbr} className="size-6" />
                  <span className="min-w-0 truncate">{teamLabel(game, t)}</span>
                </button>
              ))}
            </div>
            {!replay && !c.pick && c.team ? (
              c.savedHere === c.team.abbr ? (
                <p className="text-[12px] text-panel-foreground">Your team</p>
              ) : (
                <button
                  type="button"
                  onClick={() => updateProfile("team", { league: game.league, abbr: c.team!.abbr, name: c.team!.name })}
                  className="press self-start text-[12px] text-panel-foreground underline-offset-2 hover:text-white hover:underline"
                >
                  Make this my team
                </button>
              )
            ) : null}
          </div>

          {quiet.length > 0 ? (
            <select
              aria-label="Or cover a player's quiet game"
              value={quietKey}
              onChange={(e) => {
                const found = quiet.find((q) => q.market.key === e.target.value);
                if (found) c.pickMarket(found);
              }}
              className="press h-11 w-full min-w-0 rounded-[14px] border-0 bg-panel-tile px-3 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-covered-on-dark"
            >
              <option value="" disabled>
                Or a player&rsquo;s quiet game
              </option>
              {quiet.map((q) => (
                <option key={q.market.key} value={q.market.key}>
                  {q.market.no}
                </option>
              ))}
            </select>
          ) : null}

          {c.pick ? (
            <p className="rounded-[14px] bg-panel-tile px-3.5 py-2.5 text-[13px] leading-snug text-white">
              Covering: <span className="font-semibold">{c.title}</span>{" "}
              <button type="button" onClick={() => c.pickTeam(c.team?.abbr ?? game.teams[0].abbr)} className="press ml-1 text-covered-on-dark underline-offset-2 hover:underline">
                Clear
              </button>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-panel-foreground">{c.pick ? "How much it pays you" : "Pays you if they lose"}</span>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={c.typed === "" && c.preset === amount}
                  onClick={() => c.setPreset(amount)}
                  className={`press tabular min-h-9 rounded-full px-3.5 text-[14px] font-semibold ${c.typed === "" && c.preset === amount ? "bg-card text-foreground" : "bg-panel-tile text-white hover:bg-panel-track"}`}
                >
                  ${amount}
                </button>
              ))}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                value={c.typed}
                onChange={(e) => c.setTyped(e.target.value)}
                placeholder="Other"
                aria-label="Other payout in dollars"
                className="tabular h-9 w-24 rounded-full border-0 bg-panel-tile px-3.5 text-[14px] text-white outline-none placeholder:text-panel-foreground focus-visible:ring-2 focus-visible:ring-covered-on-dark"
              />
            </div>
          </div>
        </div>
      )}

      {nothingToBuy ? (
        <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed text-panel-foreground">{c.emptyMessage}</p>
      ) : !quote ? (
        loading ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-[52px] w-40 animate-pulse rounded-[14px] bg-panel-tile" />
            <div className="h-[76px] animate-pulse rounded-[18px] bg-panel-tile" />
          </div>
        ) : (
          <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed text-white">{error ?? "Gemini's order book is unavailable right now."}</p>
        )
      ) : quote.maxPayout === 0 ? (
        <p className="arrive rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed text-white">
          {replay
            ? "Nothing had traded on this yet at this point in the game, so there is nothing to buy."
            : "Nobody is selling this cover on Gemini right now. Thin markets fill and empty through the day, so it may be back soon."}
        </p>
      ) : (
        <div className="arrive flex flex-col gap-[18px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] text-panel-foreground">If it goes against you, you get up to</span>
            <span className="display tabular text-[52px] font-bold leading-none tracking-[-0.03em]">{formatUsd(quote.maxPayout)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Tile label="You pay" value={formatUsd(quote.cost)} tone="panel" className={MINI} />
            <Tile label="Chance it pays" value={chanceText(c.chance ?? null)} tone="panel" className={MINI} />
          </div>

          {quote.partial ? (
            <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[13px] leading-relaxed text-white">
              Only {formatUsd(quote.maxPayout)} of the {formatUsd(quote.requestedPayout)} you asked for is on offer. The market for this is thin.
            </p>
          ) : null}

          {justBought ? (
            <p className="arrive rounded-full bg-covered-on-dark px-5 py-3.5 text-center text-[15px] font-semibold text-panel">
              {replay ? "Cushion added. It settles when the game ends." : "Cushion added. A receipt is being written on-chain."}
            </p>
          ) : (
            <Button onClick={buy} disabled={!canBuy} variant="light" wide>
              {tooDear ? "Not enough play money" : "Buy this cushion"}
            </Button>
          )}

          <p className="text-[13px] text-panel-foreground">If it goes fine, you&rsquo;re out {formatUsd(quote.cost)} and nothing more. Play money: no real funds move.</p>

          <details className="text-[13px] text-panel-foreground">
            <summary className="press cursor-pointer select-none hover:text-white">Under the hood</summary>
            <ul className="mt-3 space-y-1.5">
              {quote.legs.map((leg) => (
                <li key={`${leg.symbol}:${leg.side}`} className="tabular flex justify-between gap-3">
                  <span className="truncate">{leg.label}</span>
                  <span className="shrink-0 font-semibold text-white">
                    {leg.filled} × {leg.side === "yes" ? "Yes" : "No"} at {leg.filled > 0 ? Math.round((leg.cost / leg.filled) * 100) : 0}¢
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px]">
              {replay
                ? "This game was played earlier. Filled at the last price that really traded at this point in it, plus a 1 cent spread. Exchange fees are not included."
                : "Filled against Gemini’s live order book. Exchange fees are not included."}
            </p>
          </details>
        </div>
      )}
    </Panel>
  );
}
