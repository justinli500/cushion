"use client";

import { useEffect, useRef } from "react";
import { Card, CardTitle, Notice, Skeleton } from "@/components/kit";
import { buyCushion } from "@/domains/account/buy";
import { useAccount } from "@/domains/account/store";
import {
  autopilotStatus,
  autopilotTarget,
  coverDay,
  spotOf,
  startLevel,
  type AutopilotStatus,
  type BillKind,
} from "@/domains/exposure/bills";
import { storedProfile, updateProfile, type Profile } from "@/domains/profile/profile";
import { formatUsd } from "@/lib/format";
import { COPY, payIfSentence } from "./copy";
import { useBillMarkets } from "./use-bill-markets";

const LOCK = "cushion-bills-autopilot";

/** What another tab last saved as `lastRun`, or undefined when storage cannot be read. */
const storedLastRun = (): string | null | undefined => storedProfile()?.bills.lastRun;

/** One tab at a time runs the check and the purchase, so two open tabs cannot both buy. */
const exclusively = (work: () => void): Promise<void> =>
  navigator.locks ? navigator.locks.request(LOCK, work) : Promise.resolve(work());

const autopilotTitle = (name: string) => `${name} autopilot cover`;

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Autopilot"
      onClick={onChange}
      className={`press relative h-7 w-12 shrink-0 rounded-full ${on ? "bg-primary" : "bg-track"}`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-[left] duration-200 ${on ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

/**
 * The one place outside the ticket that buys. It runs whenever Bills is open, so it only adds
 * cover on days the person visits.
 */
export function Autopilot({ bills }: { bills: Profile["bills"] }) {
  const target = autopilotTarget(bills);
  if (!target) return null;
  return <AutopilotCard bills={bills} bill={target.bill} amount={target.amount} />;
}

function AutopilotCard({ bills, bill, amount }: { bills: Profile["bills"]; bill: BillKind; amount: number }) {
  const { balance, positions } = useAccount();
  // Only a heating bill has a fuel: oil and propane heat are cushioned on the oil market.
  const heat = bill === "heating" ? bills.heat : null;
  const markets = useBillMarkets(bill, amount, heat);
  const { daily } = markets.ladders;
  const quote = markets.quotes.daily[bills.mode];
  const cover = markets.covers.daily[bills.mode];
  const { name } = COPY[bill];

  const status = autopilotStatus({ on: bills.autopilot, lastRun: bills.lastRun, daily, quote, balance });
  const boughtFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "ready" || !daily || !quote) return;
    const day = coverDay(daily);
    // A re-render or a second effect pass sees the same stale props, so this tab remembers the day itself.
    if (boughtFor.current === day) return;
    boughtFor.current = day;
    const spot = spotOf(daily) ?? 0;
    void exclusively(() => {
      const boughtElsewhere = storedLastRun() === day;
      updateProfile("bills", { ...bills, lastRun: day });
      if (boughtElsewhere) return;
      buyCushion({
        section: "bills",
        title: autopilotTitle(name),
        detail: payIfSentence(bill, startLevel(bills.mode, spot), "today", heat),
        quote,
        eventTickers: [daily.eventTicker],
        expiry: daily.expiry,
      });
    });
  }, [status, daily, quote, bills, bill, name, heat]);

  const added = positions.find(
    (p) => p.section === "bills" && p.title === autopilotTitle(name) && p.expiry.slice(0, 10) === bills.lastRun,
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-6">
        <div>
          <CardTitle>Autopilot for {name.toLowerCase()}</CardTitle>
          <p className="-mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Adds the day&rsquo;s cover for your {name.toLowerCase()} once a day, the first time this page is open. Daily cover has to be
            bought again every day and pays out on each day the price jumps.
          </p>
        </div>
        <Switch on={bills.autopilot} onChange={() => updateProfile("bills", { ...bills, autopilot: !bills.autopilot })} />
      </div>
      <div className="mt-4">
        {markets.loading || (cover && markets.booksLoading && !quote) ? (
          <Skeleton className="h-5 w-2/3" />
        ) : (
          <StatusLine status={status} addedCost={added?.cost} quote={quote} balance={balance} />
        )}
      </div>
    </Card>
  );
}

interface LineProps {
  status: AutopilotStatus;
  addedCost: number | undefined;
  quote: { cost: number; maxPayout: number } | null;
  balance: number;
}

function StatusLine({ status, addedCost, quote, balance }: LineProps) {
  if (status === "done") {
    return (
      <p className="arrive rounded-[18px] bg-yes px-4 py-3 text-[14px] font-semibold text-yes-foreground">
        {addedCost == null ? "Autopilot already added today’s cover." : `Autopilot added today’s cover for ${formatUsd(addedCost)}.`}
      </p>
    );
  }
  if (status === "between-days") {
    return <Notice>Today&rsquo;s cover has closed. Autopilot will add the next one when Gemini lists it.</Notice>;
  }
  if (status === "no-cover") {
    return <Notice>Nobody is selling today&rsquo;s cover on Gemini right now. Autopilot will keep looking.</Notice>;
  }
  const price =
    quote && quote.maxPayout > 0 ? `Today’s cover costs ${formatUsd(quote.cost)} and pays up to ${formatUsd(quote.maxPayout)}.` : null;
  if (status === "too-expensive") {
    return (
      <Notice>
        {price} You have {formatUsd(balance)} of play money, so Autopilot is waiting.
      </Notice>
    );
  }
  if (status === "ready") return <Notice>Adding today&rsquo;s cover.</Notice>;
  if (status === "off") return <Notice>{price ? `${price} Turning Autopilot on adds it straight away.` : "Turn Autopilot on and it adds today’s cover straight away."}</Notice>;
  return <Notice>Checking today&rsquo;s price.</Notice>;
}
