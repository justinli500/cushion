"use client";

import { useCushionPurchase } from "@/components/cushion-ticket";
import { Button, Card, Notice, Skeleton, Tag } from "@/components/kit";
import type { Chance } from "@/domains/cushion/types";
import type { Suggestion } from "@/domains/exposure/business";
import { formatChance, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Ready = Extract<Suggestion, { status: "ready" }>;

export type CardState =
  | { kind: "loading" }
  /** No market to build this from today, or something still to choose on the left. */
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; suggestion: Ready };

const chanceText = (c: Chance) =>
  c.uncertain && c.low != null && c.high != null ? `${formatChance(c.low)} to ${formatChance(c.high)}` : formatChance(c.p);

function Money({ label, value, end = false, blue = false }: { label: string; value: string; end?: boolean; blue?: boolean }) {
  return (
    <div className={cn("flex flex-col", end && "items-end")}>
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("display tabular text-[26px] font-bold", blue && "text-covered")}>{value}</span>
    </div>
  );
}

const Arrow = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 18 18" fill="none" className="shrink-0 text-muted-foreground">
    <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One suggested cushion. It prices and buys itself, so each card is its own purchase. */
export function SuggestionCard({ title, why, state }: { title: string; why: string; state: CardState }) {
  const ready = state.kind === "ready" ? state.suggestion : null;
  const { quote, loading, error, canBuy, justBought, tooDear, buy } = useCushionPurchase({
    section: "business",
    title,
    detail: ready?.trigger ?? "",
    cushion: ready?.cushion ?? null,
    eventTickers: ready?.eventTickers ?? [],
    expiry: ready?.expiry ?? "",
  });
  const unsold = quote != null && quote.maxPayout === 0;
  const filled = quote?.legs.filter((l) => l.filled > 0) ?? [];

  return (
    <Card className="flex flex-col gap-4 p-[22px]">
      <div className="flex flex-col gap-1.5">
        {ready ? <span className="text-[13px] font-semibold text-risk">{ready.when}</span> : null}
        <h3 className="display text-[22px] font-semibold leading-[1.15] tracking-[-0.01em]">{title}</h3>
        <p className="text-[15px] text-body">{why}</p>
      </div>

      {state.kind === "unavailable" ? (
        <Notice>{state.reason}</Notice>
      ) : state.kind === "loading" || (!quote && loading) ? (
        <Skeleton className="h-[85px] w-full rounded-[18px]" />
      ) : !quote ? (
        <Notice>{error ?? "Gemini's order book is unavailable right now."}</Notice>
      ) : unsold ? (
        <Notice>Nobody is selling this cover on Gemini right now. Thin markets fill and empty through the day, so it may be back soon.</Notice>
      ) : (
        <div className="arrive flex items-center justify-between gap-3 rounded-[18px] bg-muted px-4 py-3.5">
          <Money label="You pay" value={formatUsd(quote.cost)} />
          <Arrow />
          <Money label="Pays" value={formatUsd(quote.maxPayout)} end blue />
        </div>
      )}

      {ready ? (
        <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
          <p>{ready.trigger}</p>
          <p className="flex flex-wrap items-center gap-2">
            Market&rsquo;s chance it pays: {chanceText(ready.chance)}
            {ready.chance.uncertain ? <Tag>Rough</Tag> : null}
          </p>
          {ready.risk.kind === "cost-rise" ? (
            <p className="flex flex-wrap items-center gap-2">
              <Tag>Estimate</Tag>
              It starts near where the market sees even odds, not at a quoted price.
            </p>
          ) : null}
          {ready.roughMatch ? (
            <p className="flex flex-wrap items-center gap-2">
              <Tag>Rough match</Tag>
              {ready.roughMatch}
            </p>
          ) : null}
          {quote?.partial && !unsold ? (
            <p>
              Only {formatUsd(quote.maxPayout)} of the {formatUsd(quote.requestedPayout)} is on offer right now. The market for this is thin.
            </p>
          ) : null}
          {filled.length > 0 ? (
            <details>
              <summary className="press cursor-pointer select-none hover:text-foreground">Under the hood</summary>
              <ul className="mt-2 space-y-1.5">
                {filled.map((leg) => (
                  <li key={`${leg.symbol}:${leg.side}`} className="tabular flex justify-between gap-3">
                    <span className="min-w-0 truncate">{leg.label}</span>
                    <span className="shrink-0 font-semibold text-foreground">
                      {leg.filled} × {leg.side === "yes" ? "Yes" : "No"} at {Math.round((leg.cost / leg.filled) * 100)}¢
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px]">Filled against Gemini&rsquo;s live order book. Exchange fees are not included. Play money: no real funds move.</p>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto">
        {justBought ? (
          <p className="arrive flex min-h-12 items-center justify-center rounded-full bg-yes px-5 text-center text-[15px] font-semibold text-yes-foreground">
            Cushion added. A receipt is being written on-chain.
          </p>
        ) : (
          <Button variant="dark" wide onClick={buy} disabled={!canBuy}>
            {tooDear ? "Not enough play money" : "Add this cushion"}
          </Button>
        )}
      </div>
    </Card>
  );
}
