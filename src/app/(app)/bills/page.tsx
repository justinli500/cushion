"use client";

import { useState, useSyncExternalStore } from "react";
import { CushionTicket } from "@/components/cushion-ticket";
import { Card, CardTitle, Notice, PageHeader, Skeleton, Tag, WithTicket } from "@/components/kit";
import { chanceAtOrAbove } from "@/domains/cushion/probability";
import type { Cushion, CushionQuote } from "@/domains/cushion/types";
import { BILLS, COVER_LEVELS, dayLabel, spotOf, startLevel, type BillKind, type CoverLevel } from "@/domains/exposure/bills";
import { updateProfile, useProfile, type Profile } from "@/domains/profile/profile";
import { formatUsd, formatUsdWhole } from "@/lib/format";
import { Autopilot } from "./autopilot";
import { BillQuestion } from "./bill-question";
import { COPY, LEVEL_NAMES, payIfSentence } from "./copy";
import { Replay } from "./replay";
import { useBillMarkets, type BillMarkets } from "./use-bill-markets";

const ALL_BILLS: BillKind[] = ["gas", "heating"];
const noSubscription = () => () => {};

/** What the cost row for one cover shows, in the order the states can happen. */
type CostView = { kind: "loading" } | { kind: "message"; text: string } | { kind: "quote"; quote: CushionQuote };

function costView(listed: boolean, cover: Cushion | null, quote: CushionQuote | null, m: BillMarkets): CostView {
  if (m.loading) return { kind: "loading" };
  if (m.error) return { kind: "message", text: "Gemini’s markets are unavailable right now." };
  if (!listed) return { kind: "message", text: "Not listed right now." };
  if (!cover) return { kind: "message", text: "No price quoted yet." };
  if (cover.legs.length === 0) return { kind: "message", text: "Nothing is listed at this level right now." };
  if (!quote) return m.booksError ? { kind: "message", text: "Gemini’s order book is unavailable right now." } : { kind: "loading" };
  if (quote.maxPayout === 0) return { kind: "message", text: "Nobody is selling this cover right now." };
  return { kind: "quote", quote };
}

