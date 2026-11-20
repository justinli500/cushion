"use client";

import { useMemo, useState } from "react";
import { CushionTicket } from "@/components/cushion-ticket";
import { PayoffChart, type PayoffPoint } from "@/components/payoff-chart";
import { Card, CardTitle, Notice, PageHeader, Skeleton, Tag, WithTicket } from "@/components/kit";
import { filledLegs } from "@/domains/cushion/price";
import { stripLegs, stripPayoutAt } from "@/domains/cushion/legs";
import { chanceAtOrAbove, impliedSpot } from "@/domains/cushion/probability";
import type { Chance, CushionQuote } from "@/domains/cushion/types";
import { exposures, readHolding, type Exposure, type History, type HoldingRead } from "@/domains/exposure/portfolio";
import { UNDERLYINGS, type Ladder, type UnderlyingId } from "@/domains/markets/types";
import { useProfile } from "@/domains/profile/profile";
import { formatPrice, formatUsdWhole, formatWhen } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { HoldingsEditor } from "./holdings-editor";

const FACTORS = Object.keys(UNDERLYINGS) as UnderlyingId[];
const START_AFTER = [0, 0.01, 0.02, 0.03];

export default function PortfolioPage() {
  const { holdings } = useProfile();
  const symbols = [...new Set([...FACTORS, ...holdings.map((h) => h.symbol)])];
  const prices = usePoll<{ history: History }>(holdings.length > 0 ? `/api/prices?symbols=${symbols.join(",")}` : null);
  const ladders = usePoll<{ ladders: Ladder[] }>("/api/markets/ladders", 15_000);

  const reads = useMemo(
    () => (prices.data ? holdings.map((h) => readHolding(h, prices.data!.history, FACTORS)) : []),
    [holdings, prices.data],
  );
  const riding = useMemo(() => exposures(reads), [reads]);

  const [chosen, setChosen] = useState<UnderlyingId | null>(null);
  const [monthEnd, setMonthEnd] = useState(false);
  const [startAfter, setStartAfter] = useState(0.01);
  const [quote, setQuote] = useState<CushionQuote | null>(null);

  const exposure = riding.find((e) => e.underlying === chosen) ?? riding[0] ?? null;
  const dated = (ladders.data?.ladders ?? [])
    // The route only returns markets Gemini still lists as active, so nothing here has expired.
    .filter((l) => l.horizon === "dated" && l.underlying === exposure?.underlying)
    .sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry));
  const ladder = dated.length === 0 ? null : monthEnd ? dated[dated.length - 1] : dated[0];
  const plan = exposure && ladder ? planCushion(exposure, ladder, startAfter) : null;

  const points = useMemo(
    () => (plan && exposure && ladder ? payoffPoints(exposure, ladder, plan.spot, quote) : []),
    // The ladder object is rebuilt on every poll; its ticker and the quote are what change the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exposure?.underlying, exposure?.dollars, ladder?.eventTicker, plan?.spot, quote],
  );

  const name = exposure ? UNDERLYINGS[exposure.underlying].name : "";
  const falling = (exposure?.dollars ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Portfolio"
        lead="Tell Cushion what you hold. It works out what that is really riding on, and what it costs to soften a bad day."
      />
      <WithTicket
        ticket={
          <CushionTicket
            section="portfolio"
            title={exposure ? `${name} cushion` : "Portfolio cushion"}
            detail={
              plan?.first != null && ladder
                ? `Pays in steps as ${name} closes ${falling ? "below" : "above"} ${formatPrice(plan.first)} on ${formatWhen(ladder.expiry)}. The further it goes, the more it pays.`
                : "Add what you hold to see what a cushion would cost."
            }
            cushion={plan?.cushion ?? null}
            eventTickers={ladder ? [ladder.eventTicker] : []}
            expiry={ladder?.expiry ?? ""}
            chance={plan?.chance}
            emptyMessage={
              holdings.length === 0
                ? "Add a holding to get started."
                : !exposure
                  ? "Nothing you hold moves with a market Gemini lists, so there is nothing to cushion here."
                  : !ladder
                    ? `No ${name} market is open right now. New ones are listed each day.`
                    : `Gemini lists no ${name} prices ${falling ? "that low" : "that high"} right now. Try starting the cover sooner.`
            }
            onQuote={setQuote}
          />
        }
      >
        <Card>
          <CardTitle>What do you hold?</CardTitle>
          <HoldingsEditor holdings={holdings} />
        </Card>

        {holdings.length > 0 ? (
          <Card>
            <CardTitle hint={prices.loading ? "Reading price history" : undefined}>What it is riding on</CardTitle>
            {prices.loading ? (
              <div className="space-y-3">
                <Skeleton />
                <Skeleton className="h-5 w-2/3" />
              </div>
            ) : prices.error && !prices.data ? (
              <Notice>Price history is unavailable right now. Try again in a minute.</Notice>
            ) : (
              <ul className="arrive space-y-3">
                {reads.map((read) => (
                  <li key={read.symbol} className="flex items-baseline justify-between gap-6 text-[14px]">
                    <span className="tabular shrink-0 font-medium">
                      {read.symbol} <span className="font-normal text-muted-foreground">{formatUsdWhole(read.value)}</span>
                    </span>
                    <span className="text-right text-muted-foreground">{describe(read)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {riding.length > 0 ? (
          <Card>
            <CardTitle>Choose what to cushion</CardTitle>
            <div className="flex flex-wrap gap-2">
              {riding.map((e) => (
                <button
                  key={e.underlying}
                  type="button"
                  onClick={() => setChosen(e.underlying)}
                  className={`press tabular rounded-xl border px-4 py-3 text-left ${
                    e.underlying === exposure?.underlying ? "border-primary bg-primary/10" : "border-border hover:border-foreground/30"
                  }`}
                >
                  <span className="block text-[13px] text-muted-foreground">{UNDERLYINGS[e.underlying].name}</span>
                  <span className="block text-[17px] font-semibold tracking-tight">{formatUsdWhole(Math.abs(e.dollars))}</span>
                  <span className="block text-[12px] text-muted-foreground/70">{e.dollars > 0 ? "hurt if it falls" : "hurt if it rises"}</span>
                </button>
              ))}
            </div>

            {exposure && ladder && plan ? (
              <div className="arrive mt-6">
                <div className="mb-5 flex flex-wrap items-end gap-8">
                  <Choice label="Start covering after a move of">
                    {START_AFTER.map((s) => (
                      <Segment key={s} active={s === startAfter} onClick={() => setStartAfter(s)}>
                        {s === 0 ? "Any" : `${s * 100}%`}
                      </Segment>
                    ))}
                  </Choice>
                  {dated.length > 1 ? (
                    <Choice label="Cover until">
                      <Segment active={!monthEnd} onClick={() => setMonthEnd(false)}>
                        {formatWhen(dated[0].expiry)}
                      </Segment>
                      <Segment active={monthEnd} onClick={() => setMonthEnd(true)}>
                        {new Date(dated[dated.length - 1].expiry).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Segment>
                    </Choice>
                  ) : null}
                </div>
                <PayoffChart points={points} spot={plan.spot} name={name} />
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground/70">
                  The market expects {name} to close near {formatPrice(plan.spot)}. Cover stops at the last price Gemini lists, so a
                  very large move is only partly cushioned.
                </p>
              </div>
            ) : null}
          </Card>
        ) : null}
      </WithTicket>
    </>
  );
}

function describe(read: HoldingRead) {
  if (read.status === "direct") return `Moves with ${UNDERLYINGS[read.underlying].name}`;
  if (read.status === "tracks") {
    const like = formatUsdWhole(Math.abs(read.value * read.fit.beta));
    const share = Math.round(read.fit.r2 * 100);
    return (
      <>
        Behaves like {like} {read.fit.beta > 0 ? "of" : "against"} {UNDERLYINGS[read.underlying].name}, which explains {share}% of its
        daily moves <Tag>Estimate</Tag>
      </>
    );
  }
  if (read.status === "none") return "Nothing Gemini lists moves with this, so it cannot be cushioned here";
  return "No price history found for this ticker";
}

/** Turns an exposure into a strip on the ladder, starting `startAfter` (a fraction) past the expected close. */
function planCushion(exposure: Exposure, ladder: Ladder, startAfter: number) {
  const spot = impliedSpot(ladder);
  if (spot == null || spot <= 0) return null;
  const falling = exposure.dollars > 0;
  const cushion = stripLegs({
    ladder,
    direction: falling ? "fall" : "rise",
    startLevel: spot * (falling ? 1 - startAfter : 1 + startAfter),
    dollarsPerPoint: Math.abs(exposure.dollars) / spot,
  });
  const first = cushion.legs[0]?.strike ?? null;
  const above = first == null ? null : chanceAtOrAbove(ladder, first);
  const p = above == null ? null : falling ? 1 - above : above;
  const chance: Chance = { p, low: null, high: null, uncertain: false };
  return { spot, cushion, first, chance };
}

/** Gain or loss across closing prices. The cushion line is drawn from what the book actually filled. */
function payoffPoints(exposure: Exposure, ladder: Ladder, spot: number, quote: CushionQuote | null): PayoffPoint[] {
  const strikes = ladder.rungs.map((r) => r.strike);
  // Frame the side that hurts, and run past the last strike so the point where cover stops is visible.
  const falling = exposure.dollars > 0;
  const lo = spot * (falling ? 0.93 : 0.97);
  const hi = spot * (falling ? 1.03 : 1.07);
  const legs = quote ? filledLegs(quote) : null;
  const steps = 160;
  // Each strike is sampled just below and at the level, so the steps in the cushion line stay sharp.
  const edges = strikes.filter((k) => k > lo && k < hi).flatMap((k) => [k - (hi - lo) / 5000, k]);
  const prices = [...Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps), ...edges].sort((a, b) => a - b);
  return prices.map((price) => {
    const without = (exposure.dollars * (price - spot)) / spot;
    return { price, without, withCushion: legs && quote ? without + stripPayoutAt(legs, price) - quote.cost : null };
  });
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="inline-flex rounded-xl border border-border bg-muted p-1">{children}</div>
    </div>
  );
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`press tabular rounded-lg px-3 py-1.5 text-[13px] ${active ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
