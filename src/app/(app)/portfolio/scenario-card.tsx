"use client";

import { useMemo } from "react";
import { Tag } from "@/components/kit";
import { priceCushion } from "@/domains/cushion/price";
import type { Scenario } from "@/domains/exposure/portfolio-scenarios";
import type { Book } from "@/domains/markets/types";
import { formatUsd, formatUsdWhole } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";

const BOOK_REFRESH_MS = 15_000;
const whole = (dollars: number) => formatUsd(dollars).replace(/\.00$/, "");

/** The scenario on the chart, in words. It prices its own legs, so the cost and payout beside it are what Gemini is offering right now. */
export function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const symbols = scenario.cushion.legs.map((l) => l.symbol);
  const books = usePoll<{ books: Record<string, Book> }>(`/api/book?symbols=${symbols.join(",")}`, BOOK_REFRESH_MS);
  const quote = useMemo(() => (books.data ? priceCushion(scenario.cushion, books.data.books) : null), [books.data, scenario.cushion]);
  const unsold = quote != null && quote.maxPayout === 0;

  return (
    <div className="flex flex-col gap-3.5 rounded-[24px] bg-card p-5">
      <span className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="text-[18px] font-semibold">{scenario.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-body">
            {scenario.hurts}
            {scenario.estimate ? <Tag>Estimate</Tag> : null}
          </span>
        </span>
      </span>

      <span className="tabular flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
        {scenario.protective ? (
          <span>
            You&rsquo;d lose about <strong className="text-risk">{formatUsdWhole(scenario.loss)}</strong>
          </span>
        ) : null}
        <span>
          {scenario.protective ? "Cushion costs" : "Costs"} <strong>{quote && !unsold ? whole(quote.cost) : books.error ? "n/a" : "…"}</strong>
        </span>
        <span>
          Pays <strong className="text-covered">{quote && !unsold ? whole(quote.maxPayout) : books.error ? "n/a" : "…"}</strong>
        </span>
      </span>

      <span className="text-[13px] leading-relaxed text-muted-foreground">{scenario.market}</span>

      {unsold ? (
        <span className="text-[13px] font-semibold text-body">Nobody is selling this cover on Gemini right now. It may be back soon.</span>
      ) : quote?.partial ? (
        <span className="text-[13px] font-semibold text-body">
          Thin market: only {whole(quote.maxPayout)} of the {whole(quote.requestedPayout)} needed is on offer.
        </span>
      ) : null}
    </div>
  );
}
