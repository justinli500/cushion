import { stripLegs } from "@/domains/cushion/legs";
import { impliedSpot } from "@/domains/cushion/probability";
import type { Cushion, CushionQuote } from "@/domains/cushion/types";
import type { Ladder, UnderlyingId } from "@/domains/markets/types";

export type BillKind = "gas" | "heating";
/** Same literals as `profile.bills.mode`. */
export type CoverLevel = "spike" | "full";

export const COVER_LEVELS: CoverLevel[] = ["spike", "full"];

/** `max` is the most a person can enter: gallons a month for gas, dollars a month for heating. */
export const BILLS: Record<BillKind, { underlying: UnderlyingId; tag: "Estimate" | "Rough estimate"; max: number }> = {
  gas: { underlying: "BRENT", tag: "Estimate", max: 5000 },
  heating: { underlying: "NGAS", tag: "Rough estimate", max: 10_000 },
};

/**
 * The market a bill follows. A heating bill follows natural gas, unless the home burns oil or
 * propane: those follow oil. `heat` is the `HEAT` id saved in the profile. Gemini lists no
 * electricity market, so electric heat stays on natural gas, which power prices loosely follow.
 */
export const underlyingFor = (bill: BillKind, heat?: string | null): UnderlyingId => (bill === "heating" && heat === "oil" ? "BRENT" : BILLS[bill].underlying);

/** Typed-in amount to a number, or null when it is empty, not a number, zero, negative or past the limit. */
export function parseAmount(bill: BillKind, text: string): number | null {
  const amount = text.trim() === "" ? NaN : Number(text);
  return Number.isFinite(amount) && amount > 0 && amount <= BILLS[bill].max ? Math.round(amount * 100) / 100 : null;
}

/** A barrel is 42 gallons, so $1 on a barrel is about $0.024 on each gallon. */
const GAS_DOLLARS_PER_GALLON_PER_POINT = 0.024;
/** The rough share of a heating bill that follows the commodity. The rest is fixed charges and set rates. */
const HEATING_COMMODITY_SHARE = 0.4;
/** For a home that burns oil: about half the price of heating oil is the crude itself. Rough, like the share above. */
const HEATING_OIL_SHARE = 0.5;
/** "Spikes only" cover starts at a jump of 3%. */
const SPIKE_JUMP = 1.03;

/** Dollars added to the monthly bill for each $1 the commodity rises. `amount` is gallons for gas, dollars for heating. */
export function dollarsPerPoint(bill: BillKind, amount: number, spot: number, heat?: string | null): number {
  if (bill === "gas") return amount * GAS_DOLLARS_PER_GALLON_PER_POINT;
  return (amount * (heat === "oil" ? HEATING_OIL_SHARE : HEATING_COMMODITY_SHARE)) / spot;
}

export function startLevel(level: CoverLevel, spot: number): number {
  return level === "spike" ? spot * SPIKE_JUMP : spot;
}

export interface BillCover {
  ladder: Ladder;
  spot: number;
  level: CoverLevel;
  dollarsPerPoint: number;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-11-30" to "Nov 30". */
export const dayLabel = (isoDate: string) => dayFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));

export const billCushion = ({ ladder, spot, level, dollarsPerPoint }: BillCover): Cushion =>
  stripLegs({ ladder, direction: "rise", startLevel: startLevel(level, spot), dollarsPerPoint });

export interface BillAmounts {
  gasGallonsPerMonth: number | null;
  heatingBillPerMonth: number | null;
}

/** One autopilot covers one bill: gas when the person gave it, otherwise heating. */
export function autopilotTarget({ gasGallonsPerMonth, heatingBillPerMonth }: BillAmounts): { bill: BillKind; amount: number } | null {
  if (gasGallonsPerMonth) return { bill: "gas", amount: gasGallonsPerMonth };
  if (heatingBillPerMonth) return { bill: "heating", amount: heatingBillPerMonth };
  return null;
}

/** The market's own estimate of the price, or null when the ladder has no usable quotes. */
export const spotOf = (ladder: Ladder | null): number | null => (ladder ? impliedSpot(ladder) : null);

/** The cover for one bill on one ladder, or null when the ladder is missing or has no usable price. */
export function coverFor(bill: BillKind, amount: number, ladder: Ladder | null, level: CoverLevel, heat?: string | null): Cushion | null {
  const spot = spotOf(ladder);
  return ladder && spot ? billCushion({ ladder, spot, level, dollarsPerPoint: dollarsPerPoint(bill, amount, spot, heat) }) : null;
}

// A day ladder is listed about an hour before the previous one expires, so a ladder more than a
// day out is the month-end one.
const DAILY_WINDOW_MS = 26 * 60 * 60 * 1000;

export interface BillLadders {
  daily: Ladder | null;
  monthEnd: Ladder | null;
}

/** The day ladder with the latest expiry that is still open, and the nearest month-end ladder. */
export function pickLadders(ladders: Ladder[], underlying: UnderlyingId, now: number): BillLadders {
  const open = ladders
    .filter((l) => l.underlying === underlying && l.horizon === "dated" && Date.parse(l.expiry) > now)
    .sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry));
  const soon = open.filter((l) => Date.parse(l.expiry) - now <= DAILY_WINDOW_MS);
  return { daily: soon.at(-1) ?? null, monthEnd: open.find((l) => Date.parse(l.expiry) - now > DAILY_WINDOW_MS) ?? null };
}

/** The UTC date (YYYY-MM-DD) a day ladder expires on. Autopilot stores it in `lastRun`. */
export const coverDay = (ladder: Pick<Ladder, "expiry">): string => ladder.expiry.slice(0, 10);

export type AutopilotStatus = "off" | "between-days" | "done" | "pricing" | "no-cover" | "too-expensive" | "ready";

export interface AutopilotInput {
  on: boolean;
  lastRun: string | null;
  daily: Pick<Ladder, "expiry"> | null;
  /** The day cover priced against the live book, or null while the book is loading. */
  quote: CushionQuote | null;
  balance: number;
}

/**
 * Whether the autopilot should buy now. It keys on the day the cover expires, not the clock
 * date: in the hours after 22:00 UTC tomorrow's ladder is already listed, and keying on the
 * clock would buy that same ladder a second time after midnight.
 */
export function autopilotStatus({ on, lastRun, daily, quote, balance }: AutopilotInput): AutopilotStatus {
  if (!on) return "off";
  if (!daily) return "between-days";
  if (lastRun === coverDay(daily)) return "done";
  if (!quote) return "pricing";
  if (quote.maxPayout <= 0 || quote.cost <= 0) return "no-cover";
  if (quote.cost > balance) return "too-expensive";
  return "ready";
}
