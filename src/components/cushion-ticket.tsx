"use client";

import { useEffect, useMemo, useState } from "react";
import { buyCushion } from "@/domains/account/buy";
import type { Section } from "@/domains/account/ledger";
import { useAccount } from "@/domains/account/store";
import { priceCushion } from "@/domains/cushion/price";
import type { Chance, Cushion, CushionQuote } from "@/domains/cushion/types";
import type { Book } from "@/domains/markets/types";
import { formatChance, formatUsd } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { Button, Skeleton, Tag } from "./ui";

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
}

const BOOK_REFRESH_MS = 5_000;

/** Prices a cushion against the live book and books a simulated fill. Every section uses this one. */
export function CushionTicket(props: TicketProps) {
  const { section, title, detail, cushion, eventTickers, expiry, chance, emptyMessage, onQuote } = props;
  const { balance } = useAccount();
  const [boughtKey, setBoughtKey] = useState<string | null>(null);

  const symbols = cushion?.legs.map((l) => l.symbol) ?? [];
  const cushionKey = cushion ? cushion.legs.map((l) => `${l.symbol}:${l.side}:${l.quantity}`).join("|") : "";
  const bookUrl = symbols.length > 0 ? `/api/book?symbols=${symbols.join(",")}` : null;
  const { data, error, loading } = usePoll<{ books: Record<string, Book> }>(bookUrl, BOOK_REFRESH_MS);

  // The key stands in for the cushion's contents, which pages rebuild on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quote = useMemo(() => (cushion && data ? priceCushion(cushion, data.books) : null), [cushionKey, data]);

  useEffect(() => {
    onQuote?.(quote);
    // onQuote is a page callback and may change identity freely; only a new quote should fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  const justBought = boughtKey === cushionKey && cushionKey !== "";
  const nothingToBuy = !cushion || cushion.legs.length === 0;
  const canBuy = quote != null && quote.maxPayout > 0 && quote.cost > 0 && quote.cost <= balance;

  const buy = () => {
    if (!quote || !canBuy) return;
    buyCushion({ section, title, detail, quote, eventTickers, expiry });
    setBoughtKey(cushionKey);
  };

  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <Tag tone="note">Simulated</Tag>
      </div>
      <p className="mb-5 text-[14px] leading-relaxed text-muted">{detail}</p>

      {nothingToBuy ? (
        <p className="rounded-xl bg-paper px-4 py-3 text-[14px] leading-relaxed text-muted">
          {emptyMessage ?? "Nothing to cushion yet."}
        </p>
      ) : !quote ? (
        loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : (
          <p className="rounded-xl bg-loss-soft px-4 py-3 text-[14px] text-loss">{error ?? "Gemini's order book is unavailable right now."}</p>
        )
      ) : (
        <div className="arrive">
          <dl className="space-y-3">
            <Row label="Costs">
              <span className="tabular text-[26px] font-semibold tracking-tight">{formatUsd(quote.cost)}</span>
            </Row>
            <Row label="Pays up to">
              <span className="tabular text-[17px] font-medium text-cushion">{formatUsd(quote.maxPayout)}</span>
            </Row>
            {chance ? (
              <Row label="Market's chance it pays">
                <span className="tabular text-[15px]">
                  {chance.uncertain && chance.low != null && chance.high != null
                    ? `${formatChance(chance.low)} to ${formatChance(chance.high)}`
                    : formatChance(chance.p)}
                  {chance.uncertain ? <span className="ml-2 align-middle"><Tag>Rough</Tag></span> : null}
                </span>
              </Row>
            ) : null}
          </dl>

          {quote.maxPayout === 0 ? (
            <p className="mt-4 rounded-xl bg-loss-soft px-4 py-3 text-[13px] leading-relaxed text-loss">
              Nobody is selling this cover on Gemini right now.
            </p>
          ) : quote.partial ? (
            <p className="mt-4 rounded-xl bg-note-soft px-4 py-3 text-[13px] leading-relaxed text-note">
              Only {formatUsd(quote.maxPayout)} of the {formatUsd(quote.requestedPayout)} you asked for is on offer. The market for this is thin.
            </p>
          ) : null}

          <div className="mt-5">
            {justBought ? (
              <p className="arrive rounded-xl bg-cushion-soft px-4 py-3 text-[14px] font-medium text-cushion">
                Cushion added. A receipt is being written on-chain.
              </p>
            ) : (
              <Button onClick={buy} disabled={!canBuy}>
                {quote.cost > balance ? "Not enough play money" : `Add cushion for ${formatUsd(quote.cost)}`}
              </Button>
            )}
          </div>

          <details className="mt-5 text-[13px] text-muted">
            <summary className="press cursor-pointer select-none hover:text-ink">
              {quote.legs.length === 1 ? "The contract behind it" : `The ${quote.legs.length} contracts behind it`}
            </summary>
            <ul className="mt-3 space-y-1.5">
              {quote.legs.map((leg) => (
                <li key={leg.symbol} className="tabular flex justify-between gap-3">
                  <span className="truncate">
                    {leg.side === "yes" ? "Yes" : "No"} on &ldquo;{leg.label}&rdquo;
                  </span>
                  <span className="shrink-0">
                    {leg.filled} for {formatUsd(leg.cost)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-faint">Filled against Gemini&rsquo;s live order book. Exchange fees are not included.</p>
          </details>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
