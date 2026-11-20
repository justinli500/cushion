"use client";

import type { ReactNode } from "react";
import { Skeleton, Tag } from "@/components/ui";
import type { Chance, CushionQuote } from "@/domains/cushion/types";
import { formatChance, formatUsd } from "@/lib/format";

export type CardState =
  | { kind: "loading" }
  /** No market to build this from today. */
  | { kind: "unavailable"; reason: string }
  /** Built, but nobody is selling any of it. */
  | { kind: "thin" }
  | { kind: "ready"; quote: CushionQuote; trigger: string; chance: Chance; estimate: boolean };

const chanceText = (c: Chance) =>
  c.uncertain && c.low != null && c.high != null ? `${formatChance(c.low)} to ${formatChance(c.high)}` : formatChance(c.p);

export function SuggestionCard({ title, why, state, selected, onSelect }: { title: string; why: string; state: CardState; selected: boolean; onSelect: () => void }) {
  const head = (
    <>
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-[16px] font-semibold tracking-tight">{title}</span>
        {state.kind === "ready" ? (
          selected ? <Tag tone="cushion">Chosen</Tag> : <span className="text-[13px] text-muted">Choose</span>
        ) : state.kind === "unavailable" ? (
          <Tag tone="plain">Not today</Tag>
        ) : state.kind === "thin" ? (
          <Tag tone="note">Too thin</Tag>
        ) : null}
      </span>
      <span className="mt-1 block text-[14px] leading-relaxed text-muted">&ldquo;{why}&rdquo;</span>
    </>
  );

  if (state.kind === "ready") {
    const { quote, trigger, chance, estimate } = state;
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`press arrive block w-full rounded-2xl border bg-card p-5 text-left ${selected ? "border-cushion" : "border-line hover:border-faint"}`}
      >
        {head}
        <span className="mt-3 block text-[14px] leading-relaxed">{trigger}</span>
        {estimate ? (
          <span className="mt-1.5 flex items-center gap-2 text-[12px] text-faint">
            <Tag>Estimate</Tag>
            It starts near where the market sees even odds, not at a quoted price.
          </span>
        ) : null}
        <span className="mt-4 grid grid-cols-3 gap-4 border-t border-line pt-4">
          <Stat label="Costs now">
            <span className="text-[20px] font-semibold tracking-tight">{formatUsd(quote.cost)}</span>
          </Stat>
          <Stat label="Pays up to">
            <span className="text-[20px] font-semibold tracking-tight text-cushion">{formatUsd(quote.maxPayout)}</span>
          </Stat>
          <Stat label="Market's chance it pays">
            <span className="text-[15px]">
              {chanceText(chance)}
              {chance.uncertain ? (
                <span className="ml-2 align-middle">
                  <Tag>Rough</Tag>
                </span>
              ) : null}
            </span>
          </Stat>
        </span>
        {quote.partial ? (
          <span className="mt-3 block rounded-xl bg-note-soft px-4 py-2.5 text-[13px] leading-relaxed text-note">
            Only {formatUsd(quote.maxPayout)} of the {formatUsd(quote.requestedPayout)} is on offer right now. The market for this is thin.
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      {head}
      <div className="mt-3">
        {state.kind === "loading" ? (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <p className="rounded-xl bg-paper px-4 py-3 text-[14px] leading-relaxed text-muted">
            {state.kind === "thin" ? "The market for this is too thin right now. Nobody is selling this cover, so there is nothing to buy yet." : state.reason}
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="tabular block">
      <span className="mb-1 block text-[12px] text-muted">{label}</span>
      {children}
    </span>
  );
}
