"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { buyCushion } from "@/domains/account/buy";
import type { Section } from "@/domains/account/ledger";
import { useAccount } from "@/domains/account/store";
import { priceCushion } from "@/domains/cushion/price";
import type { Chance, Cushion, CushionQuote } from "@/domains/cushion/types";
import type { Book } from "@/domains/markets/types";
import { formatChance, formatUsd } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { Button, CushionMeter, Panel, Tile } from "./kit";

export interface TicketProps {
  section: Section;
  /** What is being protected, e.g. "BTC cushion". */
  title: string;
  /** When it pays, in one plain sentence, e.g. "Pays if BTC closes under $62,000 today." */
  detail: string;
  /** Null while the page has nothing to quote yet. */
  cushion: Cushion | null;
  eventTickers: string[];
  expiry: string;
  /** The market's chance that this cushion pays anything. */
  chance?: Chance;
  /** Shown when `cushion` is null or has no legs: why there is nothing to buy. */
  emptyMessage?: string;
  /** Lets a page draw its own chart from the live quote. */
  onQuote?: (quote: CushionQuote | null) => void;
  /**
   * A recorded game run as live passes its own books and id: the cushion is then priced from that
   * game's prices at this moment instead of Gemini's live book, and settles when the game ends.
   */
  replay?: { id: string; books: Record<string, Book> };
  /**
   * What is at stake, so the panel can show how much of it the cushion covers:
   * `of` in dollars and `label` to finish the sentence "$40 of ...", e.g. "a $40 night out".
   */
  covers?: { of: number; label: string };
}

const BOOK_REFRESH_MS = 5_000;

export type PurchaseInput = Pick<TicketProps, "section" | "title" | "detail" | "cushion" | "eventTickers" | "expiry" | "onQuote" | "replay">;

/**
 * The one buy flow: prices a cushion against the live book (or a recorded game's prices) and books
 * a simulated fill. `CushionTicket` is its standard panel. A screen that needs its own layout around
 * the same numbers calls this hook and draws them itself, so nothing prices or buys any other way.
 */
export function useCushionPurchase({ section, title, detail, cushion, eventTickers, expiry, onQuote, replay }: PurchaseInput) {
  const { balance } = useAccount();
  const [boughtKey, setBoughtKey] = useState<string | null>(null);
  // In a recorded game the contract behind a cushion can change from one moment to the next, so the key
  // alone would drop the confirmation the instant it appears. It stays up for a few seconds either way.
  const [justNow, setJustNow] = useState(false);

  const symbols = cushion?.legs.map((l) => l.symbol) ?? [];
  const cushionKey = cushion ? cushion.legs.map((l) => `${l.symbol}:${l.side}:${l.quantity}`).join("|") : "";
  const bookUrl = symbols.length > 0 && !replay ? `/api/book?symbols=${symbols.join(",")}` : null;
  const polled = usePoll<{ books: Record<string, Book> }>(bookUrl, BOOK_REFRESH_MS);
  const data = replay ? { books: replay.books } : polled.data;

  // The key stands in for the cushion's contents, which pages rebuild on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quote = useMemo(() => (cushion && data ? priceCushion(cushion, data.books) : null), [cushionKey, data]);

  useEffect(() => {
    onQuote?.(quote);
    // onQuote is a page callback and may change identity freely; only a new quote should fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  const canBuy = quote != null && quote.maxPayout > 0 && quote.cost > 0 && quote.cost <= balance;

  const buy = () => {
    if (!quote || !canBuy) return;
    buyCushion({ section, title, detail, quote, eventTickers, expiry, replay: replay?.id });
    setBoughtKey(cushionKey);
    toast.success(`${title} added`, { description: `Costs ${formatUsd(quote.cost)}, pays up to ${formatUsd(quote.maxPayout)}.` });
    setJustNow(true);
    setTimeout(() => setJustNow(false), 4_000);
  };

  return {
    /** Null until the books have loaded, or when there is nothing to price. */
    quote,
    loading: polled.loading,
    error: polled.error,
    nothingToBuy: !cushion || cushion.legs.length === 0,
    canBuy,
    /** True for a few seconds after a purchase, and for as long as the same cushion stays selected. */
    justBought: justNow || (boughtKey === cushionKey && cushionKey !== ""),
    /** True when the quote costs more play money than is left. */
    tooDear: quote != null && quote.cost > balance,
    buy,
  };
}

/**
 * The dark summary panel: prices a cushion against the live book, says what it costs and pays in
 * insurance terms, and books a simulated fill. The market detail ("40 × No at 30¢") is one level
 * down, as a footnote.
 */
export function CushionTicket(props: TicketProps) {
  const { title, detail, chance, emptyMessage, replay, covers } = props;
  const { quote, loading, error, nothingToBuy, canBuy, justBought, tooDear, buy } = useCushionPurchase(props);

  const whole = (dollars: number) => formatUsd(dollars).replace(/\.00$/, "");

  return (
    <Panel label={title}>
      <p className="-mt-2 text-[14px] leading-relaxed text-panel-foreground">{detail}</p>

      {nothingToBuy ? (
        <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed text-panel-foreground">{emptyMessage ?? "Nothing to cushion yet."}</p>
      ) : !quote ? (
        loading ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-[52px] w-40 animate-pulse rounded-[14px] bg-panel-tile" />
            <div className="h-7 animate-pulse rounded-full bg-panel-tile" />
            <div className="h-[76px] animate-pulse rounded-[18px] bg-panel-tile" />
          </div>
        ) : (
          <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed text-white">{error ?? "Gemini's order book is unavailable right now."}</p>
        )
      ) : quote.maxPayout === 0 ? (
        // Nothing filled, so there is no cost or payout worth showing and nothing to buy.
        <p className="arrive rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed text-white">
          Nobody is selling this cover on Gemini right now. Thin markets fill and empty through the day, so it may be back soon.
        </p>
      ) : (
        <div className="arrive flex flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] text-panel-foreground">If it goes against you, you get up to</span>
            <span className="display tabular text-[52px] font-bold leading-none tracking-[-0.03em]">{formatUsd(quote.maxPayout)}</span>
          </div>

          {covers ? (
            <CushionMeter onDark value={`${whole(quote.maxPayout)} of ${covers.label}`} fraction={covers.of > 0 ? quote.maxPayout / covers.of : 0} />
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Tile label="You pay" value={formatUsd(quote.cost)} tone="panel" />
            <Tile
              label="Chance it pays"
              tone="panel"
              value={
                !chance
                  ? "n/a"
                  : chance.uncertain && chance.low != null && chance.high != null
                    ? `${formatChance(chance.low)}–${formatChance(chance.high)}`
                    : formatChance(chance.p)
              }
            />
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
                <li key={leg.symbol} className="tabular flex justify-between gap-3">
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
                : "Filled against Gemini\u2019s live order book. Exchange fees are not included."}
            </p>
          </details>
        </div>
      )}
    </Panel>
  );
}
