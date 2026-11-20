"use client";

import Link from "next/link";
import { Button, Tile } from "@/components/kit";
import { useCushionPurchase } from "@/components/cushion-ticket";
import { PAYOUT, tradeCopy, tradeCushion, type TradeItem } from "@/domains/feed/news";
import type { Side } from "@/domains/markets/types";
import { formatUsd, formatUsdWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What opens under a Yes/No pair once a side is pressed: what it costs against Gemini's live book,
 * what it pays, and a Buy button. Mounting it is what starts pricing, so a card nobody pressed
 * never asks for a book.
 */
export function BuyStrip({ item, side, onClose, onDark = false }: { item: TradeItem; side: Side; onClose: () => void; onDark?: boolean }) {
  const { title, detail } = tradeCopy(item, side);
  const { quote, loading, error, canBuy, justBought, tooDear, buy } = useCushionPurchase({
    section: item.section,
    title,
    detail,
    cushion: tradeCushion(item, side),
    eventTickers: [item.eventTicker],
    expiry: item.expiry,
  });

  const answer = side === "yes" ? "Yes" : "No";
  const muted = onDark ? "text-panel-foreground" : "text-muted-foreground";
  const leg = quote?.legs[0];

  return (
    <div className={cn("arrive flex flex-col gap-3 rounded-[18px] p-4", onDark ? "bg-panel-tile" : "bg-muted")}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("text-[13px] font-semibold", muted)}>
          {answer} on {item.label ?? item.headline}
        </span>
        <button type="button" onClick={onClose} className={cn("press min-h-6 shrink-0 text-[13px] font-semibold underline underline-offset-2", muted)}>
          Close
        </button>
      </div>

      {!quote ? (
        loading ? (
          <div className="h-[92px] animate-pulse rounded-[18px] bg-track/60" aria-hidden />
        ) : (
          <p className={cn("text-[14px] leading-relaxed", onDark ? "text-white" : "text-body")}>{error ?? "Gemini's order book is unavailable right now."}</p>
        )
      ) : quote.maxPayout === 0 ? (
        <p className={cn("text-[14px] leading-relaxed", onDark ? "text-white" : "text-body")}>
          Nobody is selling {answer} on this right now. Thin markets fill and empty through the day, so it may be back soon.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="You pay" value={formatUsd(quote.cost)} tone={onDark ? "ink" : "light"} />
            <Tile label="Pays if right" value={formatUsdWhole(quote.maxPayout)} tone="ink" />
          </div>
          {quote.partial ? (
            <p className={cn("text-[13px] leading-relaxed", muted)}>
              Only {formatUsd(quote.maxPayout)} of the {formatUsdWhole(PAYOUT)} is on offer. The market for this is thin.
            </p>
          ) : null}
          {justBought ? (
            <p className="arrive rounded-full bg-primary px-5 py-3.5 text-center text-[15px] font-semibold text-primary-foreground">
              Added.{" "}
              <Link href="/account" className="underline underline-offset-2">
                See it in your account
              </Link>
            </p>
          ) : (
            <Button onClick={buy} disabled={!canBuy} variant={onDark ? "light" : "primary"} wide>
              {tooDear ? "Not enough play money" : "Buy"}
            </Button>
          )}
          <p className={cn("text-[12px] leading-relaxed", muted)}>
            Play money. If it lands the other way you are out {formatUsd(quote.cost)} and nothing more.
            {leg && leg.filled > 0 ? ` Filled ${leg.filled} × ${answer} at ${Math.round((leg.cost / leg.filled) * 100)}¢.` : ""}
          </p>
        </>
      )}
    </div>
  );
}
