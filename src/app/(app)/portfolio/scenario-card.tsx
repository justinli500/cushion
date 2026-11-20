"use client";

import { useMemo } from "react";
import { Tag, ToggleCard, ToggleTag } from "@/components/kit";
import { priceCushion } from "@/domains/cushion/price";
import type { Scenario } from "@/domains/exposure/portfolio-scenarios";
import type { Book } from "@/domains/markets/types";
import { formatUsd, formatUsdWhole } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";

const BOOK_REFRESH_MS = 15_000;
const whole = (dollars: number) => formatUsd(dollars).replace(/\.00$/, "");

/** A scenario as a toggle card. It prices its own legs, so the cost and payout beside it are what Gemini is offering right now. */
export function ScenarioCard({ scenario, pressed, blocked, onToggle }: { scenario: Scenario; pressed: boolean; blocked: boolean; onToggle: () => void }) {
  const symbols = scenario.cushion.legs.map((l) => l.symbol);
  const books = usePoll<{ books: Record<string, Book> }>(`/api/book?symbols=${symbols.join(",")}`, BOOK_REFRESH_MS);
  const quote = useMemo(() => (books.data ? priceCushion(scenario.cushion, books.data.books) : null), [books.data, scenario.cushion]);
  const unsold = quote != null && quote.maxPayout === 0;
  // A card that is already chosen can always be taken off again.
  const disabled = !pressed && (unsold || blocked);

  return (
    <ToggleCard pressed={pressed} onToggle={onToggle} disabled={disabled}>
      <span className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="text-[18px] font-semibold">{scenario.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-body">
            {scenario.hurts}
            {scenario.estimate ? <Tag>Estimate</Tag> : null}
          </span>
        </span>
        <ToggleTag pressed={pressed} />
      </span>

      <span className="tabular flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
        <span>
          You&rsquo;d lose about <strong className="text-risk">{formatUsdWhole(scenario.loss)}</strong>
        </span>
        <span>
          Cushion costs <strong>{quote && !unsold ? whole(quote.cost) : books.error ? "n/a" : "…"}</strong>
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
      {blocked && !pressed ? <span className="text-[13px] font-semibold text-body">That is as many covers as this demo can price together. Take one off to add this.</span> : null}
    </ToggleCard>
  );
}
