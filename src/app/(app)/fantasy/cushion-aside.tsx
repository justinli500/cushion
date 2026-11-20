"use client";

import Link from "next/link";
import { Button, CushionMeter, Panel, Tile } from "@/components/kit";
import { useCushionPurchase, type PurchaseInput } from "@/components/cushion-ticket";
import { shortUsd } from "@/domains/exposure/fantasy-cushion";
import { formatUsd } from "@/lib/format";

const note = "rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed";

/**
 * The dark panel for the whole lineup: every covered player is one leg of one cushion, bought
 * together. Prices and buys through the same hook as the standard ticket.
 */
export function CushionAside({ input, stake, emptyMessage }: { input: PurchaseInput; stake: number; emptyMessage: string }) {
  const { quote, loading, error, nothingToBuy, canBuy, justBought, tooDear, buy } = useCushionPurchase(input);

  return (
    <Panel label="This week's cushion">
      {nothingToBuy ? (
        <p className={`${note} text-panel-foreground`}>{emptyMessage}</p>
      ) : !quote ? (
        loading ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-[52px] w-40 animate-pulse rounded-[14px] bg-panel-tile" />
            <div className="h-7 animate-pulse rounded-full bg-panel-tile" />
            <div className="h-[76px] animate-pulse rounded-[18px] bg-panel-tile" />
          </div>
        ) : (
          <p className={`${note} text-white`}>{error ?? "Gemini's order book is unavailable right now."}</p>
        )
      ) : quote.maxPayout === 0 ? (
        <p className={`arrive ${note} text-white`}>Nobody is selling this cover on Gemini right now. Thin markets fill and empty through the day, so it may be back soon.</p>
      ) : (
        <div className="arrive flex flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] text-panel-foreground">If your covered players flop, you get up to</span>
            <span className="display tabular text-[52px] font-bold leading-none tracking-[-0.03em]">{shortUsd(quote.maxPayout)}</span>
          </div>

          <CushionMeter onDark value={`${shortUsd(quote.maxPayout)} of ${shortUsd(stake)}`} fraction={quote.maxPayout / stake} />

          <div className="grid grid-cols-2 gap-3">
            <Tile label="You pay" value={formatUsd(quote.cost)} tone="panel" />
            <Tile label="Players covered" value={quote.legs.filter((l) => l.filled > 0).length} tone="panel" />
          </div>

          {quote.partial ? (
            <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[13px] leading-relaxed text-white">
              Only {formatUsd(quote.maxPayout)} of the {formatUsd(quote.requestedPayout)} you asked for is on offer. The market for some of these is thin.
            </p>
          ) : null}

          {justBought ? (
            <p className="arrive rounded-full bg-covered-on-dark px-5 py-3.5 text-center text-[15px] font-semibold text-panel">Cushion added. A receipt is being written on-chain.</p>
          ) : (
            <Button onClick={buy} disabled={!canBuy} variant="light" wide>
              {tooDear ? "Not enough play money" : "Buy this cushion"}
            </Button>
          )}
        </div>
      )}

      <Link href="/games" className="press inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-white underline underline-offset-4">
        Watch the games with it
      </Link>

      {quote && quote.maxPayout > 0 ? (
        <>
          <p className="text-[13px] text-panel-foreground">If your players do fine, you&rsquo;re out {formatUsd(quote.cost)} and nothing more. Play money: no real funds move.</p>

          <details className="text-[13px] text-panel-foreground">
            <summary className="press cursor-pointer select-none hover:text-white">Under the hood</summary>
            <ul className="mt-3 space-y-1.5">
              {quote.legs.map((leg) => (
                <li key={leg.symbol} className="tabular flex justify-between gap-3">
                  <span className="truncate">{leg.label}</span>
                  <span className="shrink-0 font-semibold text-white">
                    {leg.filled} × {leg.side === "yes" ? "Yes" : "No"} at {leg.filled > 0 ? Math.round((leg.cost / leg.filled) * 100) : 0}¢
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px]">Filled against Gemini&rsquo;s live order book. Exchange fees are not included.</p>
          </details>
        </>
      ) : null}
    </Panel>
  );
}
