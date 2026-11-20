"use client";

import { useMemo, useState } from "react";
import { PageHeader, Skeleton } from "@/components/kit";
import { exposures, indexExposure, INDEX, readHolding, type History } from "@/domains/exposure/portfolio";
import { buildScenarios, MAX_LEGS } from "@/domains/exposure/portfolio-scenarios";
import { isUnderlyingId, UNDERLYINGS, type EventMarket, type Ladder, type UnderlyingId } from "@/domains/markets/types";
import { useProfile } from "@/domains/profile/profile";
import { usePoll } from "@/lib/use-poll";
import { CushionAside } from "./cushion-aside";
import { HoldingsCard } from "./holdings-card";
import { ScenarioCard } from "./scenario-card";

const FACTORS = Object.keys(UNDERLYINGS) as UnderlyingId[];
const NO_HISTORY: History = {};

export default function PortfolioPage() {
  const { holdings } = useProfile();

  // A holding that is itself a listed coin or commodity needs no price history to be understood.
  const needsHistory = holdings.some((h) => !isUnderlyingId(h.symbol));
  const symbols = [...new Set([...FACTORS, INDEX, ...holdings.map((h) => h.symbol)])];
  const prices = usePoll<{ history: History }>(needsHistory ? `/api/prices?symbols=${symbols.join(",")}` : null);
  const history = needsHistory ? prices.data?.history : NO_HISTORY;
  const reading = needsHistory && !history && !prices.error;

  const reads = useMemo(() => (history ? holdings.map((h) => readHolding(h, history, FACTORS, true)) : []), [holdings, history]);
  const riding = useMemo(() => exposures(reads), [reads]);
  const index = useMemo(() => indexExposure(reads), [reads]);

  const ladders = usePoll<{ ladders: Ladder[] }>(riding.length > 0 ? "/api/markets/ladders" : null, 15_000);
  const events = usePoll<{ markets: EventMarket[] }>(index ? "/api/markets/events" : null, 60_000);
  const indexSpot = history?.[INDEX]?.at(-1)?.close ?? null;

  const scenarios = useMemo(
    () => buildScenarios({ exposures: riding, index, ladders: ladders.data?.ladders ?? [], events: events.data?.markets ?? [], indexSpot }),
    [riding, index, ladders.data, events.data, indexSpot],
  );

  // Until the person chooses, the biggest scenario is on, so the panel has a price to show.
  const [picked, setPicked] = useState<string[] | null>(null);
  const active = picked ?? scenarios.slice(0, 1).map((s) => s.id);
  const chosen = scenarios.filter((s) => active.includes(s.id));
  const legsUsed = chosen.reduce((sum, s) => sum + s.cushion.legs.length, 0);
  const toggle = (id: string) => setPicked(active.includes(id) ? active.filter((other) => other !== id) : [...active, id]);

  const marketsPending = (riding.length > 0 && !ladders.data && !ladders.error) || (index != null && !events.data && !events.error);
  const marketsDown = !marketsPending && ((riding.length > 0 && !ladders.data) || (index != null && !events.data));
  const loading = holdings.length > 0 && (reading || marketsPending);
  const empty = emptyState({
    holdings: holdings.length,
    historyDown: needsHistory && !history,
    marketsDown,
    covered: riding.length + (index ? 1 : 0),
    scenarios: scenarios.length,
  });

  return (
    <>
      <PageHeader title="Cushion your portfolio" lead="Pick the bad scenarios you want covered. Cushion prices each one against a live market." />
      <div className="flex flex-wrap items-start gap-6">
        <HoldingsCard holdings={holdings} reads={reads} reading={reading} />

        <section className="flex min-w-0 flex-[2_1_420px] flex-col gap-3">
          <h2 className="display mb-1 text-[20px] font-semibold tracking-[-0.01em]">What could go wrong</h2>
          {loading ? (
            <div className="flex flex-col gap-3" aria-hidden>
              <Skeleton className="h-[150px] rounded-[24px]" />
              <Skeleton className="h-[150px] rounded-[24px]" />
            </div>
          ) : empty ? (
            <p className="rounded-[24px] bg-card p-5 text-[15px] leading-relaxed text-body">{empty.list}</p>
          ) : (
            <div className="arrive flex flex-col gap-3">
              {scenarios.map((scenario) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  pressed={active.includes(scenario.id)}
                  blocked={legsUsed + scenario.cushion.legs.length > MAX_LEGS}
                  onToggle={() => toggle(scenario.id)}
                />
              ))}
            </div>
          )}
        </section>

        <CushionAside chosen={chosen} message={loading ? "Reading prices from Gemini…" : (empty?.aside ?? null)} />
      </div>
    </>
  );
}

function emptyState(s: { holdings: number; historyDown: boolean; marketsDown: boolean; covered: number; scenarios: number }) {
  if (s.holdings === 0) return { list: "Add a holding and Cushion will show what could go wrong for it.", aside: "Add a holding to see what a cushion would cost." };
  if (s.historyDown) return { list: "Price history is unavailable right now. Try again in a minute.", aside: "Nothing to cushion yet." };
  if (s.covered === 0) return { list: "Nothing you hold moves with a market Gemini lists, so there is nothing to cushion here.", aside: "Nothing to cushion yet." };
  if (s.marketsDown) return { list: "Gemini’s markets are not answering right now. This will try again in a moment.", aside: "Nothing to cushion yet." };
  if (s.scenarios === 0) return { list: "No market is open right now for what you hold. New ones are listed each day.", aside: "Nothing to cushion yet." };
  return null;
}