function CostRow({ label, view }: { label: string; view: CostView }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      {view.kind === "loading" ? (
        <Skeleton className="mt-1 h-6 w-28" />
      ) : view.kind === "message" ? (
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{view.text}</p>
      ) : (
        <p className="tabular mt-0.5">
          <span className="text-[20px] font-semibold tracking-tight">{formatUsd(view.quote.cost)}</span>
          <span className="ml-2 text-[13px] text-muted-foreground">pays up to {formatUsd(view.quote.maxPayout)}</span>
          {view.quote.partial ? (
            <span className="ml-2 align-middle">
              <Tag>Thin market</Tag>
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}

const LEVEL_TEXT: Record<CoverLevel, string> = {
  spike: "Pays only if the price jumps 3% or more.",
  full: "Pays as soon as the price starts to rise, so it also catches slow drift. It costs more.",
};

interface CoverCardProps {
  bill: BillKind;
  mode: CoverLevel;
  markets: BillMarkets;
  onPick: (level: CoverLevel) => void;
}

function CoverCard({ mode, markets, onPick }: CoverCardProps) {
  const { daily, monthEnd } = markets.ladders;
  const until = monthEnd ? dayLabel(monthEnd.expiry) : "month end";
  return (
    <Card>
      <CardTitle hint="Live prices from Gemini">How much cover?</CardTitle>
      <div className="grid grid-cols-2 gap-4">
        {COVER_LEVELS.map((level) => {
          const selected = level === mode;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(level)}
              className={`press rounded-2xl border p-4 text-left ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-foreground/30"}`}
            >
              <p className="text-[15px] font-semibold">{LEVEL_NAMES[level]}</p>
              <p className="mt-1 mb-4 text-[13px] leading-relaxed text-muted-foreground">{LEVEL_TEXT[level]}</p>
              <div className="space-y-3">
                <CostRow
                  label={`One purchase through ${until}`}
                  view={costView(monthEnd != null, markets.covers.monthEnd[level], markets.quotes.monthEnd[level], markets)}
                />
                <CostRow
                  label="Autopilot, each day"
                  view={costView(daily != null, markets.covers.daily[level], markets.quotes.daily[level], markets)}
                />
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        A purchase through {until} is bought once and stays in place until then. Daily cover has to be bought again every day.
      </p>
    </Card>
  );
}

function ExposureCard({ bill, amount, exposure, onChange }: { bill: BillKind; amount: number; exposure: number | null; onChange: () => void }) {
  const { name, commodity, jump, jumpText } = COPY[bill];
  const extra = exposure == null ? null : exposure * jump;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <CardTitle>What a price jump costs you</CardTitle>
        <Tag>{BILLS[bill].tag}</Tag>
      </div>
      <p className="-mt-2 text-[14px] leading-relaxed">
        {bill === "gas" ? `You buy about ${amount.toLocaleString("en-US")} gallons a month.` : `Your heating bill is about ${Number.isInteger(amount) ? formatUsdWhole(amount) : formatUsd(amount)} a month.`}{" "}
        {extra == null
          ? "Cushion will size this once it has a live price."
          : `If ${commodity} rose ${jumpText}, your ${name.toLowerCase()} could cost about ${formatUsd(extra)} more this month.`}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {bill === "gas"
          ? "Pump prices follow oil with a delay, so this is a guide and not a forecast."
          : "Utility rates barely follow daily gas prices, so this is a rough guess at the part of your bill that moves."}
      </p>
      <button type="button" onClick={onChange} className="press mt-3 text-[13px] text-muted-foreground underline-offset-2 hover:underline">
        Change amount
      </button>
    </Card>
  );
}

interface DashboardProps {
  bills: Profile["bills"];
  kinds: BillKind[];
  asking: BillKind | null;
  setAsking: (bill: BillKind | null) => void;
  save: (bill: BillKind, amount: number) => void;
}

function Dashboard({ bills, kinds, asking, setAsking, save }: DashboardProps) {
  const [picked, setPicked] = useState<BillKind>("gas");
  const bill = kinds.includes(picked) ? picked : kinds[0];
  const amount = (bill === "gas" ? bills.gasGallonsPerMonth : bills.heatingBillPerMonth) ?? 0;
  const markets = useBillMarkets(bill, amount);
  const { monthEnd } = markets.ladders;
  const mode = bills.mode;

  const until = monthEnd ? dayLabel(monthEnd.expiry) : null;
  const spot = spotOf(monthEnd);
  const from = spot ? startLevel(mode, spot) : null;
  const chance = monthEnd && from ? chanceAtOrAbove(monthEnd, from) : null;
  const ticketView = costView(monthEnd != null, markets.covers.monthEnd[mode], markets.quotes.monthEnd[mode], markets);
  const missing = ALL_BILLS.filter((k) => !kinds.includes(k));

  return (
    <>
      {asking ? (
        <div className="mb-6">
          <BillQuestion
            key={asking}
            bill={asking}
            initial={asking === "gas" ? bills.gasGallonsPerMonth : bills.heatingBillPerMonth}
            onSave={(value) => save(asking, value)}
            onCancel={() => setAsking(null)}
          />
        </div>
      ) : null}
      <WithTicket
        ticket={
          <CushionTicket
            section="bills"
            title={until ? `${COPY[bill].name} cover through ${until}` : `${COPY[bill].name} cover`}
            detail={until && from ? payIfSentence(bill, from, `by ${until}`) : "Cover against a rise in the price behind your bill."}
            cushion={markets.covers.monthEnd[mode]}
            eventTickers={monthEnd ? [monthEnd.eventTicker] : []}
            expiry={monthEnd?.expiry ?? ""}
            chance={chance == null ? undefined : { p: chance, low: null, high: null, uncertain: true }}
            emptyMessage={
              ticketView.kind === "message"
                ? `${ticketView.text} Daily cover on autopilot may still be available.`
                : "Finding the latest prices."
            }
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={kind === bill}
              onClick={() => setPicked(kind)}
              className={`press rounded-xl px-3 py-2 text-[14px] ${kind === bill ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {COPY[kind].name}
            </button>
          ))}
          {missing.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setAsking(kind)}
              className="press rounded-xl px-3 py-2 text-[14px] text-muted-foreground hover:text-foreground"
            >
              Add {COPY[kind].name.toLowerCase()}
            </button>
          ))}
        </div>
        {markets.error ? <Notice>Gemini&rsquo;s markets are unavailable right now. Reload the page in a minute.</Notice> : null}
        <ExposureCard bill={bill} amount={amount} exposure={markets.exposure} onChange={() => setAsking(bill)} />
        <CoverCard bill={bill} mode={mode} markets={markets} onPick={(level) => updateProfile("bills", { ...bills, mode: level })} />
        <Autopilot bills={bills} />
        <Replay bill={bill} exposure={markets.exposure} />
      </WithTicket>
    </>
  );
}

export default function BillsPage() {
  // The profile lives in the browser, so the server render cannot know whether to ask or to show.
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);
  const { bills } = useProfile();
  const [asking, setAsking] = useState<BillKind | null>(null);
  const kinds = ALL_BILLS.filter((k) => (k === "gas" ? bills.gasGallonsPerMonth : bills.heatingBillPerMonth));

  const save = (bill: BillKind, amount: number) => {
    updateProfile("bills", { ...bills, [bill === "gas" ? "gasGallonsPerMonth" : "heatingBillPerMonth"]: amount });
    setAsking(null);
  };

  return (
    <>
      <PageHeader title="Bills" lead="Tell us what you pay each month. If the price behind it jumps, a cushion pays you back part of the difference." />
      {!mounted ? (
        <Skeleton className="h-40 w-full max-w-xl" />
      ) : kinds.length === 0 ? (
        <BillQuestion
          key={asking ?? "gas"}
          bill={asking ?? "gas"}
          initial={null}
          onSave={(value) => save(asking ?? "gas", value)}
          onSwitch={() => setAsking(asking === "heating" ? "gas" : "heating")}
        />
      ) : (
        <Dashboard bills={bills} kinds={kinds} asking={asking} setAsking={setAsking} save={save} />
      )}
    </>
  );
}
