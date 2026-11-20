"use client";

import { useState, useSyncExternalStore } from "react";
import { CarRender } from "@/components/car-render";
import { HomeRender } from "@/components/home-render";
import { CushionTicket } from "@/components/cushion-ticket";
import { Card, CardTitle, Chip, Notice, PageHeader, Skeleton, Tag, ToggleCard, ToggleTag, WithTicket } from "@/components/kit";
import { chanceAtOrAbove } from "@/domains/cushion/probability";
import type { Cushion, CushionQuote } from "@/domains/cushion/types";
import { carOf } from "@/domains/exposure/bills-car";
import { homeOf, warmthOf, winterOf, WINTERS } from "@/domains/exposure/bills-home";
import { BILLS, COVER_LEVELS, dayLabel, spotOf, startLevel, type BillKind, type CoverLevel } from "@/domains/exposure/bills";
import { updateProfile, useProfile, type Profile } from "@/domains/profile/profile";
import { formatUsd, formatUsdWhole } from "@/lib/format";
import { Autopilot } from "./autopilot";
import { BillQuestion } from "./bill-question";
import { COPY, LEVEL_NAMES, payIfSentence } from "./copy";
import { GasSetup } from "./gas-setup";
import { HeatingSetup } from "./heating-setup";
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
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {view.kind === "loading" ? (
        <Skeleton className="mt-1 h-7 w-28" />
      ) : view.kind === "message" ? (
        <p className="mt-1 text-[14px] leading-snug text-body">{view.text}</p>
      ) : (
        <p className="tabular mt-0.5 flex flex-col items-start gap-0.5">
          <span className="display text-[24px] font-bold tracking-[-0.02em]">{formatUsd(view.quote.cost)}</span>
          <span className="text-[14px] font-semibold text-covered">Pays up to {formatUsd(view.quote.maxPayout)}</span>
          {view.quote.partial ? <Tag>Thin market</Tag> : null}
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
    <section>
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="display text-[22px] font-semibold tracking-[-0.01em]">How much cover?</h2>
        <span className="text-[13px] text-muted-foreground">Live prices from Gemini</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
        {COVER_LEVELS.map((level) => {
          const selected = level === mode;
          return (
            <ToggleCard key={level} pressed={selected} onToggle={() => onPick(level)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="display text-[18px] font-semibold">{LEVEL_NAMES[level]}</span>
                  <span className="text-[14px] text-body">{LEVEL_TEXT[level]}</span>
                </div>
                <ToggleTag pressed={selected} off="Choose" on="Chosen" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3 rounded-[18px] bg-muted p-4">
                <CostRow
                  label={`One purchase through ${until}`}
                  view={costView(monthEnd != null, markets.covers.monthEnd[level], markets.quotes.monthEnd[level], markets)}
                />
                <CostRow
                  label="Autopilot, each day"
                  view={costView(daily != null, markets.covers.daily[level], markets.quotes.daily[level], markets)}
                />
              </div>
            </ToggleCard>
          );
        })}
      </div>
      <p className="mt-3.5 text-[13px] leading-relaxed text-muted-foreground">
        A purchase through {until} is bought once and stays in place until then. Daily cover has to be bought again every day.
      </p>
    </section>
  );
}

type Bills = Profile["bills"];
/** Saves an amount for one bill, with anything else about it that changed. */
type Save = (bill: BillKind, amount: number, also?: Partial<Bills>) => void;

/** Asks how much of one bill the person has: by car and distance for gas, by home and thermostat for heating, unless they would rather type the amount. */
function Ask({ bill, bills, save, onCancel }: { bill: BillKind; bills: Bills; save: Save; onCancel?: () => void }) {
  const [typing, setTyping] = useState(false);
  if (bill === "gas" && !typing) {
    return <GasSetup car={bills.car} miles={bills.milesPerMonth} onSave={(gallons, car, milesPerMonth) => save("gas", gallons, { car, milesPerMonth })} onManual={() => setTyping(true)} onCancel={onCancel} />;
  }
  if (bill === "heating" && !typing) {
    return <HeatingSetup saved={bills} onSave={(amount, choice) => save("heating", amount, choice)} onManual={() => setTyping(true)} onCancel={onCancel} />;
  }
  return (
    <BillQuestion
      key={bill}
      bill={bill}
      initial={bill === "gas" ? bills.gasGallonsPerMonth : bills.heatingBillPerMonth}
      // Typed gallons are no longer the car's, so the car is forgotten.
      onSave={(value) => save(bill, value, bill === "gas" ? { car: null, milesPerMonth: null } : { home: null, winter: null, heat: null, thermostat: null })}
      onCancel={onCancel}
    />
  );
}

interface ExposureProps {
  bill: BillKind;
  amount: number;
  exposure: number | null;
  /** The car and distance the gallons came from, when they did. */
  drive: { car: string; miles: number } | null;
  /** The home the heating bill came from, when it did. */
  living: { home: string; winter: string; thermostat: number } | null;
  onChange: () => void;
}

function ExposureCard({ bill, amount, exposure, drive, living, onChange }: ExposureProps) {
  const { name, commodity, jump, jumpText } = COPY[bill];
  const extra = exposure == null ? null : exposure * jump;
  const car = drive ? carOf(drive.car) : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <CardTitle>What a price jump costs you</CardTitle>
        <Tag>{BILLS[bill].tag}</Tag>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[18px] bg-muted p-4">
        {car ? <CarRender kind={car.id} className="w-[170px] shrink-0" /> : null}
        {living ? (
          <span className="w-[170px] shrink-0 overflow-hidden rounded-[14px] bg-panel">
            <HomeRender kind={living.home} warmth={warmthOf(living.thermostat)} snow={WINTERS.findIndex((w) => w.id === winterOf(living.winter).id)} className="block w-full" />
          </span>
        ) : null}
        <p className="min-w-0 flex-[1_1_300px] text-[15px] leading-relaxed text-body">
          {car && drive
            ? `You drive a ${car.name.toLowerCase()} about ${drive.miles.toLocaleString("en-US")} miles a month, which is about ${amount.toLocaleString("en-US")} gallons.`
            : living
              ? `You keep a ${homeOf(living.home).name.toLowerCase()} at ${living.thermostat}°F through a ${winterOf(living.winter).name.toLowerCase()} winter, which is about ${formatUsdWhole(amount)} a month.`
              : bill === "gas"
              ? `You buy about ${amount.toLocaleString("en-US")} gallons a month.`
              : `Your heating bill is about ${Number.isInteger(amount) ? formatUsdWhole(amount) : formatUsd(amount)} a month.`}{" "}
          {extra == null ? "Cushion will size this once it has a live price." : `If ${commodity} rose ${jumpText}, your ${name.toLowerCase()} could cost about this much more this month.`}
        </p>
        {extra == null ? null : (
          <p className="flex flex-col">
            <span className="text-[13px] font-semibold text-risk">You&rsquo;d pay about</span>
            <span className="display tabular text-[30px] font-bold leading-tight tracking-[-0.02em]">{formatUsd(extra)} more</span>
          </p>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        {bill === "gas"
          ? "Pump prices follow oil with a delay, so this is a guide and not a forecast."
          : "Utility rates barely follow daily gas prices, so this is a rough guess at the part of your bill that moves."}
      </p>
      <button type="button" onClick={onChange} className="press mt-3 min-h-11 text-[14px] font-semibold text-foreground underline underline-offset-4">
        {car ? "Change car or miles" : living ? "Change home or thermostat" : "Change amount"}
      </button>
    </Card>
  );
}

interface DashboardProps {
  bills: Profile["bills"];
  kinds: BillKind[];
  asking: BillKind | null;
  setAsking: (bill: BillKind | null) => void;
  save: Save;
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
        <div className="mb-5">
          <Ask key={asking} bill={asking} bills={bills} save={save} onCancel={() => setAsking(null)} />
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
            covers={markets.exposure == null ? undefined : { of: markets.exposure * COPY[bill].jump, label: `a ${formatUsdWhole(markets.exposure * COPY[bill].jump)} jump` }}
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
            <Chip key={kind} pressed={kind === bill} onClick={() => setPicked(kind)}>
              {COPY[kind].name}
            </Chip>
          ))}
          {missing.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setAsking(kind)}
              className="press min-h-11 px-3 text-[15px] font-semibold text-foreground underline underline-offset-4"
            >
              Add {COPY[kind].name.toLowerCase()}
            </button>
          ))}
        </div>
        {markets.error ? <Notice>Gemini&rsquo;s markets are unavailable right now. Reload the page in a minute.</Notice> : null}
        <ExposureCard
          bill={bill}
          amount={amount}
          exposure={markets.exposure}
          drive={bill === "gas" && bills.car && bills.milesPerMonth ? { car: bills.car, miles: bills.milesPerMonth } : null}
          living={bill === "heating" && bills.home && bills.winter && bills.thermostat ? { home: bills.home, winter: bills.winter, thermostat: bills.thermostat } : null}
          onChange={() => setAsking(bill)}
        />
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

  const save: Save = (bill, amount, also) => {
    updateProfile("bills", { ...bills, ...also, [bill === "gas" ? "gasGallonsPerMonth" : "heatingBillPerMonth"]: amount });
    setAsking(null);
  };
  const first = asking ?? "gas";

  return (
    <>
      <PageHeader title="Cushion your bills" lead="Tell us what you pay each month. If the price behind it jumps, a cushion pays you back part of the difference." />
      {!mounted ? (
        <Skeleton className="h-40 w-full max-w-xl" />
      ) : kinds.length === 0 ? (
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="Which bill to cushion" className="flex flex-wrap gap-2">
            {ALL_BILLS.map((kind) => (
              <Chip key={kind} pressed={kind === first} onClick={() => setAsking(kind)}>
                {kind === "gas" ? "Gas for your car" : "Heating for your home"}
              </Chip>
            ))}
          </div>
          <Ask key={first} bill={first} bills={bills} save={save} />
        </div>
      ) : (
        <Dashboard bills={bills} kinds={kinds} asking={asking} setAsking={setAsking} save={save} />
      )}
    </>
  );
}
