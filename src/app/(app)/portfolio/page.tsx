"use client";

import { useMemo, useState } from "react";
import { Button, Card, Chip, PageHeader, Skeleton } from "@/components/kit";
import { exposures, indexExposure, INDEX, readHolding, type History, type Holding } from "@/domains/exposure/portfolio";
import { buildScenarios, type Starts } from "@/domains/exposure/portfolio-scenarios";
import { isUnderlyingId, UNDERLYINGS, type EventMarket, type Ladder, type UnderlyingId } from "@/domains/markets/types";
import { useProfile } from "@/domains/profile/profile";
import { formatLevel, formatPrice } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { CushionAside } from "./cushion-aside";
import { HoldingsCard } from "./holdings-card";
import { LevelChart } from "./level-chart";
import { ScenarioCard } from "./scenario-card";

const FACTORS = Object.keys(UNDERLYINGS) as UnderlyingId[];
const NO_HISTORY: History = {};
/** Shown until the person adds a holding of their own, so the chart is there to try straight away. */
const EXAMPLE: Holding[] = [
  { symbol: "BTC", value: 2000 },
  { symbol: "ETH", value: 1000 },
  { symbol: "NVDA", value: 1500 },
];
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export default function PortfolioPage() {
  const own = useProfile().holdings;
  const isExample = own.length === 0;
  const holdings = isExample ? EXAMPLE : own;

  // A holding that is itself a listed coin or commodity needs no price history to be understood.
  const needsHistory = holdings.some((h) => !isUnderlyingId(h.symbol));
  const symbols = [...new Set([...FACTORS, INDEX, ...holdings.map((h) => h.symbol)])];
  // The chart draws history for every scenario, so it is fetched even when no holding needs it to be understood.
  const prices = usePoll<{ history: History }>(holdings.length > 0 ? `/api/prices?symbols=${symbols.join(",")}` : null);
  const history = prices.data?.history ?? (needsHistory ? undefined : NO_HISTORY);
  const reading = needsHistory && !history && !prices.error;

  const reads = useMemo(() => (history ? holdings.map((h) => readHolding(h, history, FACTORS, true)) : []), [holdings, history]);
  const riding = useMemo(() => exposures(reads), [reads]);
  const index = useMemo(() => indexExposure(reads), [reads]);

  const ladders = usePoll<{ ladders: Ladder[] }>(riding.length > 0 ? "/api/markets/ladders" : null, 15_000);
  const events = usePoll<{ markets: EventMarket[] }>(index ? "/api/markets/events" : null, 60_000);
  const indexSpot = history?.[INDEX]?.at(-1)?.close ?? null;

  // Where the person has dragged each scenario's cover to start.
  const [starts, setStarts] = useState<Starts>({});
  const scenarios = useMemo(() => {
    const input = { exposures: riding, index, ladders: ladders.data?.ladders ?? [], events: events.data?.markets ?? [], indexSpot };
    // Listed biggest loss first as each stands before anything is moved, so dragging a level never reorders them.
    const order = buildScenarios(input).map((s) => s.id);
    return buildScenarios(input, starts).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [riding, index, ladders.data, events.data, indexSpot, starts]);
  const [shownId, setShownId] = useState<string | null>(null);
  // The chart opens on the asset with the most levels to move the line between.
  const richest = scenarios.reduce<(typeof scenarios)[number] | undefined>((best, s) => (!best || s.chart.levels.length > best.chart.levels.length ? s : best), undefined);
  const shown = scenarios.find((s) => s.id === shownId) ?? richest ?? scenarios[0];
  // How far the nearest level on the cushion's side is from the price. Some markets list nothing close.
  const nearest = shown ? (shown.chart.falling ? Math.max(...shown.chart.fall) : Math.min(...shown.chart.rise)) : NaN;
  const distance = shown && Number.isFinite(nearest) ? Math.abs(shown.chart.spot - nearest) / shown.chart.spot : 0;
  // Where the line goes when switching between a fall and a rise: the first level past the price on the other side. An index market lists one side only.
  const across = shown ? (shown.chart.falling ? shown.chart.rise : shown.chart.fall) : [];
  const past = across.filter((level) => (shown.chart.falling ? level >= shown.chart.spot : level < shown.chart.spot));
  const flip = across.length === 0 ? null : shown.chart.falling ? Math.min(...(past.length ? past : across)) : Math.max(...(past.length ? past : across));


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
      <PageHeader title="Cushion your portfolio" lead="Pick what worries you, then drag the line on its chart to where your cushion should start paying. Cushion prices it against a live market." />
      <div className="flex flex-wrap items-start gap-6">
        <HoldingsCard holdings={holdings} reads={reads} reading={reading} example={isExample} />

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
              <div role="group" aria-label="Choose what to look at" className="flex flex-wrap gap-2">
                {scenarios.map((scenario) => (
                  <Chip key={scenario.id} pressed={scenario.id === shown.id} onClick={() => setShownId(scenario.id)}>
                    {sentence(scenario.chart.name)}
                  </Chip>
                ))}
              </div>

              <Card className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="display text-[20px] font-semibold tracking-[-0.01em]">
                    {sentence(shown.chart.name)}, and where your cushion starts
                  </h3>
                  <span className="tabular text-[14px] text-body">
                    {shown.protective ? "Cover starts" : "Pays"} {shown.chart.falling ? "under" : "over"}{" "}
                    <strong className="text-covered">{(shown.chart.unit === "index" ? formatLevel : formatPrice)(shown.chart.start)}</strong>
                  </span>
                </div>
                <LevelChart
                  history={history ? (history[shown.chart.symbol] ?? []) : undefined}
                  chart={shown.chart}
                  until={day.format(new Date(shown.expiry))}
                  onStart={(level, falling) => setStarts((previous) => ({ ...previous, [shown.id]: { level, falling } }))}
                />
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Each dashed line is a level Gemini lists a market at. Drag the blue line nearer to or further from the price to choose where your
                  cushion starts paying; further costs less. The beige band is the move before it pays. The band beyond the line is where it pays: red for a fall, green for a rise.
                  {flip != null ? ` It pays on a ${shown.chart.falling ? "fall" : "rise"} and stays that way as you drag. To switch, double-click the chart and move above or below the price, or use the button.` : ""}
                </p>
                {distance > 0.05 ? (
                  <p className="rounded-[18px] bg-muted px-4 py-3 text-[14px] leading-relaxed text-body">
                    The nearest level this market still lists is {(shown.chart.unit === "index" ? formatLevel : formatPrice)(nearest)}, about{" "}
                    {Math.round(distance * 100)}% {shown.chart.falling ? "under" : "over"} the price. Nothing closer is on offer, so this cushion only starts
                    paying after a move that large.
                  </p>
                ) : null}
                {flip != null ? (
                  <div>
                    <Button variant="quiet" onClick={() => setStarts((previous) => ({ ...previous, [shown.id]: { level: flip, falling: !shown.chart.falling } }))}>
                      Pay on a {shown.chart.falling ? "rise" : "fall"} instead
                    </Button>
                  </div>
                ) : null}
              </Card>

              <ScenarioCard key={shown.id} scenario={shown} />
            </div>
          )}
        </section>

        {/* The panel follows the asset on the chart: its loss, and the cushion the line is set to. */}
        <CushionAside
          chosen={shown ? [shown] : []}
          label={!shown ? "If it goes wrong" : shown.protective ? `If ${shown.chart.name} goes wrong` : `If ${shown.chart.name} ${shown.chart.falling ? "falls" : "climbs"}`}
          message={loading ? "Reading prices from Gemini…" : (empty?.aside ?? null)}
        />
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
